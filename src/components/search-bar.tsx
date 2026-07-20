"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

type SearchBarProps = {
  onSearch: (query: string) => void;
  isLoading?: boolean;
};

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [value, setValue] = useState("Pikachu");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onSearch(value.trim());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Buscar carta pelo nome…"
        className="h-11 rounded-xl border-border/80 bg-background/80 pl-10 text-base shadow-sm"
        aria-label="Buscar carta pelo nome"
      />
      {isLoading ? (
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
          Buscando…
        </span>
      ) : null}
    </div>
  );
}
