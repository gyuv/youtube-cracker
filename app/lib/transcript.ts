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

export async function fetchVideoData(videoId: string): Promise<{
  meta: VideoMeta;
  tracks: CaptionTrack[];
  playable: boolean;
}> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(`${url}&hl=en`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1" },
    cache: "no-store",
  });
  const html = res.ok ? await res.text() : "";
  const player = extractJson(html, "ytInitialPlayerResponse");
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
