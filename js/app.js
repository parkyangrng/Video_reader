// Main application state & UI wiring.
// Bump this (and the ?v= query strings + <meta name="app-version"> in
// index.html) on every change to js/css so browsers don't silently keep
// serving stale cached assets after index.html itself is reloaded/updated.
const APP_VERSION = '1.3.0';

const state = {
  sourceType: 'youtube', // 'youtube' | 'url' | 'file'
  videoId: null,
  videoMeta: null,
  segments: [],
  transcriptLang: null,
  insights: null,
  translated: { en: null, zh: null },
  settings: loadSettings(),
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('yvr_settings');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* ignore */
  }
  return { provider: 'anthropic', model: DEFAULT_MODELS.anthropic, apiKey: '', whisperApiKey: '' };
}

// Speech-to-text has no Anthropic equivalent, so audio transcription always
// needs an OpenAI key even when the summarization provider is Claude. Falls
// back to the main API key if that's already an OpenAI key, so someone who
// picked OpenAI as their provider doesn't have to paste the same key twice.
function getWhisperApiKey() {
  return state.settings.whisperApiKey || (state.settings.provider === 'openai' ? state.settings.apiKey : '');
}

function saveSettings() {
  localStorage.setItem('yvr_settings', JSON.stringify(state.settings));
}

const el = (id) => document.getElementById(id);

// Long-running AI calls get this long to finish before we give up and show a
// clear timeout error, rather than leaving the UI looking hung forever.
const REQUEST_TIMEOUT_MS = 120000;

function setStatus(msg, kind = 'info') {
  const box = el('status-msg');
  box.textContent = msg || '';
  box.className = 'status-msg' + (msg ? ` status-${kind}` : '');
  if (msg) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Inline error shown right next to the action that failed (Generate /
// Translate), so it's visible even when the page is scrolled and the
// top status bar is out of view.
function setInlineError(id, msg) {
  const box = el(id);
  box.textContent = msg || '';
  box.classList.toggle('hidden', !msg);
  if (msg) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showProgress(id, { indeterminate = true } = {}) {
  const block = el(id);
  block.classList.remove('hidden');
  const fill = block.querySelector('.progress-fill');
  fill.classList.toggle('indeterminate', indeterminate);
  fill.style.width = indeterminate ? '' : '0%';
}

function setProgressLabel(id, text) {
  el(id).querySelector('.progress-label').textContent = text || '';
}

function setProgressPercent(id, pct) {
  const fill = el(id).querySelector('.progress-fill');
  fill.classList.remove('indeterminate');
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function hideProgress(id) {
  el(id).classList.add('hidden');
}

function init() {
  console.log(`YouTube Video Reader v${APP_VERSION}`);
  const badge = el('app-version');
  if (badge) badge.textContent = `v${APP_VERSION}`;
  applyI18n();
  el('lang-toggle').addEventListener('click', () => {
    setUiLang(getUiLang() === 'en' ? 'zh' : 'en');
    renderAll();
  });

  el('load-btn').addEventListener('click', onLoadVideo);
  el('video-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onLoadVideo();
  });
  el('load-url-btn').addEventListener('click', onLoadStreamUrl);
  el('stream-url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onLoadStreamUrl();
  });
  el('local-file-input').addEventListener('change', onLoadLocalFile);
  el('subtitle-file-input').addEventListener('change', onLoadSubtitleFile);
  el('use-manual-transcript').addEventListener('click', onUseManualTranscript);
  el('audio-transcribe-btn').addEventListener('click', onGenerateTranscriptFromAudio);
  el('generate-btn').addEventListener('click', onGenerateInsights);
  el('translate-transcript-btn').addEventListener('click', onTranslateTranscript);
  el('transcript-search').addEventListener('input', renderTranscript);

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('.source-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchSourcePanel(btn.dataset.source));
  });

  el('settings-btn').addEventListener('click', openSettings);
  el('settings-cancel').addEventListener('click', closeSettings);
  el('settings-save').addEventListener('click', onSaveSettings);
  el('provider-select').addEventListener('change', () => {
    el('model-input').value = DEFAULT_MODELS[el('provider-select').value];
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
}

function switchSourcePanel(source) {
  document.querySelectorAll('.source-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.source === source));
  document.querySelectorAll('.source-panel').forEach((p) => p.classList.toggle('active', p.id === `source-panel-${source}`));
}

// Clears everything tied to the previously loaded video/transcript before a
// new source (of any kind) is loaded.
function resetForNewSource() {
  state.videoId = null;
  state.segments = [];
  state.transcriptLang = null;
  state.insights = null;
  state.translated = { en: null, zh: null };
  el('manual-transcript').value = '';
  el('manual-transcript-details').open = false;
  el('audio-transcribe-row').classList.add('hidden');
  setInlineError('generate-error', '');
  setInlineError('translate-error', '');
  renderAll();
}

async function onLoadVideo() {
  const input = el('video-input').value;
  const videoId = parseVideoId(input);
  if (!videoId) {
    setStatus(t('errorNoVideoId'), 'error');
    return;
  }

  resetForNewSource();
  state.sourceType = 'youtube';
  state.videoId = videoId;
  el('workspace').classList.remove('hidden');
  mountYouTubePlayer(videoId);

  setStatus(t('statusFetchingMeta'));
  try {
    const meta = await fetchOEmbed(videoId);
    state.videoMeta = meta;
    el('video-title').textContent = meta.title || '';
    el('video-author').textContent = meta.author_name || '';
  } catch (e) {
    state.videoMeta = null;
    el('video-title').textContent = '';
    el('video-author').textContent = '';
  }

  setStatus(t('statusFetchingTranscript'));
  try {
    const { segments, lang } = await fetchTranscript(videoId);
    state.segments = segments;
    state.transcriptLang = lang;
    setStatus(t('statusTranscriptLoaded', { count: segments.length, lang }), 'success');
    el('manual-transcript-details').open = false;
  } catch (e) {
    setStatus(t('statusFetchingTranscriptFailed'), 'error');
    el('manual-transcript-details').open = true;
  }
  renderAll();
}

function onLoadStreamUrl() {
  const url = el('stream-url-input').value.trim();
  if (!url) {
    setStatus(t('errorNoStreamUrl'), 'error');
    return;
  }

  resetForNewSource();
  state.sourceType = 'url';
  state.videoMeta = { title: url, author_name: '' };
  el('video-title').textContent = url;
  el('video-author').textContent = '';
  el('workspace').classList.remove('hidden');
  mountHtml5Player(url);

  setStatus(t('statusNoAutoTranscriptForSource'), 'info');
  el('manual-transcript-details').open = true;
  renderAll();
}

function onLoadLocalFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  resetForNewSource();
  state.sourceType = 'file';
  state.videoMeta = { title: file.name, author_name: '' };
  el('video-title').textContent = file.name;
  el('video-author').textContent = '';
  el('workspace').classList.remove('hidden');
  const blobUrl = URL.createObjectURL(file);
  mountHtml5Player(blobUrl, { isBlob: true });

  // Audio-based auto-transcription only works for local files: a blob: URL
  // is same-origin so Web Audio can read it, unlike an arbitrary remote
  // "Video URL" which would need the server's own CORS cooperation.
  el('audio-transcribe-row').classList.remove('hidden');
  setStatus(t('statusNoAutoTranscriptForFile'), 'info');
  el('manual-transcript-details').open = true;
  renderAll();
}

async function onLoadSubtitleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const cues = parseSubtitleText(text);
    if (!cues.length) {
      setStatus(t('statusSubtitleParseFailed'), 'error');
      return;
    }
    el('manual-transcript').value = cuesToManualText(cues);
    el('manual-transcript-details').open = true;
    setStatus(t('statusSubtitleParsed', { count: cues.length }), 'success');
  } catch (err) {
    setStatus(t('statusSubtitleParseFailed'), 'error');
  } finally {
    e.target.value = '';
  }
}

function applyManualTranscript(text) {
  const { segments } = parseManualTranscript(text);
  state.segments = segments;
  state.transcriptLang = null;
  state.insights = null;
  state.translated = { en: null, zh: null };
  el('workspace').classList.remove('hidden');
  setInlineError('generate-error', '');
  setInlineError('translate-error', '');
  renderAll();
  return segments;
}

function onUseManualTranscript() {
  const text = el('manual-transcript').value;
  if (!text.trim()) return;
  const segments = applyManualTranscript(text);
  setStatus(t('statusManualParsed', { count: segments.length }), 'success');
}

// Runs the record-audio-then-Whisper pipeline (js/transcribe.js) against the
// currently loaded local file and, on success, drops the result into
// state.segments exactly like a manual paste would. Returns false (without
// erroring) when the pipeline simply isn't applicable — no local file
// loaded, or no Whisper key configured — so callers can decide how to
// report that; throws on an actual failure once the pipeline has started.
async function generateTranscriptFromVideoAudio(progressId) {
  const videoEl = getActiveHtml5Element();
  if (!videoEl || state.sourceType !== 'file') return false;
  const whisperKey = getWhisperApiKey();
  if (!whisperKey) return false;

  showProgress(progressId, { indeterminate: false });
  setProgressPercent(progressId, 0);
  try {
    const segments = await transcribeVideoAudio({
      videoEl,
      apiKey: whisperKey,
      onProgress: (p) => {
        if (p.stage === 'recording') {
          setProgressLabel(progressId, t('progressRecordingAudio', { percent: Math.round(p.fraction * 100) }));
          setProgressPercent(progressId, p.fraction * 70); // last 30% reserved for the Whisper call(s)
        } else if (p.stage === 'transcribing') {
          setProgressLabel(progressId, t('progressTranscribingChunk', { current: p.chunkIndex, total: p.totalChunks }));
          setProgressPercent(progressId, 70 + (p.chunkIndex / p.totalChunks) * 30);
        }
      },
    });
    if (!segments.length) throw new Error(t('statusAudioTranscribeEmpty'));
    state.segments = segments;
    state.transcriptLang = null;
    state.insights = null;
    state.translated = { en: null, zh: null };
    el('manual-transcript').value = segments.map((s) => `[${formatTime(s.start)}] ${s.text}`).join('\n');
    renderAll();
    return true;
  } finally {
    hideProgress(progressId);
  }
}

async function onGenerateTranscriptFromAudio() {
  const btn = el('audio-transcribe-btn');
  if (btn.disabled) return;
  if (!getActiveHtml5Element() || state.sourceType !== 'file') {
    setStatus(t('errorNoAudioSource'), 'error');
    return;
  }
  if (!getWhisperApiKey()) {
    setStatus(t('statusNeedWhisperKey'), 'error');
    openSettings();
    return;
  }

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = t('transcribingAudio');
  setStatus('');
  try {
    await generateTranscriptFromVideoAudio('audio-transcribe-progress');
    setStatus(t('statusAudioTranscribeDone', { count: state.segments.length }), 'success');
  } catch (e) {
    setStatus(t('statusAudioTranscribeFailed', { error: e.message }), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// Generate/Translate both need a transcript in state.segments. In order of
// preference: (1) segments already loaded, (2) whatever's sitting in the
// manual-transcript box (pasted, or filled in by a subtitle upload) even if
// "Use this transcript" was never clicked, (3) for a local file with a
// Whisper key configured, auto-build one from the file's own audio, (4)
// otherwise report an error whose wording actually matches what's missing
// (no video at all vs. a video with no transcript vs. a video that could
// auto-transcribe if a Whisper key were added).
async function ensureTranscriptLoaded(progressId) {
  if (state.segments.length) return true;

  const manualText = el('manual-transcript').value;
  if (manualText.trim()) {
    const segments = applyManualTranscript(manualText);
    if (segments.length) return true;
  }

  if (state.sourceType === 'file' && getActiveHtml5Element() && getWhisperApiKey()) {
    try {
      if (await generateTranscriptFromVideoAudio(progressId)) return true;
    } catch (e) {
      setInlineError(progressId === 'generate-progress' ? 'generate-error' : 'translate-error', t('statusAudioTranscribeFailed', { error: e.message }));
      return false;
    }
  }

  const videoLoaded = !el('workspace').classList.contains('hidden');
  let msgKey = 'errorNeedTranscript';
  if (videoLoaded) {
    msgKey = state.sourceType === 'file' ? 'errorNeedTranscriptOrWhisperKey' : 'errorNeedTranscriptOnly';
  }
  setStatus(t(msgKey), 'error');
  el('manual-transcript-details').open = true;
  return false;
}

function ensureSettingsOrPrompt() {
  if (!state.settings.apiKey) {
    setStatus(t('statusNeedApiKey'), 'error');
    openSettings();
    return false;
  }
  return true;
}

function errorMessageFor(e) {
  if (e.name === 'AbortError') return t('errorTimeout', { seconds: REQUEST_TIMEOUT_MS / 1000 });
  return e.message;
}

async function onGenerateInsights() {
  const btn = el('generate-btn');
  if (btn.disabled) return;
  if (!ensureSettingsOrPrompt()) return;

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = t('generating');
  setStatus('');
  setInlineError('generate-error', '');

  try {
    if (!(await ensureTranscriptLoaded('generate-progress'))) return;

    showProgress('generate-progress', { indeterminate: true });
    setProgressLabel('generate-progress', t('progressConnecting'));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      state.insights = await generateInsights({
        provider: state.settings.provider,
        apiKey: state.settings.apiKey,
        model: state.settings.model,
        segments: state.segments,
        videoTitle: state.videoMeta?.title,
        signal: controller.signal,
        onProgress: (p) => {
          if (p.stage === 'connecting') {
            setProgressLabel('generate-progress', t('progressConnecting'));
          } else if (p.stage === 'streaming') {
            setProgressLabel('generate-progress', t('progressStreaming', { chars: p.charsReceived }));
          } else if (p.stage === 'parsing') {
            setProgressLabel('generate-progress', t('progressParsing'));
          }
        },
      });
      renderSummary();
      renderKeyPoints();
      switchTab('summary');
    } catch (e) {
      const message = errorMessageFor(e);
      setStatus(t('statusGenerateFailed', { error: message }), 'error');
      setInlineError('generate-error', t('statusGenerateFailed', { error: message }));
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    hideProgress('generate-progress');
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

async function onTranslateTranscript() {
  const btn = el('translate-transcript-btn');
  if (btn.disabled) return;
  if (!ensureSettingsOrPrompt()) return;

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = t('translating');
  setStatus('');
  setInlineError('translate-error', '');

  try {
    if (!(await ensureTranscriptLoaded('translate-progress'))) return;

    const targetLang = state.transcriptLang && state.transcriptLang.startsWith('zh') ? 'en' : 'zh';
    showProgress('translate-progress', { indeterminate: false });
    setProgressPercent('translate-progress', 0);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const translated = await translateTranscript({
        provider: state.settings.provider,
        apiKey: state.settings.apiKey,
        model: state.settings.model,
        segments: state.segments,
        targetLang,
        signal: controller.signal,
        onProgress: (p) => {
          if (p.stage === 'batch') {
            setProgressLabel('translate-progress', t('progressTranslateBatch', { current: p.batchIndex, total: p.totalBatches }));
            setProgressPercent('translate-progress', ((p.batchIndex - 1) / p.totalBatches) * 100);
          }
        },
      });
      state.translated[targetLang] = translated;
      renderTranscript();
    } catch (e) {
      const message = errorMessageFor(e);
      setStatus(t('statusTranslateFailed', { error: message }), 'error');
      setInlineError('translate-error', t('statusTranslateFailed', { error: message }));
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    hideProgress('translate-progress');
    btn.disabled = false;
    btn.textContent = t(state.translated.en || state.translated.zh ? 'retranslate' : 'translateTranscript');
  }
}

function renderAll() {
  renderTranscript();
  renderSummary();
  renderKeyPoints();
}

function renderSummary() {
  const empty = el('summary-empty');
  const content = el('summary-content');
  if (!state.insights) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  content.classList.remove('hidden');
  content.innerHTML = `
    <div class="lang-card">
      <h3>${t('summaryHeadingEn')}</h3>
      <p>${escapeHtml(state.insights.summary.en)}</p>
    </div>
    <div class="lang-card">
      <h3>${t('summaryHeadingZh')}</h3>
      <p>${escapeHtml(state.insights.summary.zh)}</p>
    </div>
  `;
}

function renderKeyPoints() {
  const empty = el('keypoints-empty');
  const list = el('keypoints-list');
  if (!state.insights || !state.insights.key_points.length) {
    empty.classList.remove('hidden');
    list.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = state.insights.key_points
    .map(
      (kp) => `
      <li class="keypoint-item">
        <button class="time-badge" data-time="${kp.time}">${formatTime(kp.time)}</button>
        <div class="keypoint-text">
          <p class="kp-en">${escapeHtml(kp.en)}</p>
          <p class="kp-zh">${escapeHtml(kp.zh)}</p>
        </div>
      </li>`
    )
    .join('');
  list.querySelectorAll('.time-badge').forEach((btn) => {
    btn.addEventListener('click', () => seekTo(parseFloat(btn.dataset.time)));
  });
}

function renderTranscript() {
  const listEl = el('transcript-list');
  const query = (el('transcript-search').value || '').trim().toLowerCase();
  if (!state.segments.length) {
    listEl.innerHTML = `<div class="empty-state">${t('statusNoTranscript')}</div>`;
    return;
  }
  const enTrans = state.translated.en;
  const zhTrans = state.translated.zh;

  const rows = state.segments
    .map((seg, idx) => {
      const extra = enTrans ? enTrans[idx] : zhTrans ? zhTrans[idx] : null;
      const matches =
        !query ||
        seg.text.toLowerCase().includes(query) ||
        (extra && extra.toLowerCase().includes(query));
      if (!matches) return '';
      const timeHtml =
        seg.start != null
          ? `<button class="time-badge" data-time="${seg.start}">${formatTime(seg.start)}</button>`
          : `<span class="time-badge disabled">${t('noTimeLabel')}</span>`;
      const extraHtml = extra ? `<p class="transcript-extra">${escapeHtml(extra)}</p>` : '';
      return `
        <div class="transcript-row">
          ${timeHtml}
          <div class="transcript-text">
            <p>${escapeHtml(seg.text)}</p>
            ${extraHtml}
          </div>
        </div>`;
    })
    .join('');
  listEl.innerHTML = rows || `<div class="empty-state">${t('statusNoTranscript')}</div>`;
  listEl.querySelectorAll('.time-badge:not(.disabled)').forEach((btn) => {
    btn.addEventListener('click', () => seekTo(parseFloat(btn.dataset.time)));
  });
  el('translate-transcript-btn').textContent = t(enTrans || zhTrans ? 'retranslate' : 'translateTranscript');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function openSettings() {
  el('provider-select').value = state.settings.provider;
  el('model-input').value = state.settings.model || DEFAULT_MODELS[state.settings.provider];
  el('api-key-input').value = state.settings.apiKey || '';
  el('whisper-api-key-input').value = state.settings.whisperApiKey || '';
  el('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  el('settings-modal').classList.add('hidden');
}

function onSaveSettings() {
  state.settings = {
    provider: el('provider-select').value,
    model: el('model-input').value.trim() || DEFAULT_MODELS[el('provider-select').value],
    apiKey: el('api-key-input').value.trim(),
    whisperApiKey: el('whisper-api-key-input').value.trim(),
  };
  saveSettings();
  closeSettings();
  setStatus('');
}

document.addEventListener('DOMContentLoaded', init);
