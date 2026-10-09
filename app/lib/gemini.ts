import "server-only";
import { GoogleGenerativeAI, SchemaType, type Part, type ResponseSchema } from "@google/generative-ai";

export const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** Free tier ≈ 15 RPM for Flash. Space calls ≥4s apart per server instance. */
const MIN_INTERVAL_MS = Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 4000);
let chain: Promise<void> = Promise.resolve();
let lastCall = 0;

function throttle(): Promise<void> {
  const next = chain.then(async () => {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
  });
  chain = next.catch(() => {});
  return next;
}

export class GeminiError extends Error {
  constructor(message: string, public code: "RATE_LIMIT" | "NO_API_KEY" | "AI_ERROR") {
    super(message);
  }
}

function client() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not configured on the server.", "NO_API_KEY");
  return new GoogleGenerativeAI(key);
}

interface GenerateOpts {
  system: string;
  parts: Part[];
  schema?: ResponseSchema;
  temperature?: number;
  maxOutputTokens?: number;
  /** Low video resolution (~66 tokens/frame instead of ~258) keeps whole-video analysis inside free quotas. */
  lowMediaResolution?: boolean;
}

/** Calls Gemini with throttling + exponential backoff on 429/5xx. Returns parsed JSON when a schema is given. */
export async function generate<T = string>(opts: GenerateOpts): Promise<T> {
  const model = client().getGenerativeModel({
    model: MODEL,
    systemInstruction: opts.system,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
      // Not yet typed in @google/generative-ai, but accepted by the REST API.
      ...(opts.lowMediaResolution ? ({ mediaResolution: "MEDIA_RESOLUTION_LOW" } as object) : {}),
    },
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    try {
      const res = await model.generateContent({ contents: [{ role: "user", parts: opts.parts }] });
      const text = res.response.text();
      return (opts.schema ? JSON.parse(stripFences(text)) : text) as T;
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? Number(String(err?.message).match(/\[(\d{3})/)?.[1]);
      const dailyQuota = /PerDay|per day/i.test(String(err?.message));
      console.error(`[gemini] attempt ${attempt + 1} failed (status ${status}):`, String(err?.message).slice(0, 500));
      const retryable = (status === 429 && !dailyQuota) || status === 503 || status === 500 || err instanceof SyntaxError;
      if (!retryable || attempt === 3) break;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt + Math.random() * 500));
    }
  }
  const raw = String((lastErr as any)?.message ?? lastErr);
  const status: number | undefined =
    (lastErr as any)?.status ?? (Number(raw.match(/\[(\d{3})[ \]]/)?.[1]) || undefined);
  // Drop the SDK's "Error fetching from https://…:generateContent:" prefix so users see Google's actual reason.
  const reason = raw.replace(/^\[GoogleGenerativeAI Error\]:\s*/, "").replace(/^Error fetching from \S+:\s*/, "").slice(0, 400);

  if (status === 429) {
    const perDay = /PerDay|per day|daily/i.test(raw);
    const retry = raw.match(/retry in ([\d.]+)s/i)?.[1];
    throw new GeminiError(
      perDay
        ? `Gemini free-tier DAILY quota for ${MODEL} is used up. It resets at midnight Pacific time, or set GEMINI_MODEL to another model (e.g. gemini-2.5-flash-lite).`
        : `Gemini free-tier per-minute limit hit${retry ? ` — retry in ${Math.ceil(Number(retry))}s` : ", wait a minute and retry"}. Details: ${reason}`,
      "RATE_LIMIT",
    );
  }
  if (status === 404) {
    throw new GeminiError(`Gemini model "${MODEL}" is unavailable for this key. Set GEMINI_MODEL to a current model. Details: ${reason}`, "AI_ERROR");
  }
  if (status === 400 && /API key/i.test(raw)) {
    throw new GeminiError(`GEMINI_API_KEY is invalid. Create a new key at aistudio.google.com and update it in Vercel. Details: ${reason}`, "NO_API_KEY");
  }
  if (status === 403) {
    throw new GeminiError(`Gemini refused this key (403). Check the key in Vercel and that the Generative Language API is enabled. Details: ${reason}`, "NO_API_KEY");
  }
  throw new GeminiError(`Gemini request failed${status ? ` (${status})` : ""}: ${reason}`, "AI_ERROR");
}

function stripFences(t: string) {
  return t.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
}

/** Multimodal part pointing Gemini directly at a public YouTube video. */
export function youtubePart(url: string): Part {
  // Gemini's YouTube support takes the bare URL; mimeType is required by the SDK's types but not by the API.
  return { fileData: { fileUri: url } } as unknown as Part;
}

// ---------- Response schemas ----------
const S = SchemaType;
const link: ResponseSchema = {
  type: S.OBJECT,
  properties: {
    label: { type: S.STRING },
    url: { type: S.STRING },
    kind: { type: S.STRING, description: "docs | repo | article | video | tool" },
  },
  required: ["label", "url"],
};

export const guideSchema: ResponseSchema = {
  type: S.OBJECT,
  properties: {
    title: { type: S.STRING },
    summary: { type: S.STRING },
    difficulty: { type: S.STRING, description: "beginner | intermediate | advanced" },
    estimatedTime: { type: S.STRING },
    prerequisites: { type: S.ARRAY, items: { type: S.STRING } },
    techStack: {
      type: S.ARRAY,
      items: {
        type: S.OBJECT,
        properties: {
          name: { type: S.STRING },
          category: { type: S.STRING, description: "language | framework | library | api | tool | service | hardware" },
          url: { type: S.STRING },
        },
        required: ["name", "category"],
      },
    },
    steps: {
      type: S.ARRAY,
      items: {
        type: S.OBJECT,
        properties: {
          id: { type: S.STRING },
          title: { type: S.STRING },
          description: { type: S.STRING, description: "Markdown instructions" },
          code: {
            type: S.ARRAY,
            items: {
              type: S.OBJECT,
              properties: {
                language: { type: S.STRING },
                filename: { type: S.STRING },
                content: { type: S.STRING },
              },
              required: ["language", "content"],
            },
          },
          timestamp: { type: S.NUMBER, nullable: true, description: "Seconds into the video" },
          tools: { type: S.ARRAY, items: { type: S.STRING } },
          links: { type: S.ARRAY, items: link },
        },
        required: ["id", "title", "description"],
      },
    },
    resources: { type: S.ARRAY, items: link },
    mermaid: { type: S.STRING, description: "Mermaid flowchart source (flowchart TD)" },
  },
  required: ["title", "summary", "steps", "mermaid"],
};

export const chunkNotesSchema: ResponseSchema = {
  type: S.OBJECT,
  properties: {
    notes: {
      type: S.ARRAY,
      items: {
        type: S.OBJECT,
        properties: {
          timestamp: { type: S.NUMBER },
          action: { type: S.STRING },
          details: { type: S.STRING },
          code: { type: S.STRING },
          tools: { type: S.ARRAY, items: { type: S.STRING } },
        },
        required: ["timestamp", "action"],
      },
    },
  },
  required: ["notes"],
};

export const promptSchema: ResponseSchema = {
  type: S.OBJECT,
  properties: {
    prompts: {
      type: S.ARRAY,
      items: {
        type: S.OBJECT,
        properties: {
          title: { type: S.STRING },
          filename: { type: S.STRING },
          content: { type: S.STRING },
        },
        required: ["title", "content"],
      },
    },
    notes: { type: S.ARRAY, items: { type: S.STRING } },
  },
  required: ["prompts", "notes"],
};
