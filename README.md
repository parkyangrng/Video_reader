# YouTube Video Reader

A static, client-only web app (HTML/CSS/vanilla JS, no build step, no backend)
for reading a YouTube video: it plays the video, and uses an AI model to
produce a summary and time-stamped key knowledge points you can click to jump
playback to that exact moment — plus the full transcript. The UI and all
generated content support both **English** and **Chinese**.

## Features

- Three video sources, switchable via tabs above the input box:
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
- "Generate Summary & Key Points" calls an LLM (Anthropic Claude or OpenAI,
  your choice) to produce:
  - A bilingual (EN + ZH) summary.
  - 5–12 time-stamped key points, each bilingual, each clickable to seek the
    video to that moment.
- Full transcript tab with search and an on-demand "Translate" button that
  translates the whole transcript into the other language, shown alongside
  the original.
- One-click UI language toggle (English / 中文) for the whole interface.

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

- **Provider**: Anthropic (Claude) or OpenAI (GPT).
- **Model**: defaults are pre-filled; change if you prefer another model.
- **API Key**: your own key for that provider.

The key is stored only in your browser's `localStorage` and is sent directly
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
- Translation is done in batches of transcript lines; if a provider response
  doesn't match the expected format for a batch, those lines are left blank
  rather than guessed.
- **Video URL / Local File sources have no automatic transcript.** There's no
  captions API to query for an arbitrary stream or local file, so upload a
  matching `.vtt`/`.srt` subtitle file or paste the transcript by hand.
- A "Video URL" source plays directly in a `<video>` element (no CORS needed
  for playback itself, same as an `<img>` tag), but it must be a format the
  browser can decode, served over HTTPS if the page itself is HTTPS, and not
  blocked by the host's hotlink/referrer checks.
