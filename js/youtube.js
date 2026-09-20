// YouTube helpers: video id parsing, oEmbed metadata, transcript fetching,
// manual-transcript parsing, and a thin wrapper around the IFrame Player API.

function parseVideoId(input) {
  if (!input) return null;
  const raw = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.slice(1).split('/')[0] || null;
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.searchParams.get('v')) return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live');
      if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch (e) {
    // not a URL
  }
  return null;
}

async function fetchOEmbed(videoId) {
  const target = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    'https://www.youtube.com/watch?v=' + videoId
  )}&format=json`;
  try {
    const res = await fetchWithTimeout(target, 8000);
    if (res.ok) return await res.json();
  } catch (e) {
    // fall through to proxy attempt
  }
  const text = await fetchWithProxies(target);
  return JSON.parse(text);
}

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

async function fetchWithProxies(url, timeoutMs = 12000) {
  let lastError = null;
  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const res = await fetchWithTimeout(buildProxyUrl(url), timeoutMs);
      if (res.ok) return await res.text();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('All proxies failed');
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

// Extracts a balanced bracketed JSON substring (array or object) starting at
// `startIdx` (which must point at the opening bracket), respecting quoted
// strings and escape characters so commas/brackets inside string values
// don't confuse the depth count.
function extractBalancedJson(str, startIdx, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) return str.slice(startIdx, i + 1);
    }
  }
  throw new Error('Unbalanced JSON while parsing page data.');
}

function parseTimeToSeconds(str) {
  const parts = str.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

// Attempts to fetch the caption track list + text for a video by scraping the
// watch page through a CORS proxy (YouTube does not expose these endpoints to
// arbitrary browser origins directly). This is best-effort: it may fail if all
// public proxies are unavailable, in which case the UI falls back to manual
// transcript paste.
async function fetchTranscript(videoId, preferredLangs = ['en', 'zh-Hans', 'zh-Hant', 'zh']) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const html = await fetchWithProxies(watchUrl);

  const marker = '"captionTracks":';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error('No caption tracks found for this video.');
  }
  const arrayStart = html.indexOf('[', markerIdx + marker.length);
  if (arrayStart === -1) throw new Error('No caption tracks found for this video.');
  const arrayJson = extractBalancedJson(html, arrayStart, '[', ']');
  let tracks;
  try {
    tracks = JSON.parse(arrayJson.replace(/\\u0026/g, '&'));
  } catch (e) {
    throw new Error('Could not parse caption track list.');
  }
  if (!tracks.length) throw new Error('This video has no captions available.');

  let track =
    tracks.find((tr) => !tr.kind && preferredLangs.includes(tr.languageCode)) ||
    tracks.find((tr) => preferredLangs.includes(tr.languageCode)) ||
    tracks.find((tr) => !tr.kind) ||
    tracks[0];

  const baseUrl = track.baseUrl.replace(/\\u0026/g, '&');
  const transcriptText = await fetchWithProxies(`${baseUrl}&fmt=json3`);
  let data;
  try {
    data = JSON.parse(transcriptText);
  } catch (e) {
    throw new Error('Could not parse transcript data.');
  }

  const segments = (data.events || [])
    .filter((ev) => ev.segs && ev.segs.length)
    .map((ev) => ({
      start: (ev.tStartMs || 0) / 1000,
      dur: (ev.dDurationMs || 0) / 1000,
      text: ev.segs.map((s) => s.utf8).join('').replace(/\n/g, ' ').trim(),
    }))
    .filter((seg) => seg.text.length > 0);

  if (!segments.length) throw new Error('Transcript was empty.');

  return { segments, lang: track.languageCode, isAsr: track.kind === 'asr' };
}

// Parses manually pasted transcript text. Supports lines prefixed with
// "[mm:ss]", "mm:ss", or "hh:mm:ss"; falls back to treating each
// non-empty line/paragraph as an untimed segment.
function parseManualTranscript(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const timePrefix = /^\[?(\d{1,2}(?::\d{2}){1,2})\]?\s*[-–:]?\s*(.*)$/;
  const segments = [];
  let anyTimed = false;
  for (const line of lines) {
    const m = line.match(timePrefix);
    if (m) {
      const seconds = parseTimeToSeconds(m[1]);
      if (seconds !== null && m[2]) {
        segments.push({ start: seconds, dur: 0, text: m[2].trim() });
        anyTimed = true;
        continue;
      }
    }
    segments.push({ start: null, dur: 0, text: line });
  }
  return { segments, hasTimestamps: anyTimed };
}

// --- YouTube IFrame Player API wrapper ---
let ytApiReady = false;
let ytPlayer = null;
let pendingVideoId = null;
let pendingElementId = null;

window.onYouTubeIframeAPIReady = function () {
  ytApiReady = true;
  if (pendingVideoId) {
    createYtPlayer(pendingVideoId, pendingElementId);
    pendingVideoId = null;
  }
};

function loadPlayer(videoId, elementId) {
  if (!ytApiReady || typeof YT === 'undefined' || !YT.Player) {
    pendingVideoId = videoId;
    pendingElementId = elementId;
    return;
  }
  createYtPlayer(videoId, elementId);
}

function createYtPlayer(videoId, elementId) {
  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById(videoId);
    return;
  }
  ytPlayer = new YT.Player(elementId, {
    videoId,
    playerVars: { rel: 0 },
  });
}

function seekPlayerTo(seconds) {
  if (ytPlayer && ytPlayer.seekTo) {
    ytPlayer.seekTo(seconds, true);
    if (ytPlayer.playVideo) ytPlayer.playVideo();
  }
}

function destroyYtPlayer() {
  if (ytPlayer && ytPlayer.destroy) {
    try {
      ytPlayer.destroy();
    } catch (e) {
      /* ignore */
    }
  }
  ytPlayer = null;
}
