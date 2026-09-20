// Builds a transcript from scratch when none exists, by capturing the local
// video file's own decoded audio (via Web Audio) while it plays sped-up and
// muted in the background, then sending the recorded audio to OpenAI's
// Whisper transcription API in time-bounded chunks.
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
// re-running "generate transcript from audio" on the same video works, and
// route the source to both the capture destination AND the normal speaker
// destination so creating the tap doesn't silently mute the video for
// everyday playback afterward.
function getOrCreateAudioTap(videoEl) {
  if (videoEl._audioTap) return videoEl._audioTap;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  const source = audioCtx.createMediaElementSource(videoEl);
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(dest);
  source.connect(audioCtx.destination);
  const tap = { audioCtx, source, dest };
  videoEl._audioTap = tap;
  return tap;
}

// Plays `videoEl` from the start and records its audio in chunks of
// `chunkSeconds` of *source video* time, so long videos still produce
// Whisper-sized (well under its 25MB cap) pieces. Resolves with an array of
// { blob, offsetSeconds } in playback order. The video is muted to the
// speakers for the duration (nothing routes to the AudioContext output
// while this runs) and sped up via playbackRate to finish faster than
// real-time.
function recordAudioFromVideo(videoEl, { chunkSeconds = 900, playbackRate = 4, onProgress, signal } = {}) {
  if (!isAudioCaptureSupported()) {
    return Promise.reject(new Error('This browser does not support in-browser audio capture (Web Audio API / MediaRecorder).'));
  }
  const mimeType = pickAudioMimeType();
  if (!mimeType) {
    return Promise.reject(new Error('No supported audio recording format found in this browser.'));
  }

  const { audioCtx, dest } = getOrCreateAudioTap(videoEl);
  const wasMuted = videoEl.muted;
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
      videoEl.muted = wasMuted;
      videoEl.playbackRate = originalRate;
      videoEl.currentTime = 0;
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
    videoEl.muted = true;
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
  return segments;
}
