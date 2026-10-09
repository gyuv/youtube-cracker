"use client";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/app/lib/utils";

export const STAGES = ["Fetching transcript", "Analyzing steps", "Generating diagrams", "Translating"] as const;
export type Stage = number; // index into STAGES, STAGES.length = done, -1 = idle

export function ProcessingStatus({ stage, detail }: { stage: Stage; detail?: string }) {
  if (stage < 0) return null;
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="w-full">
      <ol className="flex flex-wrap items-center justify-center gap-2 sm:gap-0">
        {STAGES.map((label, i) => {
          const done = i < stage;
          const active = i === stage;
          return (
            <li key={label} className="flex items-center">
              <div className="flex items-center gap-2">
                <motion.span
                  animate={{ scale: active ? [1, 1.12, 1] : 1 }}
                  transition={{ repeat: active ? Infinity : 0, duration: 1.4 }}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary text-primary",
                    !done && !active && "text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
                </motion.span>
                <span className={cn("text-sm", active ? "font-medium" : "text-muted-foreground")}>{label}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className="mx-3 hidden h-px w-10 overflow-hidden bg-border sm:block">
                  <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: done ? "100%" : 0 }} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {detail && <p className="mt-3 text-center text-xs text-muted-foreground">{detail}</p>}
    </motion.div>
  );
}
