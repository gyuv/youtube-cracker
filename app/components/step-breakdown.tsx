"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Circle, Clock, ExternalLink, PlayCircle, ShieldCheck } from "lucide-react";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { CopyButton } from "./copy-button";
import { Markdown } from "./markdown";
import { cn, formatTimestamp } from "@/app/lib/utils";
import type { Guide } from "@/app/lib/types";

interface Props {
  guide: Guide;
  videoUrl: string;
  progress: Record<string, boolean>;
  onToggle: (stepId: string, done: boolean) => void;
  onSeek?: (seconds: number) => void;
}

export function StepBreakdown({ guide, videoUrl, progress, onToggle, onSeek }: Props) {
  const [open, setOpen] = useState<string | null>(guide.steps[0]?.id ?? null);
  const done = guide.steps.filter((s) => progress[s.id]).length;
  const pct = Math.round((done / guide.steps.length) * 100);

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary">{guide.difficulty}</Badge>
          {guide.estimatedTime && (
            <Badge>
              <Clock className="h-3 w-3" /> {guide.estimatedTime}
            </Badge>
          )}
          <Badge variant="outline">{guide.steps.length} steps</Badge>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{guide.summary}</p>

        {guide.prerequisites.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prerequisites</h4>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {guide.prerequisites.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="text-primary">•</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {guide.techStack.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {guide.techStack.map((t) =>
              t.url ? (
                <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer">
                  <Badge variant="outline" className="hover:bg-accent">
                    {t.name} <span className="text-muted-foreground">· {t.category}</span>
                  </Badge>
                </a>
              ) : (
                <Badge key={t.name} variant="outline">
                  {t.name} <span className="text-muted-foreground">· {t.category}</span>
                </Badge>
              ),
            )}
          </div>
        )}

        <div className="mt-5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>
              {done}/{guide.steps.length} · {pct}%
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full bg-primary" animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
          </div>
        </div>
      </Card>

      {/* Steps */}
      <ol className="relative space-y-3 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-border">
        {guide.steps.map((step, i) => {
          const isDone = !!progress[step.id];
          const isOpen = open === step.id;
          return (
            <motion.li
              key={step.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.6) }}
              className="relative pl-12"
            >
              <button
                onClick={() => onToggle(step.id, !isDone)}
                className="absolute left-0 top-4 z-10 rounded-full bg-background"
                aria-label={isDone ? "Mark step incomplete" : "Mark step complete"}
              >
                <motion.span whileTap={{ scale: 0.8 }} className="block">
                  {isDone ? <CheckCircle2 className="h-10 w-10 text-primary" /> : <Circle className="h-10 w-10 text-muted-foreground/40" />}
                </motion.span>
              </button>

              <Card className={cn("overflow-hidden transition", isDone && "opacity-70")}>
                <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : step.id)}>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-muted-foreground">Step {i + 1}</div>
                    <h3 className={cn("font-semibold", isDone && "line-through")}>{step.title}</h3>
                  </div>
                  {step.timestamp != null && (
                    <Badge variant="primary" className="shrink-0">
                      <PlayCircle className="h-3 w-3" /> {formatTimestamp(step.timestamp)}
                    </Badge>
                  )}
                  <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 transition", isOpen && "rotate-180")} />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 border-t px-4 py-4">
                        <Markdown>{step.description}</Markdown>

                        {step.code.map((c, ci) => (
                          <div key={ci} className="overflow-hidden rounded-lg border">
                            <div className="flex items-center justify-between bg-muted/60 px-3 py-1 text-xs">
                              <span className="font-mono text-muted-foreground">{c.filename || c.language}</span>
                              <CopyButton text={c.content} label="Copy" />
                            </div>
                            <pre className="max-h-96 overflow-auto bg-muted/30 p-3 text-xs">
                              <code className="font-mono">{c.content}</code>
                            </pre>
                          </div>
                        ))}

                        <div className="flex flex-wrap items-center gap-2">
                          {step.timestamp != null && (
                            <a
                              href={`${videoUrl}&t=${Math.floor(step.timestamp)}s`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                if (onSeek) {
                                  e.preventDefault();
                                  onSeek(step.timestamp!);
                                }
                              }}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <PlayCircle className="h-3.5 w-3.5" /> Watch at {formatTimestamp(step.timestamp)}
                            </a>
                          )}
                          {step.tools.map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>

                        {step.links.length > 0 && (
                          <ul className="space-y-1">
                            {step.links.map((l) => (
                              <li key={l.url}>
                                <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                                  {l.verified ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> : <ExternalLink className="h-3.5 w-3.5" />}
                                  {l.label}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.li>
          );
        })}
      </ol>

      {guide.resources.length > 0 && (
        <Card className="p-5">
          <h4 className="mb-3 font-semibold">Verified resources</h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {guide.resources.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="truncate">{r.label}</span>
                  {r.kind && <Badge className="ml-auto">{r.kind}</Badge>}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
