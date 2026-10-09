# Tutorial2Code / RecreateAI

Paste a YouTube tutorial URL and get a step-by-step reproduction guide: timestamped steps, runnable code, verified documentation links, a Mermaid architecture diagram, an animated walkthrough, translation into 10 languages, and prompts that fit the tutorial into your existing projects.

The app is designed to run at no cost: it uses Next.js on Vercel's free tier, the Gemini free tier, and stores everything in your browser's IndexedDB. There is no database or paid hosting.

## Setup

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY from https://aistudio.google.com/app/apikey
npm run dev
```

| Env var | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | — | Required (server-side only) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Any Gemini model on your key; `gemini-2.5-flash-lite` has a higher free daily quota |
| `GEMINI_MIN_INTERVAL_MS` | `4000` | Minimum gap between Gemini calls on the server, to stay within the free tier's ~15 requests/minute |

## Pipeline

1. **`/api/extract`** gets the video ID from watch, youtu.be, shorts, embed or live links. It reads the watch page's player response and downloads the best caption track as `json3`. If there are no captions, or YouTube blocks the scrape, it returns `source: "video"`.
2. **`/api/synthesize`** sends the transcript to Gemini, compacted into 30-second blocks. Transcripts over about 300k characters go through a map-reduce step first: each chunk becomes timestamped notes, then one final pass builds the guide. When there's no transcript, it passes the YouTube URL to Gemini directly as video input (`fileData`). The output is checked against a strict JSON `responseSchema` and validated with zod, every link is checked with HEAD/GET (broken ones are dropped), and the text is written in the target language. Calling it with `translateFrom` only translates an existing guide.
3. **`/api/prompt-engine`** turns the steps plus your attached prior projects into prompts for Cursor rules, Claude Code, Copilot, ChatGPT, Midjourney or Runway, with notes on likely conflicts.

**Free-tier protection:** the browser sends AI calls one at a time, at least 2 seconds apart. The server also spaces calls out and retries 429 and 5xx errors with exponential backoff.

**Storage:** Dexie stores `projects` (guides cached per language, step progress, notes) and `settings` (language, prompt tool, custom context).

## Deploy

Import the repo into Vercel and set `GEMINI_API_KEY`. The API routes declare `maxDuration` (60s, which the Hobby plan allows).
