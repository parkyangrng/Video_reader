// Builds a transcript from scratch when none exists, by capturing the local
// video file's own decoded audio (via Web Audio) while it plays sped-up in
// the background (silently, by simply not routing to the speakers — see
// getOrCreateAudioTap for why that matters), then sending the recorded
// audio to OpenAI's Whisper transcription API in time-bounded chunks.
//
// Deliberately scoped to local files: a local file's blob: URL is
// same-origin, so Web Audio can read its audio data outright. A remote
// "Video URL" source would need the remote server to send permissive CORS
// headers for this to work at all (otherwise Web Audio silently produces
// zeroes, per spec) — since we can't rely on that, and setting
// crossOrigin="anonymous" on the <video> risks breaking playback entirely
// on servers that don't support CORS, that source type sticks to manual
// transcript entry / subtitle upload instead.

function isAudioCaptureSupported() {
  return !!(window.AudioContext || window.webkitAudioContext) && typeof MediaRecorder !== 'undefined';
}

function pickAudioMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || '';
}

// createMediaElementSource() may only be called once per <video> element
// ever (it throws on a second call). Cache the tap on the element itself so
// re-running "generate transcript from audio" on the same video works.
//
// The capture-time destination (dest) is connected immediately, but the
// normal speaker destination is deliberately NOT connected until capture
// finishes (see recordAudioFromVideo's cleanup). Two reasons: it keeps the
// sped-up audio from blaring out of the speakers while this runs in the
// background, and — the actual bug this fixes — it means we never touch
// the video element's own `.muted` property to achieve that silence.
// Setting `.muted = true` on the element before capture was the original
// approach, but on Chromium `muted` can make the browser skip decoding the
// audio track entirely (an autoplay-policy optimization), which fed
// near-silence into the recording; Whisper's well-known response to
// silence is to hallucinate short filler phrases ("you", "thanks for
// watching") repeated at every timestamp — exactly the symptom this was
// causing. Not connecting to a destination at all guarantees silence
// without going anywhere near `.muted`.
function getOrCreateAudioTap(videoEl) {
  if (videoEl._audioTap) return videoEl._audioTap;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  const source = audioCtx.createMediaElementSource(videoEl);
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(dest);
  const tap = { audioCtx, source, dest, speakersConnected: false };
  videoEl._audioTap = tap;
  return tap;
}

// Plays `videoEl` from the start and records its audio in chunks of
// `chunkSeconds` of *source video* time, so long videos still produce
// Whisper-sized (well under its 25MB cap) pieces. Resolves with an array of
// { blob, offsetSeconds } in playback order. Nothing is routed to the
// speakers for the duration (see getOrCreateAudioTap), and playback is sped
// up via playbackRate to finish faster than real-time.
function recordAudioFromVideo(videoEl, { chunkSeconds = 900, playbackRate = 4, onProgress, signal } = {}) {
  if (!isAudioCaptureSupported()) {
    return Promise.reject(new Error('This browser does not support in-browser audio capture (Web Audio API / MediaRecorder).'));
  }
  const mimeType = pickAudioMimeType();
  if (!mimeType) {
    return Promise.reject(new Error('No supported audio recording format found in this browser.'));
  }

  const tap = getOrCreateAudioTap(videoEl);
  const { audioCtx, dest } = tap;
  const originalRate = videoEl.playbackRate;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let currentChunkParts = [];
    let currentRecorder = null;
    let nextChunkAt = chunkSeconds;
    let currentOffset = 0;
    let settled = false;

    const startRecorder = (offsetSeconds) => {
      currentChunkParts = [];
      currentRecorder = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 32000 });
      currentRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) currentChunkParts.push(e.data);
      };
      currentRecorder.onstop = () => {
        if (currentChunkParts.length) {
          chunks.push({ blob: new Blob(currentChunkParts, { type: mimeType }), offsetSeconds });
        }
      };
      currentRecorder.start();
    };

    const finalizeCurrentChunk = () => {
      if (currentRecorder && currentRecorder.state !== 'inactive') currentRecorder.stop();
    };

    const cleanup = () => {
      videoEl.removeEventListener('timeupdate', onTimeUpdate);
      videoEl.removeEventListener('ended', onEnded);
      videoEl.removeEventListener('error', onVideoError);
      if (signal) signal.removeEventListener('abort', onAbort);
      videoEl.pause();
      videoEl.playbackRate = originalRate;
      videoEl.currentTime = 0;
      if (!tap.speakersConnected) {
        tap.source.connect(tap.audioCtx.destination);
        tap.speakersConnected = true;
      }
    };

    const settleReject = (err) => {
      if (settled) return;
      settled = true;
      finalizeCurrentChunk();
      cleanup();
      reject(err);
    };

    const onAbort = () => settleReject(new DOMException('Aborted', 'AbortError'));

    const onTimeUpdate = () => {
      if (settled) return;
      onProgress?.({ currentTime: videoEl.currentTime, duration: videoEl.duration });
      if (videoEl.currentTime >= nextChunkAt) {
        finalizeCurrentChunk();
        currentOffset = nextChunkAt;
        nextChunkAt += chunkSeconds;
        startRecorder(currentOffset);
      }
    };

    const onEnded = () => {
      if (settled) return;
      settled = true;
      finalizeCurrentChunk();
      // Let the final recorder's onstop push its chunk before resolving.
      setTimeout(() => {
        cleanup();
        resolve(chunks);
      }, 50);
    };

    const onVideoError = () => settleReject(new Error('Video playback error while recording audio.'));

    if (signal) {
      if (signal.aborted) {
        settleReject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    videoEl.addEventListener('timeupdate', onTimeUpdate);
    videoEl.addEventListener('ended', onEnded);
    videoEl.addEventListener('error', onVideoError);

    videoEl.pause();
    videoEl.currentTime = 0;
    startRecorder(0);

    audioCtx
      .resume()
      .then(() => videoEl.play())
      .then(() => {
        try {
          videoEl.playbackRate = playbackRate;
        } catch (e) {
          /* some browsers reject unusual rates; keep the default */
        }
      })
      .catch((err) => settleReject(new Error(`Could not play video to capture audio: ${err.message}`)));
  });
}

// Orchestrates the full pipeline: record chunked audio from the video, send
// each chunk to Whisper, and merge the results back into our normal
// { start, dur, text } segment shape with correct absolute timestamps.
async function transcribeVideoAudio({ videoEl, apiKey, onProgress, signal }) {
  const chunks = await recordAudioFromVideo(videoEl, {
    chunkSeconds: 900,
    playbackRate: 4,
    signal,
    onProgress: (p) => {
      const fraction = p.duration ? p.currentTime / p.duration : 0;
      onProgress?.({ stage: 'recording', fraction });
    },
  });

  const segments = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({ stage: 'transcribing', chunkIndex: i + 1, totalChunks: chunks.length });
    const result = await transcribeAudioChunk({
      apiKey,
      blob: chunks[i].blob,
      filename: `chunk-${i}.webm`,
      signal,
    });
    (result.segments || []).forEach((s) => {
      const text = (s.text || '').trim();
      if (text) {
        segments.push({
          start: (s.start || 0) + chunks[i].offsetSeconds,
          dur: Math.max(0, (s.end || 0) - (s.start || 0)),
          text,
        });
      }
    });
  }
  segments.sort((a, b) => a.start - b.start);

  // Defense in depth against the silence-hallucination failure mode: even
  // with a correctly wired capture graph, a video with an unusually quiet
  // or genuinely silent audio track can still make Whisper repeat short
  // filler phrases ("you", "thanks for watching") at every timestamp.
  // Surface that plainly instead of quietly handing back garbage that
  // would otherwise get summarized as if it were real content.
  if (looksLikeHallucinatedFiller(segments)) {
    throw new Error(t('statusAudioTranscribeUnreliable'));
  }
  return segments;
}

function looksLikeHallucinatedFiller(segments) {
  if (segments.length < 4) return false;
  const normalized = segments.map((s) => s.text.trim().toLowerCase());
  const allVeryShort = normalized.every((text) => text.split(/\s+/).length <= 3);
  const uniqueCount = new Set(normalized).size;
  return allVeryShort && uniqueCount <= Math.max(2, Math.ceil(segments.length * 0.15));
}
