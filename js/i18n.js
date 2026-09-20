// Minimal i18n dictionary + helpers for the EN/ZH interface toggle.
const STRINGS = {
  en: {
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
    translateTranscript: 'Translate',
    translating: 'Translating…',
    retranslate: 'Re-translate',
    settingsTitle: 'AI Provider Settings',
    providerLabel: 'Provider',
    modelLabel: 'Model',
    apiKeyLabel: 'API Key',
    apiKeyHint: "Stored only in this browser's local storage. It is sent directly to the provider's API and nowhere else.",
    cancel: 'Cancel',
    save: 'Save',
    summaryHeadingEn: 'English',
    summaryHeadingZh: '中文 (Chinese)',
    statusFetchingMeta: 'Loading video info…',
    statusFetchingTranscript: 'Fetching transcript automatically…',
    statusFetchingTranscriptFailed: "Couldn't fetch the transcript automatically (YouTube blocks this from a browser without a server). Please paste the transcript manually below.",
    statusTranscriptLoaded: 'Transcript loaded ({count} lines, language: {lang}).',
    statusNoTranscript: 'No transcript yet. Load a video or paste a transcript manually.',
    statusNeedApiKey: 'Add an API key in Settings first.',
    statusGenerateFailed: 'Failed to generate insights: {error}',
    statusTranslateFailed: 'Failed to translate transcript: {error}',
    statusManualParsed: 'Using manually pasted transcript ({count} lines).',
    statusNoAutoTranscriptForSource: "This source has no automatic transcript. Paste one below, or load a .vtt/.srt subtitle file.",
    statusSubtitleParsed: 'Subtitle file parsed ({count} lines). Review below, then click "Use this transcript".',
    statusSubtitleParseFailed: "Couldn't parse that subtitle file. Check it's a valid .vtt or .srt file.",
    noTimeLabel: '—',
    errorNoVideoId: "Couldn't recognize a YouTube video URL or ID.",
    errorNeedTranscript: 'Load a video or paste a transcript first.',
    errorNoStreamUrl: 'Enter a video/stream URL first.',
  },
  zh: {
    appTitle: 'YouTube 视频阅读器',
    settings: '设置',
    sourceYoutube: 'YouTube',
    sourceUrl: '视频链接',
    sourceFile: '本地文件',
    videoUrlLabel: 'YouTube 视频链接或 ID',
    videoUrlPlaceholder: 'https://www.youtube.com/watch?v=...',
    streamUrlLabel: '直接视频/流媒体链接（mp4、webm、HLS .m3u8）',
    streamUrlPlaceholder: 'https://example.com/video.mp4',
    localFileLabel: '选择本地视频文件',
    subtitleUploadLabel: '或加载字幕文件（.vtt / .srt）自动填入：',
    load: '加载视频',
    manualTranscriptToggle: '没有自动获取到字幕？点击手动粘贴',
    manualTranscriptPlaceholder: '在此粘贴字幕，例如：\n[00:00] 欢迎观看本视频…\n[00:12] 今天我们将聊聊…',
    manualTranscriptHint: '提示：使用 "[00:12] 文本" 或 "00:12 文本" 格式的行，可以让关键点精确跳转到对应时间。纯文本（无时间戳）也可以使用。',
    useThisTranscript: '使用此字幕',
    generateInsights: '生成摘要与关键点',
    generating: '生成中…',
    tabSummary: '摘要',
    tabKeyPoints: '关键点',
    tabTranscript: '完整字幕',
    summaryEmpty: '点击"生成摘要与关键点"以创建 AI 摘要。',
    keypointsEmpty: '生成后，带时间戳的关键知识点将显示在这里。',
    searchTranscript: '搜索字幕…',
    translateTranscript: '翻译',
    translating: '翻译中…',
    retranslate: '重新翻译',
    settingsTitle: 'AI 服务设置',
    providerLabel: '服务商',
    modelLabel: '模型',
    apiKeyLabel: 'API 密钥',
    apiKeyHint: '仅保存在此浏览器的本地存储中，只会直接发送给所选服务商的 API，不会发送到其他任何地方。',
    cancel: '取消',
    save: '保存',
    summaryHeadingEn: 'English（英文）',
    summaryHeadingZh: '中文',
    statusFetchingMeta: '正在加载视频信息…',
    statusFetchingTranscript: '正在自动获取字幕…',
    statusFetchingTranscriptFailed: '无法自动获取字幕（YouTube 在没有服务器的情况下会阻止浏览器直接读取）。请在下方手动粘贴字幕。',
    statusTranscriptLoaded: '字幕已加载（{count} 行，语言：{lang}）。',
    statusNoTranscript: '暂无字幕。请先加载视频或手动粘贴字幕。',
    statusNeedApiKey: '请先在"设置"中填写 API 密钥。',
    statusGenerateFailed: '生成失败：{error}',
    statusTranslateFailed: '翻译字幕失败：{error}',
    statusManualParsed: '已使用手动粘贴的字幕（{count} 行）。',
    statusNoAutoTranscriptForSource: '此来源无法自动获取字幕。请在下方手动粘贴，或加载 .vtt/.srt 字幕文件。',
    statusSubtitleParsed: '字幕文件解析成功（{count} 行）。请在下方确认后点击"使用此字幕"。',
    statusSubtitleParseFailed: '无法解析该字幕文件，请确认它是有效的 .vtt 或 .srt 文件。',
    noTimeLabel: '—',
    errorNoVideoId: '无法识别 YouTube 视频链接或 ID。',
    errorNeedTranscript: '请先加载视频或粘贴字幕。',
    errorNoStreamUrl: '请先输入视频/流媒体链接。',
  },
};

let currentLang = localStorage.getItem('yvr_ui_lang') || 'en';

function t(key, vars) {
  const dict = STRINGS[currentLang] || STRINGS.en;
  let str = dict[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

function setUiLang(lang) {
  currentLang = lang;
  localStorage.setItem('yvr_ui_lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  applyI18n();
}

function getUiLang() {
  return currentLang;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.textContent = currentLang === 'en' ? '中文' : 'English';
  }
}
