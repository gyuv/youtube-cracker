"use client";
import Dexie, { type Table } from "dexie";
import type { Guide, Project } from "./types";

interface Setting {
  key: string;
  value: unknown;
}

class RecreateDB extends Dexie {
  projects!: Table<Project, string>;
  settings!: Table<Setting, string>;
  constructor() {
    super("recreate-ai");
    this.version(1).stores({
      projects: "id, date, title",
      settings: "key",
    });
  }
}

export const db = new RecreateDB();

export async function saveProject(
  meta: { videoId: string; url: string; title: string; thumbnail: string },
  guide: Guide,
  lang: string,
): Promise<Project> {
  const existing = await db.projects.get(meta.videoId);
  const project: Project = {
    id: meta.videoId,
    title: guide.title || meta.title,
    videoUrl: meta.url,
    thumbnail: meta.thumbnail,
    date: Date.now(),
    steps: guide.steps,
    techStack: guide.techStack,
    rawSummary: guide.summary,
    guides: { ...(existing?.guides ?? {}), [lang]: guide },
    baseLanguage: existing?.baseLanguage ?? lang,
    progress: existing?.progress ?? {},
    notes: existing?.notes,
  };
  await db.projects.put(project);
  return project;
}

export async function cacheTranslation(id: string, lang: string, guide: Guide) {
  await db.projects.where("id").equals(id).modify((p) => {
    p.guides[lang] = guide;
  });
}

export const getProject = (id: string) => db.projects.get(id);
export const deleteProject = (id: string) => db.projects.delete(id);
export const listProjects = () => db.projects.orderBy("date").reverse().toArray();

export async function setStepProgress(id: string, stepId: string, done: boolean) {
  await db.projects.where("id").equals(id).modify((p) => {
    p.progress[stepId] = done;
  });
}

export async function updateProjectNotes(id: string, notes: string) {
  await db.projects.update(id, { notes });
}

/** Compact, token-cheap description of a past project for the Prompt Studio. */
export function projectAsContext(p: Project): string {
  const g = p.guides[p.baseLanguage] ?? Object.values(p.guides)[0];
  const files = new Set<string>();
  g?.steps.forEach((s) => s.code.forEach((c) => c.filename && files.add(c.filename)));
  return [
    `Project: ${p.title} (${p.videoUrl})`,
    `Summary: ${p.rawSummary}`,
    `Tech stack: ${p.techStack.map((t) => `${t.name} [${t.category}]`).join(", ")}`,
    files.size ? `Known files: ${[...files].join(", ")}` : "",
    `Steps built: ${p.steps.map((s, i) => `${i + 1}. ${s.title}`).join("; ")}`,
    p.notes ? `User notes: ${p.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    return ((await db.settings.get(key))?.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value });
