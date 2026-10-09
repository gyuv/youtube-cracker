import { z } from "zod";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "hi", label: "हिन्दी" },
  { code: "ta", label: "தமிழ்" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "pt", label: "Português" },
  { code: "ar", label: "العربية" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const TARGET_TOOLS = [
  { id: "cursor", label: "Cursor Rules (.cursorrules)" },
  { id: "claude-code", label: "Claude Code (CLAUDE.md + task)" },
  { id: "copilot", label: "GitHub Copilot Instructions" },
  { id: "chatgpt", label: "ChatGPT / Generic LLM" },
  { id: "midjourney", label: "Midjourney Prompts" },
  { id: "runway", label: "Runway / Video Gen Prompts" },
] as const;
export type TargetTool = (typeof TARGET_TOOLS)[number]["id"];

export interface TranscriptSegment {
  text: string;
  start: number; // seconds
  duration: number;
}

export interface VideoMeta {
  videoId: string;
  url: string;
  title: string;
  author: string;
  thumbnail: string;
  lengthSeconds?: number;
}

export interface ExtractResponse {
  meta: VideoMeta;
  source: "transcript" | "video";
  transcript?: TranscriptSegment[];
  transcriptLanguage?: string;
}

export const ResourceLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
  kind: z.string().optional(),
  verified: z.boolean().optional(),
});

export const StepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(), // markdown
  code: z
    .array(z.object({ language: z.string(), filename: z.string().optional(), content: z.string() }))
    .default([]),
  timestamp: z.number().nullable().default(null), // seconds
  tools: z.array(z.string()).default([]),
  links: z.array(ResourceLinkSchema).default([]),
});

export const GuideSchema = z.object({
  title: z.string(),
  summary: z.string(),
  difficulty: z.string().default("intermediate"),
  estimatedTime: z.string().default(""),
  prerequisites: z.array(z.string()).default([]),
  techStack: z
    .array(z.object({ name: z.string(), category: z.string().default("tool"), url: z.string().optional() }))
    .default([]),
  steps: z.array(StepSchema).min(1),
  resources: z.array(ResourceLinkSchema).default([]),
  mermaid: z.string().default(""),
});

export type ResourceLink = z.infer<typeof ResourceLinkSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Guide = z.infer<typeof GuideSchema>;

export interface SynthesizeRequest {
  meta: VideoMeta;
  source: "transcript" | "video";
  transcript?: TranscriptSegment[];
  targetLanguage: string;
  /** If provided, skip analysis and only translate this guide. */
  translateFrom?: Guide;
}

export interface PromptEngineRequest {
  currentSteps: Step[];
  currentTitle?: string;
  techStack?: Guide["techStack"];
  previousProjectContext?: string;
  targetTool: TargetTool;
  targetLanguage?: string;
}

export interface PromptEngineResponse {
  prompts: { title: string; filename?: string; content: string }[];
  notes: string[];
}

export interface Project {
  id: string; // videoId
  title: string;
  videoUrl: string;
  thumbnail: string;
  date: number;
  steps: Step[];
  techStack: Guide["techStack"];
  rawSummary: string;
  /** Guides keyed by language code — the translation cache. */
  guides: Record<string, Guide>;
  baseLanguage: string;
  progress: Record<string, boolean>; // stepId -> done
  notes?: string;
}

export interface ApiError {
  error: string;
  code?: "INVALID_URL" | "NO_TRANSCRIPT" | "RATE_LIMIT" | "NO_API_KEY" | "AI_ERROR" | "BAD_REQUEST";
}
