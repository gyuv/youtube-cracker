"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./ui/button";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="text-emerald-500" /> : <Copy />}
      {label && <span>{copied ? "Copied" : label}</span>}
    </Button>
  );
}
