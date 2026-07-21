"use client";

import { CardItem } from "@/components/card-item";
import type { CardBrief, CollectionStatus } from "@/lib/types";

type CardGridProps = {
  cards: CardBrief[];
  getStatus: (cardId: string) => CollectionStatus | null;
  onStatusChange: (card: CardBrief, status: CollectionStatus | null) => void;
  emptyMessage: string;
  /** Número fixo de colunas (modo pasta). Sem valor, usa a grade responsiva. */
  columns?: number;
};

const COLUMN_CLASSES: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export function CardGrid({
  cards,
  getStatus,
  onStatusChange,
  emptyMessage,
  columns,
}: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const gridClass =
    columns && COLUMN_CLASSES[columns]
      ? `grid gap-4 ${COLUMN_CLASSES[columns]}`
      : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <div className={gridClass}>
      {cards.map((card) => (
        <CardItem
          key={card.id}
          card={card}
          status={getStatus(card.id)}
          onStatusChange={(status) => onStatusChange(card, status)}
        />
      ))}
    </div>
  );
}
