"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SetLogo } from "@/components/set-logo";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ownedCountInSet,
  ownedUniqueCountInSet,
  readCachedVariantTotals,
} from "@/lib/tcgdex";
import type { SetBrief } from "@/lib/types";

type SetGridProps = {
  sets: SetBrief[];
  ownedCardIds: string[];
  emptyMessage: string;
};

export function SetGrid({ sets, ownedCardIds, emptyMessage }: SetGridProps) {
  const [variantTotals, setVariantTotals] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    setVariantTotals(readCachedVariantTotals());

    function onStorage(event: StorageEvent) {
      if (event.key === "pokemon_colecao_set_variant_totals") {
        setVariantTotals(readCachedVariantTotals());
      }
    }
    window.addEventListener("storage", onStorage);
    // Atualiza ao voltar da coleção (mesmo tab)
    const onFocus = () => setVariantTotals(readCachedVariantTotals());
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Releia o cache quando a lista de owned muda (acabou de marcar carta)
  useEffect(() => {
    setVariantTotals(readCachedVariantTotals());
  }, [ownedCardIds]);

  if (sets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sets.map((set) => {
        const variantTotal = variantTotals[set.id];
        const ownedVariants = ownedCountInSet(set.id, ownedCardIds);
        const ownedUnique = ownedUniqueCountInSet(set.id, ownedCardIds);

        // Se já abrimos o set, usamos o total real de variantes (normal+reverse+…).
        // Senão, contamos cartas distintas vs cardCount.total (sem inflar o numerador).
        const owned = variantTotal ? ownedVariants : ownedUnique;
        const total = variantTotal ?? set.cardCount.total;
        const unit = variantTotal ? "variantes" : "cartas";

        return (
          <Link
            key={set.id}
            href={`/?set=${encodeURIComponent(set.id)}`}
            className="text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card size="sm" className="h-full bg-card/90">
              <CardHeader>
                <div className="flex h-16 items-center justify-center rounded-lg bg-muted/60 px-3">
                  <SetLogo set={set} />
                </div>
                <CardTitle className="line-clamp-2">{set.name}</CardTitle>
                <CardDescription>{set.id}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <Badge variant="secondary">
                  {owned}/{total} {unit}
                </Badge>
                <span className="text-xs text-muted-foreground">Abrir →</span>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
