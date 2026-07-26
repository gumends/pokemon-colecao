"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ScrollButtons() {
  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2 sm:right-6 sm:bottom-6">
      <Button
        size="icon"
        variant="outline"
        aria-label="Ir para o início da página"
        className="rounded-full shadow-md"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <ArrowUp />
      </Button>
      <Button
        size="icon"
        variant="outline"
        aria-label="Ir para o fim da página"
        className="rounded-full shadow-md"
        onClick={() =>
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
          })
        }
      >
        <ArrowDown />
      </Button>
    </div>
  );
}
