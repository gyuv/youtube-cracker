import { NextResponse } from "next/server";
import { GeminiError, generate, promptSchema } from "@/app/lib/gemini";
import { TARGET_TOOLS, type ApiError, type PromptEngineRequest, type PromptEngineResponse } from "@/app/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const TOOL_GUIDANCE: Record<string, string> = {
  cursor:
    "Output a `.cursorrules` file (project conventions, stack, do/don't rules) plus a Composer task prompt that implements the steps.",
  "claude-code":
    "Output a CLAUDE.md section (architecture, commands, conventions) plus a task prompt for Claude Code that lists files to create/modify, ordered sub-tasks, and verification commands to run.",
  copilot: "Output `.github/copilot-instructions.md` plus a Copilot Chat task prompt.",
  chatgpt: "Output a single self-contained system + user prompt for a general LLM.",
  midjourney:
    "Output 4-6 Midjourney prompts (with --ar, --style, --v parameters) that reproduce the visual assets/looks from the tutorial, adapted to the prior project's brand.",
  runway:
    "Output Runway Gen-3 / video-generation prompts (shot description, camera motion, duration, style) reproducing the tutorial's visual outputs.",
};

export async function POST(req: Request) {
  let body: PromptEngineRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ApiError>({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!body.currentSteps?.length || !TARGET_TOOLS.some((t) => t.id === body.targetTool)) {
    return NextResponse.json<ApiError>({ error: "currentSteps and a valid targetTool are required.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const steps = body.currentSteps
    .map((s, i) => `${i + 1}. ${s.title}\n${s.description}${s.code.map((c) => `\n\`\`\`${c.language}${c.filename ? ` ${c.filename}` : ""}\n${c.content}\n\`\`\``).join("")}`)
    .join("\n\n")
    .slice(0, 120_000);

  try {
    const out = await generate<PromptEngineResponse>({
      system: `You are a senior staff engineer and prompt architect. Write prompts that integrate a newly learned tutorial into the user's EXISTING project without collisions.
Rules:
- If prior project context is given, reuse its stack, folder structure, naming, and state management; map tutorial files to non-conflicting paths; call out dependency version conflicts, duplicated routes/env vars, and how to resolve them.
- If no prior context, target a clean new project.
- Prompts must be copy-paste ready, specific (file paths, commands, acceptance criteria), and ordered.
- ${TOOL_GUIDANCE[body.targetTool]}
- "notes": short integration warnings / collision risks.
Write explanatory prose in language "${body.targetLanguage ?? "en"}"; keep code and file names as-is.`,
      parts: [
        {
          text: `## New tutorial: ${body.currentTitle ?? "Untitled"}
Tech stack: ${(body.techStack ?? []).map((t) => t.name).join(", ") || "n/a"}

### Steps
${steps}

## Prior project context
${body.previousProjectContext?.slice(0, 60_000) || "(none — new project)"}`,
        },
      ],
      schema: promptSchema,
      temperature: 0.4,
    });
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof GeminiError) {
      return NextResponse.json<ApiError>({ error: err.message, code: err.code }, { status: err.code === "RATE_LIMIT" ? 429 : 502 });
    }
    return NextResponse.json<ApiError>({ error: String(err), code: "AI_ERROR" }, { status: 500 });
  }
}
