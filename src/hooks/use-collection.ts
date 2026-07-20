"use client";

import { useCallback, useEffect, useState } from "react";

import { countByStatus, setCardStatus } from "@/lib/collection-store";
import type { CardBrief, CollectionMap, CollectionStatus } from "@/lib/types";

export function useCollection() {
  const [collection, setCollection] = useState<CollectionMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/collection");
      if (!response.ok) {
        throw new Error("Falha ao carregar a coleção.");
      }

      const data = (await response.json()) as { collection: CollectionMap };
      setCollection(data.collection ?? {});
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível carregar a coleção.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = countByStatus(collection);

  async function updateStatus(card: CardBrief, status: CollectionStatus | null) {
    const previous = collection;
    setCollection(setCardStatus(collection, card, status));
    setError(null);

    try {
      if (status === null) {
        const response = await fetch(
          `/api/collection?cardId=${encodeURIComponent(card.id)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          throw new Error("Falha ao remover a carta.");
        }
        return;
      }

      const response = await fetch("/api/collection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card, status }),
      });

      if (!response.ok) {
        throw new Error("Falha ao salvar a carta.");
      }
    } catch (err) {
      setCollection(previous);
      setError(
        err instanceof Error ? err.message : "Não foi possível atualizar a coleção.",
      );
    }
  }

  function getStatus(cardId: string): CollectionStatus | null {
    return collection[cardId]?.status ?? null;
  }

  const owned = Object.values(collection).filter((e) => e.status === "owned");
  const wanted = Object.values(collection).filter((e) => e.status === "wanted");

  return {
    collection,
    owned,
    wanted,
    counts,
    isLoading,
    error,
    getStatus,
    updateStatus,
    refresh,
  };
}
