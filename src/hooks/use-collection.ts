"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api-client";
import { countByStatus, setCardStatus } from "@/lib/collection-store";
import type { CardBrief, CollectionMap, CollectionStatus } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";

export function useCollection() {
  const { user } = useAuth();
  const [collection, setCollection] = useState<CollectionMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCollection({});
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch("/api/collection");
      if (response.status === 401) {
        setCollection({});
        setError("Faça login para acessar sua coleção.");
        return;
      }
      if (!response.ok) {
        throw new Error("Falha ao carregar a coleção.");
      }

      const data = (await response.json()) as { collection: CollectionMap };
      setCollection(data.collection ?? {});
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a coleção.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = countByStatus(collection);

  async function updateStatus(
    card: CardBrief,
    status: CollectionStatus | null,
  ) {
    const previous = collection;
    setCollection(setCardStatus(collection, card, status));
    setError(null);

    try {
      if (status === null) {
        const response = await apiFetch(
          `/api/collection?cardId=${encodeURIComponent(card.id)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          throw new Error("Falha ao remover a carta.");
        }
        return;
      }

      const response = await apiFetch("/api/collection", {
        method: "PUT",
        body: JSON.stringify({ card, status }),
      });

      if (!response.ok) {
        throw new Error("Falha ao salvar a carta.");
      }
    } catch (err) {
      setCollection(previous);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar a coleção.",
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
