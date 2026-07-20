"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

type SearchBarProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  isLoading?: boolean;
};

export function SearchBar({
  value,
  onValueChange,
  placeholder = "Buscar…",
  isLoading,
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (localValue.trim() !== value.trim()) {
        onValueChange(localValue.trim());
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [localValue, onValueChange, value]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-xl border-border/80 bg-background/80 pl-10 text-base shadow-sm"
        aria-label={placeholder}
      />
      {isLoading ? (
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
          Buscando…
        </span>
      ) : null}
    </div>
  );
}
