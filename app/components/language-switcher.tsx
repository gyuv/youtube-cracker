"use client";
import { Globe, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { LANGUAGES } from "@/app/lib/types";

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** Languages already cached for the current project — shown with a ● marker. */
  cached?: string[];
  loading?: boolean;
}

/**
 * Pure UI: the parent checks the IndexedDB translation cache first and only
 * calls the translate API on a miss (see handleLanguage in page.tsx).
 */
export function LanguageSwitcher({ value, onChange, cached = [], loading }: Props) {
  return (
    <Select value={value} onValueChange={onChange} disabled={loading}>
      <SelectTrigger className="w-[170px]" aria-label="Output language">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code}>
            {l.label}
            {cached.includes(l.code) && <span className="ml-2 text-xs text-emerald-500">●</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
