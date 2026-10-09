"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/app/lib/utils";

type ToastKind = "error" | "success" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

const Ctx = React.createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => React.useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.kind === "error" ? 7000 : 4000);
  }, []);
  const Icon = { error: AlertCircle, success: CheckCircle2, info: Info };

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((t) => {
            const I = Icon[t.kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60 }}
                role="status"
                className={cn(
                  "pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-4 shadow-lg",
                  t.kind === "error" && "border-destructive/50",
                )}
              >
                <I className={cn("mt-0.5 h-5 w-5 shrink-0", t.kind === "error" ? "text-destructive" : t.kind === "success" ? "text-emerald-500" : "text-primary")} />
                <div className="flex-1 text-sm">
                  <p className="font-medium">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-muted-foreground">{t.description}</p>}
                </div>
                <button onClick={() => setToasts((a) => a.filter((x) => x.id !== t.id))} aria-label="Dismiss">
                  <X className="h-4 w-4 opacity-60" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
