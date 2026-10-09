import * as React from "react";
import { cn } from "@/app/lib/utils";

export function Badge({ className, variant = "secondary", ...p }: React.HTMLAttributes<HTMLSpanElement> & { variant?: "secondary" | "outline" | "primary" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant === "secondary" && "bg-secondary text-secondary-foreground",
        variant === "outline" && "border",
        variant === "primary" && "bg-primary/15 text-primary",
        className,
      )}
      {...p}
    />
  );
}
