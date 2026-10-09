import { NextResponse } from "next/server";
import { chunkNotesSchema, GeminiError, generate, guideSchema, youtubePart } from "@/app/lib/gemini";
import { chunkText, compactTranscript } from "@/app/lib/transcript";
import { verifyLinks } from "@/app/lib/links";
import { GuideSchema, LANGUAGES, type ApiError, type Guide, type SynthesizeRequest } from "@/app/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** ~60k tokens per chunk keeps long (2h+) videos well inside free-tier TPM limits. */
const CHUNK_CHARS = 240_000;
const SINGLE_PASS_CHARS = 300_000;

const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.label ?? code;

const SYSTEM = (lang: string) => `You are Tutorial2Code, an expert engineer who converts video tutorials into exhaustive, reproducible build guides.

Produce a JSON object matching the response schema:
1. "prerequisites": accounts, installs, knowledge, API keys needed BEFORE starting.
2. "techStack": every language, framework, library, API, SaaS tool and hardware used, each with its official homepage/docs URL.
3. "steps": chronological, ATOMIC actions (one action per step, id "s1","s2",...). "description" is Markdown with the exact commands, settings, clicks and values shown. Put full runnable code in "code" (never truncate with "..."; reconstruct what was shown on screen). "timestamp" = seconds in the video where that step begins. "links" = official docs for anything that step uses.
4. "resources": curated official docs / repos / articles for every library mentioned. Only use canonical, stable URLs (official docs, github.com repos, npmjs.com, pypi.org). Never invent deep links you are unsure of — prefer the docs homepage.
5. "mermaid": a valid Mermaid "flowchart TD" diagram of the workflow/architecture. Use simple alphanumeric node ids, wrap labels in double quotes, no parentheses inside labels, no markdown fences.
Fill gaps the presenter skipped (env vars, installs) and flag them with "(added)".
Write ALL human-readable text (titles, summary, descriptions, prerequisites) in ${lang}. Keep code, commands, URLs, and product names untranslated. Mermaid labels also in ${lang}.`;

function errorResponse(err: unknown) {
  if (err instanceof GeminiError) {
    const status = err.code === "RATE_LIMIT" ? 429 : err.code === "NO_API_KEY" ? 500 : 502;
    return NextResponse.json<ApiError>({ error: err.message, code: err.code }, { status });
  }
  return NextResponse.json<ApiError>(
    { error: err instanceof Error ? err.message : "Unknown error", code: "AI_ERROR" },
    { status: 500 },
  );
}

function normalize(raw: unknown): Guide {
  const g = GuideSchema.parse(raw);
  g.steps = g.steps.map((s, i) => ({ ...s, id: s.id || `s${i + 1}` }));
  g.mermaid = g.mermaid.replace(/^```(?:mermaid)?\s*/i, "").replace(/```\s*$/, "").trim();
  return g;
}

export async function POST(req: Request) {
  let body: SynthesizeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ApiError>({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }
  const lang = langName(body.targetLanguage || "en");

  try {
    // ---- Translation-only mode (language switcher cache miss) ----
    if (body.translateFrom) {
      const out = await generate<unknown>({
        system: `Translate every human-readable string in this JSON guide into ${lang}. Do NOT translate code, commands, URLs, ids, numbers, or product names. Keep the exact same structure. For "mermaid", translate only the quoted labels.`,
        parts: [{ text: JSON.stringify(body.translateFrom) }],
        schema: guideSchema,
        temperature: 0.1,
      });
      const g = normalize(out);
      // Keep verified links/code from the original — translation must not alter them.
      g.steps = g.steps.map((s, i) => ({ ...s, code: body.translateFrom!.steps[i]?.code ?? s.code, links: body.translateFrom!.steps[i]?.links ?? s.links }));
      g.resources = body.translateFrom.resources;
      return NextResponse.json({ guide: g });
    }

    const header = `Video: "${body.meta.title}" by ${body.meta.author || "unknown"} (${body.meta.url})`;
    let raw: unknown;

    if (body.source === "transcript" && body.transcript?.length) {
      const compact = compactTranscript(body.transcript);
      if (compact.length <= SINGLE_PASS_CHARS) {
        raw = await generate({
          system: SYSTEM(lang),
          parts: [{ text: `${header}\nTranscript ([seconds] text):\n${compact}` }],
          schema: guideSchema,
        });
      } else {
        // Map-reduce for very long videos: condense each chunk into timestamped notes, then synthesize.
        const chunks = chunkText(compact, CHUNK_CHARS);
        const notes: string[] = [];
        for (const [i, chunk] of chunks.entries()) {
          const r = await generate<{ notes: { timestamp: number; action: string; details?: string; code?: string; tools?: string[] }[] }>({
            system:
              "Extract every concrete build action from this tutorial transcript segment as terse timestamped notes. Include exact commands, code, settings and tool names. English only.",
            parts: [{ text: `${header}\nSegment ${i + 1}/${chunks.length}:\n${chunk}` }],
            schema: chunkNotesSchema,
            temperature: 0.2,
          });
          notes.push(
            ...r.notes.map(
              (n) =>
                `[${Math.round(n.timestamp)}s] ${n.action}${n.details ? ` — ${n.details}` : ""}${n.tools?.length ? ` (tools: ${n.tools.join(", ")})` : ""}${n.code ? `\n\`\`\`\n${n.code}\n\`\`\`` : ""}`,
            ),
          );
        }
        raw = await generate({
          system: SYSTEM(lang),
          parts: [{ text: `${header}\nCondensed timestamped notes of the full tutorial:\n${notes.join("\n")}` }],
          schema: guideSchema,
        });
      }
    } else {
      // No transcript → direct multimodal analysis of the YouTube video.
      raw = await generate({
        system: SYSTEM(lang),
        parts: [youtubePart(body.meta.url), { text: `${header}\nWatch the video (audio + on-screen code) and build the guide.` }],
        schema: guideSchema,
      });
    }

    const guide = await verifyLinks(normalize(raw));
    return NextResponse.json({ guide });
  } catch (err) {
    return errorResponse(err);
  }
}
