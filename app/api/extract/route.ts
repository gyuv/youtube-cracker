import { NextResponse } from "next/server";
import { fetchTranscript, fetchVideoData } from "@/app/lib/transcript";
import { extractVideoId } from "@/app/lib/utils";
import type { ApiError, ExtractResponse } from "@/app/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { url?: string; targetLanguage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ApiError>({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const videoId = body.url ? extractVideoId(body.url) : null;
  if (!videoId) {
    return NextResponse.json<ApiError>(
      { error: "That doesn't look like a valid YouTube link (watch, youtu.be, shorts, or embed).", code: "INVALID_URL" },
      { status: 400 },
    );
  }

  try {
    const { meta, tracks, playable } = await fetchVideoData(videoId);
    if (!playable) {
      return NextResponse.json<ApiError>(
        { error: "This video is private, removed, or region-locked.", code: "INVALID_URL" },
        { status: 404 },
      );
    }

    const transcript = tracks.length
      ? await fetchTranscript(tracks, (body.targetLanguage ?? "en").slice(0, 2)).catch(() => null)
      : null;

    const payload: ExtractResponse = transcript
      ? { meta, source: "transcript", transcript: transcript.segments, transcriptLanguage: transcript.language }
      : // No captions: synthesize will hand the URL straight to Gemini's video understanding.
        { meta, source: "video" };

    return NextResponse.json(payload);
  } catch (err) {
    // Scraping blocked (e.g. datacenter IP) → still allow the multimodal fallback.
    return NextResponse.json<ExtractResponse>({
      meta: {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: "YouTube video",
        author: "",
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      },
      source: "video",
    });
  }
}
