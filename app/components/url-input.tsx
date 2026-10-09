"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Clipboard, Loader2, Sparkles, Youtube } from "lucide-react";
import { Button } from "./ui/button";
import { extractVideoId } from "@/app/lib/utils";
import { cn } from "@/app/lib/utils";

interface Props {
  onSubmit: (url: string) => void;
  loading?: boolean;
}

export function UrlInput({ onSubmit, loading }: Props) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const valid = !!extractVideoId(value);
  const showError = touched && value.length > 0 && !valid;

  const submit = (v = value) => {
    setTouched(true);
    if (extractVideoId(v) && !loading) onSubmit(v.trim());
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setValue(t);
      if (extractVideoId(t)) submit(t); // paste-and-run
    } catch {
      /* clipboard permission denied — user can paste manually */
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="w-full"
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl border bg-card p-2 shadow-lg ring-offset-background transition focus-within:ring-2 focus-within:ring-ring",
          showError && "border-destructive focus-within:ring-destructive",
        )}
      >
        <Youtube className="ml-2 h-5 w-5 shrink-0 text-red-500" />
        <input
          aria-label="YouTube tutorial URL"
          aria-invalid={showError}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (extractVideoId(t)) setTimeout(() => submit(t), 0);
          }}
          placeholder="Paste any YouTube tutorial URL…"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-base outline-none placeholder:text-muted-foreground"
          disabled={loading}
        />
        <Button type="button" variant="ghost" size="icon" onClick={paste} title="Paste from clipboard" disabled={loading}>
          <Clipboard />
        </Button>
        <Button type="submit" size="lg" disabled={loading || (touched && !valid)} className="rounded-xl">
          {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          <span className="hidden sm:inline">{loading ? "Working…" : "Recreate"}</span>
        </Button>
      </div>
      {showError && (
        <p className="mt-2 pl-2 text-sm text-destructive">
          Enter a youtube.com/watch, youtu.be, /shorts/ or /embed/ link.
        </p>
      )}
    </motion.form>
  );
}
