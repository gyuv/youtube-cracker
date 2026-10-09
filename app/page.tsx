"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenCheck, Code2, Moon, Network, Sun, Wand2 } from "lucide-react";
import { UrlInput } from "./components/url-input";
import { ProcessingStatus, STAGES, type Stage } from "./components/processing-status";
import { StepBreakdown } from "./components/step-breakdown";
import { VisualDiagram } from "./components/visual-diagram";
import { PromptStudio } from "./components/prompt-studio";
import { LanguageSwitcher } from "./components/language-switcher";
import { ProjectHistory } from "./components/project-history";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { useToast } from "./components/ui/toaster";
import { postJSON, type ClientApiError } from "./lib/api-client";
import { cacheTranslation, getProject, getSetting, saveProject, setSetting, setStepProgress } from "./lib/storage";
import { cn, extractVideoId } from "./lib/utils";
import type { ExtractResponse, Guide, Project } from "./lib/types";

const TABS = [
  { id: "guide", label: "Reproduction Guide", icon: BookOpenCheck },
  { id: "visual", label: "Visual Workflow", icon: Network },
  { id: "prompts", label: "Prompt Studio", icon: Wand2 },
] as const;
type TabId = (typeof TABS)[number]["id"];

const ERROR_TITLES: Record<string, string> = {
  INVALID_URL: "Invalid or unavailable video",
  NO_TRANSCRIPT: "No transcript available",
  RATE_LIMIT: "Free-tier rate limit hit",
  NO_API_KEY: "Server not configured",
};

export default function Home() {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>(-1);
  const [detail, setDetail] = useState<string>();
  const [project, setProject] = useState<Project | null>(null);
  const [lang, setLang] = useState("en");
  const [translating, setTranslating] = useState(false);
  const [tab, setTab] = useState<TabId>("guide");
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [dark, setDark] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    getSetting("language", "en").then(setLang);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };

  const fail = (e: unknown) => {
    const err = e as ClientApiError;
    toast({ kind: "error", title: ERROR_TITLES[err.code ?? ""] ?? "Something went wrong", description: err.message });
    setStage(-1);
    setDetail(undefined);
  };

  const run = async (url: string) => {
    const videoId = extractVideoId(url)!;
    // Instant load from local history in the requested language.
    const cached = await getProject(videoId);
    if (cached?.guides[lang]) {
      setProject(cached);
      toast({ kind: "info", title: "Loaded from history", description: "This tutorial was already processed." });
      return;
    }

    setProject(null);
    try {
      setStage(0);
      setDetail("Looking for captions…");
      const ex = await postJSON<ExtractResponse>("/api/extract", { url, targetLanguage: lang }, { queued: false });
      setDetail(
        ex.source === "transcript"
          ? `Found ${ex.transcriptLanguage} captions (${ex.transcript!.length} segments)`
          : "No captions — Gemini will watch the video directly",
      );

      setStage(1);
      const { guide } = await postJSON<{ guide: Guide }>("/api/synthesize", { ...ex, targetLanguage: lang });

      setStage(2);
      setDetail("Rendering diagrams & verifying links");
      const saved = await saveProject(ex.meta, guide, lang);

      setStage(3);
      setDetail(lang === "en" ? undefined : "Translated output cached locally");
      await new Promise((r) => setTimeout(r, 300));
      setStage(STAGES.length);
      setProject(saved);
      setTab("guide");
      toast({ kind: "success", title: "Guide ready", description: `${guide.steps.length} steps extracted.` });
      setTimeout(() => setStage(-1), 800);
    } catch (e) {
      fail(e);
    }
  };

  /** Language switch: cache-first (IndexedDB), translate API only on miss. */
  const handleLanguage = useCallback(
    async (code: string) => {
      setLang(code);
      setSetting("language", code);
      if (!project || project.guides[code]) return;
      const base = project.guides[project.baseLanguage] ?? Object.values(project.guides)[0];
      setTranslating(true);
      try {
        const { guide } = await postJSON<{ guide: Guide }>("/api/synthesize", {
          meta: { videoId: project.id, url: project.videoUrl, title: project.title, author: "", thumbnail: project.thumbnail },
          source: "transcript",
          targetLanguage: code,
          translateFrom: base,
        });
        await cacheTranslation(project.id, code, guide);
        setProject((p) => (p ? { ...p, guides: { ...p.guides, [code]: guide } } : p));
      } catch (e) {
        const err = e as ClientApiError;
        toast({ kind: "error", title: "Translation failed", description: err.message });
      } finally {
        setTranslating(false);
      }
    },
    [project, toast],
  );

  const guide = project ? project.guides[lang] ?? project.guides[project.baseLanguage] : null;

  const toggleStep = async (stepId: string, done: boolean) => {
    if (!project) return;
    setProject({ ...project, progress: { ...project.progress, [stepId]: done } });
    await setStepProgress(project.id, stepId, done);
  };

  const seek = (s: number) => {
    setSeekTo(Math.floor(s));
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const openProject = (p: Project) => {
    setProject(p);
    setSeekTo(null);
    setTab("guide");
    if (!p.guides[lang]) handleLanguage(lang);
  };

  const busy = stage >= 0 && stage < STAGES.length;

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_60%)]">
      <header className="container flex items-center justify-between py-4">
        <div className="flex items-center gap-2 font-semibold">
          <Code2 className="h-6 w-6 text-primary" />
          Tutorial2Code <span className="text-muted-foreground">/ RecreateAI</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher value={lang} onChange={handleLanguage} cached={project ? Object.keys(project.guides) : []} loading={translating} />
          <ProjectHistory onOpen={openProject} />
          <Button size="icon" variant="ghost" onClick={toggleTheme} aria-label="Toggle theme">
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <section className="container flex max-w-3xl flex-col items-center gap-6 pb-10 pt-10 text-center sm:pt-16">
        <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-4xl font-bold tracking-tight sm:text-5xl">
          Watch less. <span className="bg-gradient-to-r from-primary to-fuchsia-500 bg-clip-text text-transparent">Build more.</span>
        </motion.h1>
        <p className="max-w-xl text-muted-foreground">
          Paste any YouTube tutorial. Get an exhaustive, timestamped, step-by-step reproduction guide with verified links, diagrams, and prompts tailored to your projects.
        </p>
        <UrlInput onSubmit={run} loading={busy} />
        <AnimatePresence>{stage >= 0 && <ProcessingStatus stage={stage} detail={detail} />}</AnimatePresence>
      </section>

      <AnimatePresence mode="wait">
        {project && guide && (
          <motion.section key={project.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="container pb-24">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="order-2 min-w-0 lg:order-1">
                <h2 className="text-2xl font-bold">{guide.title}</h2>
                <a href={project.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:underline">
                  {project.videoUrl}
                </a>

                <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl border bg-muted/40 p-1" role="tablist">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => setTab(t.id)}
                      className={cn("relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", tab === t.id ? "text-foreground" : "text-muted-foreground")}
                    >
                      {tab === t.id && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-lg bg-background shadow" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                      <t.icon className="relative h-4 w-4" />
                      <span className="relative">{t.label}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-6">
                  <AnimatePresence mode="wait">
                    <motion.div key={tab + lang} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                      {tab === "guide" && <StepBreakdown guide={guide} videoUrl={project.videoUrl} progress={project.progress} onToggle={toggleStep} onSeek={seek} />}
                      {tab === "visual" && <VisualDiagram guide={guide} onSeek={seek} />}
                      {tab === "prompts" && <PromptStudio guide={guide} currentProjectId={project.id} language={lang} />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <aside className="order-1 lg:order-2">
                <div ref={playerRef} className="space-y-3 lg:sticky lg:top-4">
                  <div className="aspect-video overflow-hidden rounded-xl border bg-black shadow">
                    <iframe
                      key={seekTo ?? "init"}
                      className="h-full w-full"
                      src={`https://www.youtube-nocookie.com/embed/${project.id}?rel=0${seekTo != null ? `&start=${seekTo}&autoplay=1` : ""}`}
                      title={project.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {guide.techStack.slice(0, 12).map((t) => (
                      <Badge key={t.name} variant="outline">
                        {t.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
