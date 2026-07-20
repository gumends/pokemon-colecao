"use client";

import { CardItem } from "@/components/card-item";
import type { CardBrief, CollectionStatus } from "@/lib/types";

type CardGridProps = {
  cards: CardBrief[];
  getStatus: (cardId: string) => CollectionStatus | null;
  onStatusChange: (card: CardBrief, status: CollectionStatus | null) => void;
  emptyMessage: string;
};

export function CardGrid({
  cards,
  getStatus,
  onStatusChange,
  emptyMessage,
}: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
