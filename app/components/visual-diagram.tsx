"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CopyButton } from "./copy-button";
import { cn, formatTimestamp } from "@/app/lib/utils";
import type { Guide } from "@/app/lib/types";

/** Sanitizes common LLM mermaid mistakes before rendering. */
function sanitize(src: string) {
  let s = src.trim().replace(/^```(?:mermaid)?/i, "").replace(/```$/, "").trim();
  if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|mindmap|timeline)/.test(s)) {
    s = `flowchart TD\n${s}`;
  }
  return s;
}

function fallbackMermaid(guide: Guide) {
  const lines = ["flowchart TD"];
  guide.steps.forEach((s, i) => {
    lines.push(`  S${i}["${(i + 1).toString()}. ${s.title.replace(/["()[\]{}]/g, "")}"]`);
    if (i) lines.push(`  S${i - 1} --> S${i}`);
  });
  return lines.join("\n");
}

function MermaidView({ code, fallback }: { code: string; fallback: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import("mermaid")).default;
      const dark = document.documentElement.classList.contains("dark");
      mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict", fontFamily: "inherit" });
      for (const [n, src] of [code, fallback].entries()) {
        try {
          const { svg } = await mermaid.render(`m${id}${n}`, sanitize(src));
          if (!cancelled && ref.current) ref.current.innerHTML = svg;
          setError(n > 0);
          return;
        } catch {
          document.getElementById(`dm${id}${n}`)?.remove(); // mermaid leaves error nodes behind
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, fallback, id]);

  return (
    <div>
      {error && <p className="mb-2 text-xs text-muted-foreground">AI diagram had syntax errors — showing auto-generated flow.</p>}
      <div ref={ref} className="flex min-h-[200px] justify-center overflow-auto [&_svg]:h-auto [&_svg]:max-w-full" />
    </div>
  );
}

export function VisualDiagram({ guide, onSeek }: { guide: Guide; onSeek?: (s: number) => void }) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const n = guide.steps.length;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setActive((a) => (a + 1) % n), 2500);
    return () => clearInterval(t);
  }, [playing, n]);

  const step = guide.steps[active];

  return (
    <div className="space-y-6">
      {/* Animated step-through timeline */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Animated workflow</h3>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" onClick={() => setActive((a) => (a - 1 + n) % n)} aria-label="Previous">
              <ChevronLeft />
            </Button>
            <Button size="icon" variant="outline" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button size="icon" variant="outline" onClick={() => setActive((a) => (a + 1) % n)} aria-label="Next">
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div className="flex items-center overflow-x-auto pb-3">
          {guide.steps.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <motion.button
                onClick={() => setActive(i)}
                animate={{
                  scale: i === active ? 1.2 : 1,
                  boxShadow: i === active ? "0 0 0 6px hsl(var(--primary) / 0.25)" : "0 0 0 0px hsl(var(--primary) / 0)",
                }}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  i <= active ? "border-primary bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
                title={s.title}
              >
                {i + 1}
              </motion.button>
              {i < n - 1 && (
                <div className="h-0.5 w-8 bg-muted">
                  <motion.div className="h-full bg-primary" animate={{ width: i < active ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
                </div>
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -16, filter: "blur(4px)" }}
            transition={{ duration: 0.3 }}
            className="mt-2 rounded-lg border bg-muted/30 p-4"
          >
            <div className="text-xs text-muted-foreground">
              Step {active + 1} of {n}
              {step.timestamp != null && (
                <button className="ml-2 text-primary hover:underline" onClick={() => onSeek?.(step.timestamp!)}>
                  ▶ {formatTimestamp(step.timestamp)}
                </button>
              )}
            </div>
            <h4 className="mt-1 text-lg font-semibold">{step.title}</h4>
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{step.description.replace(/[#*`]/g, "")}</p>
            {step.tools.length > 0 && <p className="mt-2 text-xs text-primary">{step.tools.join(" · ")}</p>}
          </motion.div>
        </AnimatePresence>
      </Card>

      {/* Mermaid architecture */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Architecture diagram</h3>
          <CopyButton text={guide.mermaid} label="Mermaid" />
        </div>
        <MermaidView code={guide.mermaid || fallbackMermaid(guide)} fallback={fallbackMermaid(guide)} />
      </Card>
    </div>
  );
}
