# YouTube Video Reader

A static, client-only web app (HTML/CSS/vanilla JS, no build step, no backend)
for reading a video: it plays the video front and center, and uses an AI
model to produce a summary and time-stamped key knowledge points you can
click to jump playback to that exact moment — plus the full transcript.

## Layout

A left sidebar holds source selection (YouTube / Video URL / Local File) and
transcript input tools (manual paste, subtitle upload, audio transcription).
The main area shows the loaded video prominently, with the summary/key
points/transcript tabs below it.

## Features

- Three video sources, switchable via tabs in the left sidebar:
  - **YouTube** — paste a URL (or bare video ID) to load the embedded player.
  - **Video URL** — any direct HTTP(S) video/stream URL (mp4, webm, or HLS
    `.m3u8`; HLS playback uses [hls.js](https://github.com/video-dev/hls.js)
    loaded on demand from a CDN for browsers without native HLS support).
  - **Local File** — pick a video file from disk; it's played straight from
    the browser via an object URL and never uploaded anywhere.
- Best-effort automatic transcript fetch for YouTube (via public CORS
  proxies, since YouTube doesn't expose captions to arbitrary browser
  origins). For all three sources you can also paste a transcript manually
  (with or without `[mm:ss]` timestamps), or upload a `.vtt`/`.srt` subtitle
  file to auto-fill the manual transcript box.
- **For a Local File with no transcript, the app can build one from scratch**:
  it plays the file's audio in the background (silently — nothing routes to
  the speakers while it runs — sped up ~4x) while capturing it via the Web
  Audio API, sends the recording to OpenAI's Whisper API in ~15-minute
  chunks, and merges the results back into a normal timestamped transcript —
  no manual transcription needed. This happens automatically the first time
  you click "Generate Summary & Key Points" on a file with no transcript (if
  a Whisper key is configured), or on demand via the "Generate transcript
  from audio" button next to the manual-transcript box.
- "Generate Summary & Key Points" calls an LLM (Anthropic Claude or OpenAI,
  your choice) to produce an English summary and 5–12 time-stamped key
  points, each clickable to seek the video to that moment. If the
  transcript itself is in another language, the model translates into
  English as part of generating the summary.
- Full transcript tab with search.

## Versioning / cache-busting

`index.html` links `css/style.css` and each `js/*.js` file with a `?v=<version>`
query string, and shows the running version as a small badge next to the app
title (also logged to the browser console on load). If you update any CSS/JS
file, bump the version in three places so browsers don't keep serving stale
cached copies after `index.html` itself changes:

- `<meta name="app-version">` and every `?v=...` query string in `index.html`
- `APP_VERSION` in `js/app.js`

If the app ever looks like it's running an old version (e.g. a feature you
just added doesn't appear), do a hard refresh (Ctrl/Cmd+Shift+R) or clear the
site's cache — the version badge tells you at a glance whether you're
actually looking at the latest files.

## Running it

Any static file server works, e.g.:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. (Opening `index.html` directly via
`file://` may also work in some browsers, but a local server is more
reliable for the network requests this app makes.)

## AI provider setup

Click **Settings** and enter:

- **Provider**: Anthropic (Claude) or OpenAI (GPT), used for the summary and
  key points.
- **Model**: defaults are pre-filled; change if you prefer another model.
- **API Key**: your own key for that provider.
- **OpenAI API Key (for audio transcription)**: a separate, optional key used
  only to build a transcript from a local file's audio via Whisper. This is
  needed even if your main provider above is Claude, since Anthropic has no
  speech-to-text API — Whisper is OpenAI-specific. If your main provider is
  already OpenAI, this field reuses that key unless you fill in a different
  one.

Both keys are stored only in your browser's `localStorage` and sent directly
from your browser to the provider's API — never anywhere else. Anthropic
requests include the `anthropic-dangerous-direct-browser-access` header,
which is required to call the Claude API directly from a browser.

## Known limitations

- **Automatic transcript fetching is best-effort.** YouTube does not allow
  arbitrary web pages to read caption data directly (no CORS headers), so
  this app scrapes the watch page and caption endpoint through public CORS
  proxies (`allorigins.win`, `corsproxy.io`, `thingproxy`). These free
  proxies can be slow, rate-limited, or temporarily down. When automatic
  fetch fails, use the "paste it manually" box — copy the transcript text
  from YouTube's own "Show transcript" panel under a video.
- Very long transcripts are truncated to fit the model's context window when
  generating insights (a note is added to the prompt in that case).
- **Video URL / Local File sources have no automatic transcript.** There's no
  captions API to query for an arbitrary stream or local file, so upload a
  matching `.vtt`/`.srt` subtitle file, paste the transcript by hand, or (for
  a Local File) use audio transcription.
- A "Video URL" source plays directly in a `<video>` element (no CORS needed
  for playback itself, same as an `<img>` tag), but it must be a format the
  browser can decode, served over HTTPS if the page itself is HTTPS, and not
  blocked by the host's hotlink/referrer checks.
- **Audio-based transcription only covers Local File sources, not Video URL.**
  A local file's `blob:` URL is same-origin, so the Web Audio API can read
  its audio outright. A remote "Video URL" would need the server to send
  permissive CORS headers for that to work at all — since most don't, and
  forcing it (`crossOrigin="anonymous"`) would break playback entirely on
  servers that don't support CORS, that source type sticks to manual
  transcript entry / subtitle upload.
- Audio transcription runs at roughly 1/4 of the video's real length (it
  plays the file at 4x speed in the background to capture the audio) and, for
  a long video, in ~15-minute chunks sent one at a time to Whisper — so
  expect it to take real time proportional to the video's length, not be
  instant. There's no cancel button yet; reloading the page stops it.
- If Whisper's result looks like hallucinated filler ("you", "thanks for
  watching" repeated at every timestamp — its well-known response to a
  silent or near-silent audio track), the app detects the pattern and
  reports a clear error rather than silently summarizing garbage. If you hit
  this, check the source file actually has an audible audio track.
- Whisper's `whisper-1` model is used specifically (rather than newer
  `gpt-4o-transcribe` models) because it supports `response_format=
  verbose_json` with per-segment timestamps, which the clickable key points
  and transcript rows depend on.
