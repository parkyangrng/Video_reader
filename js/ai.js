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
  const system = `You are an expert video content analyst. You will be given a timestamped transcript of a video, which may be in any language. Respond with ONLY a single JSON object (no prose, no markdown fences) with exactly this shape:
{
  "summary": "4-8 sentence summary in English",
  "key_points": [
    {"time": <integer seconds, must match a timestamp actually present in the transcript>, "text": "concise key point in English"}
  ]
}
Produce between 5 and 12 key_points, ordered by time ascending, covering the most important ideas across the whole video (not just the start). Write the summary and every key point in English regardless of the transcript's original language — translate as needed. Do not invent timestamps that aren't grounded in the transcript.`;
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

// Reads a streamed SSE response body, extracting incremental text deltas
// from either Anthropic's or OpenAI's streaming event shapes, and calls
// onDelta(delta, fullTextSoFar) for each chunk as it arrives. This is what
// lets the UI show live "still working" progress instead of a single
// long silent wait.
async function streamSSE(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      let json;
      try {
        json = JSON.parse(dataStr);
      } catch (e) {
        continue;
      }
      let delta = '';
      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
        delta = json.delta.text;
      } else if (json.choices?.[0]?.delta?.content) {
        delta = json.choices[0].delta.content;
      }
      if (delta) {
        fullText += delta;
        onDelta(delta, fullText);
      }
    }
  }
  return fullText;
}

async function readErrorMessage(res) {
  try {
    const data = await res.json();
    return data?.error?.message || `HTTP ${res.status}`;
  } catch (e) {
    return `HTTP ${res.status}`;
  }
}

// Speech-to-text has no Anthropic equivalent, so building a transcript from
// audio always goes through OpenAI's Whisper endpoint regardless of which
// provider is chosen for summarization. whisper-1 (rather than the newer
// gpt-4o-transcribe models) is used specifically because it supports
// response_format=verbose_json with per-segment start/end timestamps, which
// our clickable time-stamped key points depend on.
async function transcribeAudioChunk({ apiKey, blob, filename = 'audio.webm', signal }) {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper transcription error: ${await readErrorMessage(res)}`);
  return res.json();
}

async function callAnthropic(apiKey, model, system, user, maxTokens = 4096, opts = {}) {
  const { onDelta, signal } = opts;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
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
      stream: !!onDelta,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${await readErrorMessage(res)}`);
  if (onDelta) return streamSSE(res, onDelta);
  const data = await res.json();
  return (data.content || []).map((c) => c.text || '').join('');
}

async function callOpenAI(apiKey, model, system, user, maxTokens = 4096, opts = {}) {
  const { onDelta, signal } = opts;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
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
      stream: !!onDelta,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${await readErrorMessage(res)}`);
  if (onDelta) return streamSSE(res, onDelta);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callProvider(provider, apiKey, model, system, user, maxTokens, opts) {
  if (provider === 'openai') return callOpenAI(apiKey, model, system, user, maxTokens, opts);
  return callAnthropic(apiKey, model, system, user, maxTokens, opts);
}

async function generateInsights({ provider, apiKey, model, segments, videoTitle, onProgress, signal }) {
  if (!apiKey) throw new Error('Missing API key.');
  onProgress?.({ stage: 'preparing' });
  const { system, user } = buildInsightsPrompt(segments, videoTitle);
  onProgress?.({ stage: 'connecting' });
  const raw = await callProvider(provider, apiKey, model, system, user, 8192, {
    signal,
    onDelta: (delta, fullText) => onProgress?.({ stage: 'streaming', charsReceived: fullText.length }),
  });
  onProgress?.({ stage: 'parsing' });
  const json = extractJson(raw);
  if (!json.summary || !Array.isArray(json.key_points)) {
    throw new Error('AI response was missing expected fields.');
  }
  json.key_points = json.key_points
    .filter((kp) => typeof kp.time === 'number' && kp.text)
    .sort((a, b) => a.time - b.time);
  onProgress?.({ stage: 'done' });
  return json;
}
