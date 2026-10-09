import type { TranscriptSegment, VideoMeta } from "./types";

/**
 * Zero-cost YouTube timed-text scraper. Reads the public watch page's
 * player response, picks the best caption track, and downloads it as json3.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string };
}

function extractJson(html: string, marker: string): any | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf("{", idx);
  let depth = 0;
  let inStr = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function fetchOEmbed(videoId: string): Promise<Partial<VideoMeta>> {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${videoId}`,
    );
    if (!r.ok) return {};
    const j = await r.json();
    return { title: j.title, author: j.author_name };
  } catch {
    return {};
  }
}

/**
 * YouTube's internal player API with the Android client. Datacenter IPs (Vercel)
 * are blocked far less often here than on the watch page.
 */
async function fetchInnertubePlayer(videoId: string): Promise<any | null> {
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
      },
      body: JSON.stringify({
        videoId,
        context: { client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30, hl: "en", gl: "US" } },
      }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.captions || j?.videoDetails ? j : null;
  } catch {
    return null;
  }
}

async function fetchWatchPagePlayer(videoId: string): Promise<any | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1" },
      cache: "no-store",
    });
    return res.ok ? extractJson(await res.text(), "ytInitialPlayerResponse") : null;
  } catch {
    return null;
  }
}

export async function fetchVideoData(videoId: string): Promise<{
  meta: VideoMeta;
  tracks: CaptionTrack[];
  playable: boolean;
}> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let player = await fetchInnertubePlayer(videoId);
  if (!player?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
    player = (await fetchWatchPagePlayer(videoId)) ?? player;
  }
  const details = player?.videoDetails ?? {};
  const oembed = details.title ? {} : await fetchOEmbed(videoId);
  const tracks: CaptionTrack[] =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  return {
    meta: {
      videoId,
      url,
      title: details.title ?? oembed.title ?? "Untitled video",
      author: details.author ?? oembed.author ?? "",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      lengthSeconds: details.lengthSeconds ? Number(details.lengthSeconds) : undefined,
    },
    tracks,
    playable: player?.playabilityStatus?.status !== "ERROR",
  };
}

function pickTrack(tracks: CaptionTrack[], preferred: string): CaptionTrack | undefined {
  const manual = tracks.filter((t) => t.kind !== "asr");
  return (
    manual.find((t) => t.languageCode.startsWith(preferred)) ??
    manual.find((t) => t.languageCode.startsWith("en")) ??
    tracks.find((t) => t.languageCode.startsWith(preferred)) ??
    tracks.find((t) => t.languageCode.startsWith("en")) ??
    manual[0] ??
    tracks[0]
  );
}

export async function fetchTranscript(
  tracks: CaptionTrack[],
  preferredLang = "en",
): Promise<{ segments: TranscriptSegment[]; language: string } | null> {
  const track = pickTrack(tracks, preferredLang);
  if (!track) return null;
  const sep = track.baseUrl.includes("?") ? "&" : "?";
  const r = await fetch(`${track.baseUrl}${sep}fmt=json3`, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const text = await r.text();
  if (!text) return null;
  if (text.trimStart().startsWith("<")) {
    const segments = parseXmlCaptions(text);
    return segments.length ? { segments, language: track.languageCode } : null;
  }
  try {
    const j = JSON.parse(text);
    const segments: TranscriptSegment[] = (j.events ?? [])
      .filter((e: any) => Array.isArray(e.segs))
      .map((e: any) => ({
        start: (e.tStartMs ?? 0) / 1000,
        duration: (e.dDurationMs ?? 0) / 1000,
        text: e.segs.map((s: any) => s.utf8 ?? "").join("").replace(/\s+/g, " ").trim(),
      }))
      .filter((s: TranscriptSegment) => s.text);
    return segments.length ? { segments, language: track.languageCode } : null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Handles both legacy `<text start dur>` and srv3 `<p t d>` caption XML. */
function parseXmlCaptions(xml: string): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  const re = /<(text|p)\s+([^>]*)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attr = (k: string) => m![2].match(new RegExp(`${k}="([\\d.]+)"`))?.[1];
    const isMs = m[1] === "p";
    const start = Number(attr(isMs ? "t" : "start") ?? 0) / (isMs ? 1000 : 1);
    const duration = Number(attr(isMs ? "d" : "dur") ?? 0) / (isMs ? 1000 : 1);
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (text) out.push({ start, duration, text });
  }
  return out;
}

/**
 * Parses a transcript pasted from YouTube's "Show transcript" panel
 * (timestamp lines like "1:23" followed by text). Plain text without
 * timestamps is accepted too.
 */
export function parsePastedTranscript(raw: string): TranscriptSegment[] {
  const ts = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/;
  const out: TranscriptSegment[] = [];
  let t = 0;
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(ts);
    if (m) {
      t = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      continue;
    }
    if (/^\d+ (?:seconds?|minutes?|hours?)(?:,? \d+ (?:seconds?|minutes?))*$/i.test(line)) continue; // screen-reader duplicates
    out.push({ start: t, duration: 0, text: line });
  }
  return out;
}

/** Collapse tiny caption events into ~N-second blocks prefixed with [mm:ss]. */
export function compactTranscript(segments: TranscriptSegment[], blockSeconds = 30): string {
  const lines: string[] = [];
  let buf: string[] = [];
  let blockStart = segments[0]?.start ?? 0;
  for (const s of segments) {
    if (s.start - blockStart >= blockSeconds && buf.length) {
      lines.push(`[${Math.floor(blockStart)}s] ${buf.join(" ")}`);
      buf = [];
      blockStart = s.start;
    }
    buf.push(s.text);
  }
  if (buf.length) lines.push(`[${Math.floor(blockStart)}s] ${buf.join(" ")}`);
  return lines.join("\n");
}

/** Split a compacted transcript into chunks under a character budget (~4 chars/token). */
export function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur.length + line.length + 1 > maxChars && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
