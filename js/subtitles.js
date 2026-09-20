// Generic WebVTT / SRT subtitle parsing, used to seed the manual-transcript
// textarea from an uploaded subtitle file (handy for local files and direct
// video URLs, which have no captions API to fetch from automatically).

const SUBTITLE_TIMESTAMP_RE =
  /((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})/;

function parseSubtitleTimestamp(str) {
  const parts = str.replace(',', '.').split(':').map(Number);
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

// Works for both WebVTT and SRT: cue index lines and the "WEBVTT" header
// simply don't match the timestamp-arrow regex and are skipped.
function parseSubtitleText(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(SUBTITLE_TIMESTAMP_RE);
    if (m) {
      const start = parseSubtitleTimestamp(m[1]);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== '' && !SUBTITLE_TIMESTAMP_RE.test(lines[i])) {
        textLines.push(lines[i]);
        i++;
      }
      const cleanText = textLines
        .join(' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanText && start != null) cues.push({ start, text: cleanText });
    } else {
      i++;
    }
  }
  return cues;
}

function cuesToManualText(cues) {
  return cues.map((c) => `[${formatTime(Math.round(c.start))}] ${c.text}`).join('\n');
}
