"use client";

import type { CardBrief } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_ORDER = [
  "Planta",
  "Fogo",
  "Água",
  "Elétrico",
  "Psíquico",
  "Lutador",
  "Sombrio",
  "Metal",
  "Dragão",
  "Fada",
  "Incolor",
];

/** Tipos presentes nas cartas, na ordem clássica do TCG. */
export function collectTypes(cards: CardBrief[]): string[] {
  const found = new Set<string>();
  for (const card of cards) {
    for (const type of card.types ?? []) found.add(type);
  }
  const ordered = TYPE_ORDER.filter((type) => found.has(type));
  const extras = [...found].filter((type) => !TYPE_ORDER.includes(type)).sort();
  return [...ordered, ...extras];
}

type TypeVisual = {
  /** Nome do arquivo em /public/types (ex.: Grass) */
  icon: string;
  /** Cor do círculo, como no símbolo de energia oficial */
  color: string;
};

const TYPE_VISUALS: Record<string, TypeVisual> = {
  Planta: { icon: "Grass", color: "#7CB342" },
  Grass: { icon: "Grass", color: "#7CB342" },
  Fogo: { icon: "Fire", color: "#E53935" },
  Fire: { icon: "Fire", color: "#E53935" },
  Água: { icon: "Water", color: "#29B6F6" },
  Water: { icon: "Water", color: "#29B6F6" },
  Elétrico: { icon: "Lightning", color: "#FDD835" },
  Lightning: { icon: "Lightning", color: "#FDD835" },
  Psíquico: { icon: "Psychic", color: "#AB47BC" },
  Psychic: { icon: "Psychic", color: "#AB47BC" },
  Lutador: { icon: "Fighting", color: "#C97745" },
  Fighting: { icon: "Fighting", color: "#C97745" },
  Sombrio: { icon: "Darkness", color: "#4B5E66" },
  Darkness: { icon: "Darkness", color: "#4B5E66" },
  Metal: { icon: "Metal", color: "#B8BCC0" },
  Fada: { icon: "Fairy", color: "#EC407A" },
  Fairy: { icon: "Fairy", color: "#EC407A" },
  Dragão: { icon: "Dragon", color: "#C6A114" },
  Dragon: { icon: "Dragon", color: "#C6A114" },
  Incolor: { icon: "Colorless", color: "#E8E6E1" },
  Colorless: { icon: "Colorless", color: "#E8E6E1" },
};

type TypeFilterProps = {
  types: string[];
  selected: string | null;
  onSelect: (type: string | null) => void;
};

export function TypeFilter({ types, selected, onSelect }: TypeFilterProps) {
  if (types.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex h-9 items-center rounded-full border border-border px-4 text-sm font-medium transition-colors",
          selected === null
            ? "border-foreground bg-foreground text-background"
            : "bg-background text-foreground hover:bg-muted",
        )}
      >
        Todos
      </button>
      {types.map((type) => {
        const visual = TYPE_VISUALS[type];
        const isSelected = selected === type;

        return (
          <button
            key={type}
            type="button"
            title={type}
            aria-label={type}
            onClick={() => onSelect(isSelected ? null : type)}
            className={cn(
              "flex size-9 items-center justify-center rounded-full border shadow-sm transition-all",
              isSelected
                ? "scale-110 border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-background"
                : "border-black/10 opacity-80 hover:scale-105 hover:opacity-100",
            )}
            style={{ backgroundColor: visual?.color ?? "#E8E6E1" }}
          >
            {visual ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/types/${visual.icon}.svg`}
                alt={type}
                className="size-5"
              />
            ) : (
              <span className="text-sm font-semibold">
                {type.charAt(0).toUpperCase()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
