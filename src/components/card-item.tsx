"use client";

import { Check } from "lucide-react";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cardImageUrl } from "@/lib/tcgdex";
import type { CardBrief, CollectionStatus } from "@/lib/types";
import { VARIANT_LABELS } from "@/lib/types";

type CardItemProps = {
  card: CardBrief;
  status: CollectionStatus | null;
  onStatusChange: (status: CollectionStatus | null) => void;
};

export function CardItem({ card, status, onStatusChange }: CardItemProps) {
  const imageSrc = cardImageUrl(card.image, "low");
  const variantLabel = VARIANT_LABELS[card.variant] ?? card.variant;

  return (
    <Card size="sm" className="bg-card/90 transition-transform hover:-translate-y-0.5">
      <CardHeader className="gap-2">
        <div className="relative mx-auto aspect-[63/88] w-full max-w-[180px] overflow-hidden rounded-lg bg-muted">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={`${card.name} (${variantLabel})`}
              fill
              sizes="180px"
              className="object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
              Sem imagem
            </div>
          )}
        </div>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2">{card.name}</CardTitle>
          {status === "owned" ? <Badge>Tenho</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{variantLabel}</Badge>
          <p className="text-xs text-muted-foreground">#{card.localId}</p>
        </div>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-2 border-t-0 bg-transparent">
        <Button
          size="sm"
          variant={status === "owned" ? "default" : "outline"}
          onClick={() => onStatusChange(status === "owned" ? null : "owned")}
        >
          <Check data-icon="inline-start" />
          Tenho
        </Button>
      </CardFooter>
    </Card>
  );
}
