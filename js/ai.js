// AI provider abstraction. Calls the provider's API directly from the browser
// using a user-supplied API key (kept only in localStorage). Supports
// Anthropic (Claude) and OpenAI as interchangeable backends.

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5',
};

function segmentsToPromptText(segments, maxChars = 60000) {
  const lines = segments
    .filter((s) => s.text && s.text.trim())
    .map((s) => (s.start != null ? `[${formatTime(s.start)}] ${s.text}` : s.text));
  let text = lines.join('\n');
  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }
  return { text, truncated };
}

function buildInsightsPrompt(segments, videoTitle) {
  const { text, truncated } = segmentsToPromptText(segments);
  const system = `You are an expert video content analyst. You will be given a timestamped transcript of a YouTube video, which may be in English, Chinese, or a mix. Respond with ONLY a single JSON object (no prose, no markdown fences) with exactly this shape:
{
  "summary": {"en": "4-8 sentence summary in English", "zh": "同样内容的中文摘要，4-8句"},
  "key_points": [
    {"time": <integer seconds, must match a timestamp actually present in the transcript>, "en": "concise key point in English", "zh": "对应关键点的中文"}
  ]
}
Produce between 5 and 12 key_points, ordered by time ascending, covering the most important ideas across the whole video (not just the start). Both "en" and "zh" fields are REQUIRED for every item and for the summary, regardless of the transcript's original language — translate as needed so both languages are complete, natural, and convey the same meaning. Do not invent timestamps that aren't grounded in the transcript.`;
  const titleLine = videoTitle ? `Video title: ${videoTitle}\n\n` : '';
  const truncNote = truncated
    ? '\n\n[Note: transcript was truncated to fit context length; base your analysis on the portion provided.]'
    : '';
  const user = `${titleLine}Timestamped transcript:\n${text}${truncNote}`;
  return { system, user };
}

function extractJson(raw) {
  let s = raw.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in AI response.');
  return JSON.parse(s.slice(start, end + 1));
}

async function callAnthropic(apiKey, model, system, user, maxTokens = 4096) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic API error (${res.status})`);
  return (data.content || []).map((c) => c.text || '').join('');
}

async function callOpenAI(apiKey, model, system, user, maxTokens = 4096) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI API error (${res.status})`);
  return data.choices?.[0]?.message?.content || '';
}

async function callProvider(provider, apiKey, model, system, user, maxTokens) {
  if (provider === 'openai') return callOpenAI(apiKey, model, system, user, maxTokens);
  return callAnthropic(apiKey, model, system, user, maxTokens);
}

async function generateInsights({ provider, apiKey, model, segments, videoTitle }) {
  if (!apiKey) throw new Error('Missing API key.');
  const { system, user } = buildInsightsPrompt(segments, videoTitle);
  const raw = await callProvider(provider, apiKey, model, system, user, 4096);
  const json = extractJson(raw);
  if (!json.summary || !Array.isArray(json.key_points)) {
    throw new Error('AI response was missing expected fields.');
  }
  json.key_points = json.key_points
    .filter((kp) => typeof kp.time === 'number' && kp.en && kp.zh)
    .sort((a, b) => a.time - b.time);
  return json;
}

// Translates transcript lines into targetLang ('en' or 'zh') in numbered
// batches so the response can be parsed back into per-line order reliably.
async function translateTranscript({ provider, apiKey, model, segments, targetLang }) {
  if (!apiKey) throw new Error('Missing API key.');
  const targetName = targetLang === 'zh' ? 'Simplified Chinese' : 'English';
  const batchSize = 80;
  const results = new Array(segments.length).fill('');

  for (let i = 0; i < segments.length; i += batchSize) {
    const batch = segments.slice(i, i + batchSize);
    const numbered = batch.map((s, idx) => `${idx + 1}) ${s.text}`).join('\n');
    const system = `You are a professional subtitle translator. Translate each numbered line into ${targetName}. Respond with ONLY the same numbered lines translated, one per line, in the same order, using the format "N) translated text". Do not merge, skip, add, or reorder lines. Keep translations concise and natural.`;
    const raw = await callProvider(provider, apiKey, model, system, numbered, 4096);
    const lineMap = {};
    raw.split('\n').forEach((line) => {
      const m = line.match(/^\s*(\d+)\)\s?(.*)$/);
      if (m) lineMap[parseInt(m[1], 10)] = m[2].trim();
    });
    batch.forEach((s, idx) => {
      results[i + idx] = lineMap[idx + 1] || '';
    });
  }
  return results;
}
