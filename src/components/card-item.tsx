"use client";

import { Check, CircleDollarSign } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cardImageUrl, ligaPokemonUrlForCard } from "@/lib/tcgdex";
import type { CardBrief, CollectionStatus } from "@/lib/types";
import { VARIANT_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

type CardItemProps = {
  card: CardBrief;
  status: CollectionStatus | null;
  onStatusChange: (status: CollectionStatus | null) => void;
  /** Só visualização (coleção do amigo). */
  readOnly?: boolean;
};

export function CardItem({
  card,
  status,
  onStatusChange,
  readOnly = false,
}: CardItemProps) {
  const [open, setOpen] = useState(false);
  const imageSrc = cardImageUrl(card.image, "low");
  const largeImageSrc = cardImageUrl(card.image, "high") ?? imageSrc;
  const variantLabel = VARIANT_LABELS[card.variant] ?? card.variant;
  const ligaUrl = ligaPokemonUrlForCard(card);

  return (
    <>
      <Card
        size="sm"
        className={cn(
          status === "owned" ? "border-green-300 bg-green-100" : "bg-card/90",
        )}
      >
        <CardHeader className="gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative mx-auto aspect-[63/88] w-full max-w-[180px] cursor-pointer overflow-hidden rounded-lg bg-muted outline-none transition-transform duration-200 ease-out hover:z-10 hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Ver ${card.name} em tamanho maior`}
          >
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
          </button>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2">{card.name}</CardTitle>
            <div className="flex shrink-0 items-center gap-1">
              {status === "owned" ? <Badge>Tenho</Badge> : null}
              <a
                href={ligaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Ver preço de ${card.name} na Liga Pokémon`}
                title="Ver preço na Liga Pokémon"
                onClick={(event) => event.stopPropagation()}
              >
                <CircleDollarSign className="size-3.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{variantLabel}</Badge>
            <p className="text-xs text-muted-foreground">#{card.localId}</p>
          </div>
        </CardHeader>
        {!readOnly ? (
          <CardFooter className="border-t-0 bg-transparent">
            <Button
              size="sm"
              className="w-full"
              variant={status === "owned" ? "default" : "outline"}
              onClick={() => onStatusChange(status === "owned" ? null : "owned")}
            >
              <Check data-icon="inline-start" />
              Tenho
            </Button>
          </CardFooter>
        ) : status === "owned" ? (
          <CardFooter className="border-t-0 bg-transparent">
            <p className="w-full text-center text-xs font-medium text-green-700">
              Amigo tem
            </p>
          </CardFooter>
        ) : (
          <CardFooter className="border-t-0 bg-transparent">
            <p className="w-full text-center text-xs text-muted-foreground">
              Amigo não tem
            </p>
          </CardFooter>
        )}
      </Card>

      {open ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="max-w-md gap-4 bg-background/60 p-4 backdrop-blur-xl sm:max-w-lg"
            showCloseButton
          >
            <DialogHeader>
              <DialogTitle>{card.name}</DialogTitle>
              <DialogDescription>
                {variantLabel} · #{card.localId}
                {card.setOfficialCount
                  ? ` / ${String(card.setOfficialCount).padStart(3, "0")}`
                  : null}
              </DialogDescription>
            </DialogHeader>
            <div className="relative mx-auto aspect-[63/88] w-full max-w-[420px] overflow-hidden rounded-xl">
              {largeImageSrc ? (
                <Image
                  src={largeImageSrc}
                  alt={`${card.name} (${variantLabel})`}
                  fill
                  sizes="(max-width: 640px) 90vw, 420px"
                  className="object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sem imagem
                </div>
              )}
            </div>
            <Button
              className="w-full"
              nativeButton={false}
              render={
                <a href={ligaUrl} target="_blank" rel="noopener noreferrer" />
              }
            >
              <CircleDollarSign data-icon="inline-start" />
              Ver preço na Liga Pokémon
            </Button>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
