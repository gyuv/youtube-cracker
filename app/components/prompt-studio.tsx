"use client";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Link2, Loader2, Paperclip, Wand2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Textarea } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { CopyButton } from "./copy-button";
import { useToast } from "./ui/toaster";
import { db, getSetting, projectAsContext, setSetting } from "@/app/lib/storage";
import { postJSON } from "@/app/lib/api-client";
import { TARGET_TOOLS, type Guide, type PromptEngineResponse, type TargetTool } from "@/app/lib/types";

interface Props {
  guide: Guide;
  currentProjectId: string;
  language: string;
}

export function PromptStudio({ guide, currentProjectId, language }: Props) {
  const toast = useToast();
  const projects = useLiveQuery(() => db.projects.orderBy("date").reverse().toArray(), []);
  const [tool, setTool] = useState<TargetTool>("claude-code");
  const [attached, setAttached] = useState<string[]>([]);
  const [customContext, setCustomContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PromptEngineResponse | null>(null);

  // Persist prompt customization preferences.
  useEffect(() => {
    getSetting<TargetTool>("promptTool", "claude-code").then(setTool);
    getSetting<string>("promptCustomContext", "").then(setCustomContext);
  }, []);
  useEffect(() => void setSetting("promptTool", tool), [tool]);

  const others = useMemo(() => projects?.filter((p) => p.id !== currentProjectId) ?? [], [projects, currentProjectId]);

  const generate = async () => {
    setLoading(true);
    setResult(null);
    try {
      await setSetting("promptCustomContext", customContext);
      const ctx = [
        ...attached.map((id) => others.find((p) => p.id === id)).filter(Boolean).map((p) => projectAsContext(p!)),
        customContext && `Additional context about my existing project:\n${customContext}`,
      ]
        .filter(Boolean)
        .join("\n\n---\n\n");
      const res = await postJSON<PromptEngineResponse>("/api/prompt-engine", {
        currentSteps: guide.steps,
        currentTitle: guide.title,
        techStack: guide.techStack,
        previousProjectContext: ctx || undefined,
        targetTool: tool,
        targetLanguage: language,
      });
      setResult(res);
    } catch (e: any) {
      toast({ kind: "error", title: "Prompt generation failed", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      <Card className="h-fit space-y-5 p-5">
        <div>
          <label className="text-sm font-medium">Target tool</label>
          <Select value={tool} onValueChange={(v) => setTool(v as TargetTool)}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_TOOLS.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium">Attach prior projects as context</label>
          <div className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto">
            {others.length === 0 && <p className="text-xs text-muted-foreground">Extract more tutorials to build up reusable context.</p>}
            {others.map((p) => {
              const on = attached.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setAttached((a) => (on ? a.filter((x) => x !== p.id) : [...a, p.id]))}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition ${on ? "border-primary bg-primary/10" : "hover:bg-accent"}`}
                >
                  {on ? <Link2 className="h-4 w-4 text-primary" /> : <Paperclip className="h-4 w-4 text-muted-foreground" />}
                  <span className="line-clamp-1 flex-1">{p.title}</span>
                  {on && <X className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Describe your existing project (optional)</label>
          <Textarea
            className="mt-1.5"
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder="e.g. Next.js 14 app router, Supabase auth, tRPC, src/features/* folder structure…"
          />
        </div>

        <Button className="w-full" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}
          Generate prompts
        </Button>
      </Card>

      <div className="space-y-4">
        {!result && !loading && (
          <Card className="flex h-full min-h-[240px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Pick a tool, attach prior builds, and generate collision-free prompts that merge this tutorial into your stack.
          </Card>
        )}
        {loading && (
          <Card className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <motion.div key={i} className="h-4 rounded bg-muted" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }} style={{ width: `${90 - i * 20}%` }} />
            ))}
          </Card>
        )}
        <AnimatePresence>
          {result?.notes.length ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="border-amber-500/40 bg-amber-500/5 p-4">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Integration notes
                </h4>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {result.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </Card>
            </motion.div>
          ) : null}
          {result?.prompts.map((p, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
                  <div>
                    <p className="text-sm font-semibold">{p.title}</p>
                    {p.filename && <p className="font-mono text-xs text-muted-foreground">{p.filename}</p>}
                  </div>
                  <CopyButton text={p.content} label="Copy" />
                </div>
                <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs">{p.content}</pre>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
