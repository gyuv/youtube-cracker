"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "framer-motion";
import { History, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./ui/sheet";
import { db, deleteProject } from "@/app/lib/storage";
import type { Project } from "@/app/lib/types";

export function ProjectHistory({ onOpen }: { onOpen: (p: Project) => void }) {
  const projects = useLiveQuery(() => db.projects.orderBy("date").reverse().toArray(), []);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <History /> History {projects?.length ? `(${projects.length})` : ""}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <div>
          <SheetTitle className="text-lg font-semibold">Project history</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">Stored locally in your browser (IndexedDB).</SheetDescription>
        </div>
        <div className="-mx-2 flex-1 space-y-2 overflow-y-auto px-2">
          {projects?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No projects yet.</p>}
          {projects?.map((p, i) => {
            const done = Object.values(p.progress).filter(Boolean).length;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="group flex gap-3 rounded-lg border p-2 hover:bg-accent"
              >
                <button className="flex flex-1 gap-3 text-left" onClick={() => onOpen(p)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbnail} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.date).toLocaleDateString()} · {done}/{p.steps.length} done · {Object.keys(p.guides).join(", ")}
                    </p>
                  </div>
                </button>
                <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => deleteProject(p.id)} aria-label="Delete project">
                  <Trash2 />
                </Button>
              </motion.div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
