// Minimal i18n helper. English-only; kept as a lookup table (rather than
// inlining strings everywhere) so UI copy stays centralized and consistent.
const STRINGS = {
  appTitle: 'YouTube Video Reader',
  settings: 'Settings',
  sourceYoutube: 'YouTube',
  sourceUrl: 'Video URL',
  sourceFile: 'Local File',
  videoUrlLabel: 'YouTube video URL or ID',
  videoUrlPlaceholder: 'https://www.youtube.com/watch?v=...',
  streamUrlLabel: 'Direct video/stream URL (mp4, webm, HLS .m3u8)',
  streamUrlPlaceholder: 'https://example.com/video.mp4',
  localFileLabel: 'Choose a local video file',
  subtitleUploadLabel: 'Or load a subtitle file (.vtt / .srt) to fill this in:',
  load: 'Load Video',
  videoEmptyState: 'Load a video from the left to get started.',
  manualTranscriptToggle: "Transcript didn't load automatically? Paste it manually",
  manualTranscriptPlaceholder: 'Paste transcript here, e.g.\n[00:00] Welcome to the video...\n[00:12] Today we will talk about...',
  manualTranscriptHint: 'Tip: lines like "[00:12] text" or "00:12 text" let key points link back to exact moments. Plain text without timestamps also works.',
  useThisTranscript: 'Use this transcript',
  generateInsights: 'Generate Summary & Key Points',
  generating: 'Generating…',
  tabSummary: 'Summary',
  tabKeyPoints: 'Key Points',
  tabTranscript: 'Transcript',
  summaryEmpty: 'Click "Generate Summary & Key Points" to create an AI summary.',
  keypointsEmpty: 'Time-stamped key knowledge points will appear here after you generate insights.',
  searchTranscript: 'Search transcript…',
  settingsTitle: 'AI Provider Settings',
  providerLabel: 'Provider',
  modelLabel: 'Model',
  apiKeyLabel: 'API Key',
  apiKeyHint: "Stored only in this browser's local storage. It is sent directly to the provider's API and nowhere else.",
  whisperApiKeyLabel: 'OpenAI API Key (for audio transcription)',
  whisperApiKeyHint: "Only used to build a transcript from a local video file's audio via Whisper when none exists yet. Separate from the key above — needed even if you use Claude for summaries. Optional.",
  cancel: 'Cancel',
  save: 'Save',
  statusFetchingMeta: 'Loading video info…',
  statusFetchingTranscript: 'Fetching transcript automatically…',
  statusFetchingTranscriptFailed: "Couldn't fetch the transcript automatically (YouTube blocks this from a browser without a server). Please paste the transcript manually below.",
  statusTranscriptLoaded: 'Transcript loaded ({count} lines, language: {lang}).',
  statusNoTranscript: 'No transcript yet. Load a video or paste a transcript manually.',
  statusNeedApiKey: 'Add an API key in Settings first.',
  statusGenerateFailed: 'Failed to generate insights: {error}',
  progressConnecting: 'Contacting AI provider…',
  progressStreaming: 'Receiving response… {chars} characters so far',
  progressParsing: 'Parsing response…',
  errorTimeout: 'Request timed out after {seconds}s. The transcript may be long, or the network/API is slow — try again, or switch to a faster model in Settings.',
  statusManualParsed: 'Using manually pasted transcript ({count} lines).',
  statusNoAutoTranscriptForSource: 'This source has no automatic transcript. Paste one below, or load a .vtt/.srt subtitle file.',
  statusNoAutoTranscriptForFile: "This file has no automatic transcript. Click \"Generate Summary & Key Points\" to auto-transcribe its audio (needs an OpenAI API key in Settings), or paste one below / load a .vtt/.srt subtitle file.",
  audioTranscribeHint: "Or generate a transcript automatically from this video's audio (uses OpenAI Whisper; runs in the background, muted, and takes roughly a quarter of the video's length):",
  audioTranscribeBtn: 'Generate transcript from audio',
  transcribingAudio: 'Transcribing…',
  progressRecordingAudio: 'Playing & recording audio in the background… {percent}%',
  progressTranscribingChunk: 'Transcribing chunk {current} of {total} with Whisper…',
  statusAudioTranscribeDone: 'Transcript generated from audio ({count} lines).',
  statusAudioTranscribeFailed: "Couldn't generate a transcript from audio: {error}",
  statusAudioTranscribeEmpty: "No speech was detected in this video's audio.",
  statusAudioTranscribeUnreliable: "The audio transcription only produced repeated filler words (e.g. \"you\"), which usually means the video's audio track wasn't actually captured. Check the file has audio and try again.",
  statusNeedWhisperKey: 'Add an OpenAI API key in Settings (for audio transcription) first.',
  errorNoAudioSource: 'Audio transcription is only available for a loaded local video file (not YouTube or a remote video URL).',
  statusSubtitleParsed: 'Subtitle file parsed ({count} lines). Review below, then click "Use this transcript".',
  statusSubtitleParseFailed: "Couldn't parse that subtitle file. Check it's a valid .vtt or .srt file.",
  noTimeLabel: '—',
  errorNoVideoId: "Couldn't recognize a YouTube video URL or ID.",
  errorNeedTranscript: 'Load a video or paste a transcript first.',
  errorNeedTranscriptOnly: "This video doesn't have a transcript yet. Paste one below, or upload a .vtt/.srt subtitle file, then try again.",
  errorNeedTranscriptOrWhisperKey: "This video doesn't have a transcript yet. Add an OpenAI API key in Settings to auto-generate one from its audio, or paste a transcript / upload a subtitle file below.",
  errorNoStreamUrl: 'Enter a video/stream URL first.',
};

function t(key, vars) {
  let str = STRINGS[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
}
