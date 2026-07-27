"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CardGrid } from "@/components/card-grid";
import { LoadingState } from "@/components/loading-state";
import {
  cardMatchesTypeFilter,
  collectTypes,
  TypeFilter,
} from "@/components/type-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { cardMatchesQuery } from "@/lib/card-query";
import type { CardBrief, CollectionMap, CollectionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type FriendInfo = {
  id: string;
  name: string;
  username: string;
  friendCode: string;
};

type FriendHistoryItem = {
  friendCode: string;
  friendId: string;
  friendName: string;
  friendUsername: string;
  updatedAt: string;
};

type FriendPanelProps = {
  setCards: CardBrief[] | null;
  initialCode: string;
  onCodeCommit: (code: string) => void;
  query: string;
};

function filterCards(
  cards: CardBrief[],
  query: string,
  typeFilter: string | null,
): CardBrief[] {
  let result = cards;
  if (typeFilter) {
    result = result.filter((card) => cardMatchesTypeFilter(card, typeFilter));
  }
  const term = query.trim();
  if (!term) return result;
  return result.filter((card) => cardMatchesQuery(card, term));
}

export function FriendPanel({
  setCards,
  initialCode,
  onCodeCommit,
  query,
}: FriendPanelProps) {
  const [draft, setDraft] = useState(initialCode);
  const [friend, setFriend] = useState<FriendInfo | null>(null);
  const [history, setHistory] = useState<FriendHistoryItem[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"owned" | "missing">("owned");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initialCode);
  }, [initialCode]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await apiFetch("/api/friends/history");
      if (!response.ok) return;
      const data = (await response.json()) as { history?: FriendHistoryItem[] };
      setHistory(data.history ?? []);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const loadFriend = useCallback(
    async (code: string) => {
      const normalized = code.trim().toUpperCase();
      if (normalized.length < 4) {
        setError("Informe o código do amigo.");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch(
          `/api/friends/${encodeURIComponent(normalized)}/collection`,
        );
        const data = (await response.json()) as {
          friend?: FriendInfo;
          collection?: CollectionMap;
          history?: FriendHistoryItem[];
          error?: string;
        };
        if (!response.ok || !data.friend || !data.collection) {
          setFriend(null);
          setOwnedIds(new Set());
          setError(data.error ?? "Não foi possível carregar o amigo.");
          return;
        }

        const owned = new Set(
          Object.values(data.collection)
            .filter((entry) => entry.status === "owned")
            .map((entry) => entry.card.id),
        );
        setFriend(data.friend);
        setOwnedIds(owned);
        if (data.history) setHistory(data.history);
        else void loadHistory();
        onCodeCommit(normalized);
      } catch {
        setError("Falha ao buscar o amigo.");
      } finally {
        setLoading(false);
      }
    },
    [loadHistory, onCodeCommit],
  );

  useEffect(() => {
    if (initialCode.trim().length >= 4) {
      void loadFriend(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function removeHistory(code: string) {
    try {
      await apiFetch(`/api/friends/history/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      setHistory((prev) =>
        prev.filter((item) => item.friendCode !== code.toUpperCase()),
      );
    } catch {
      // silencioso
    }
  }

  const ownedCards = useMemo(() => {
    if (!setCards) return [];
    return setCards.filter((card) => ownedIds.has(card.id));
  }, [ownedIds, setCards]);

  const missingCards = useMemo(() => {
    if (!setCards) return [];
    return setCards.filter((card) => !ownedIds.has(card.id));
  }, [ownedIds, setCards]);

  const ownedTypes = useMemo(() => collectTypes(ownedCards), [ownedCards]);
  const missingTypes = useMemo(
    () => collectTypes(missingCards),
    [missingCards],
  );

  const filteredOwned = useMemo(
    () => filterCards(ownedCards, query, typeFilter),
    [ownedCards, query, typeFilter],
  );
  const filteredMissing = useMemo(
    () => filterCards(missingCards, query, typeFilter),
    [missingCards, query, typeFilter],
  );

  function getStatus(cardId: string): CollectionStatus | null {
    return ownedIds.has(cardId) ? "owned" : null;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <p className="text-sm font-medium">Ver coleção de um amigo</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Peça o código no perfil dele e cole aqui. As buscas ficam salvas no
          seu histórico.
        </p>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void loadFriend(draft);
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value.toUpperCase())}
            placeholder="Ex.: A3K9XP"
            className="font-mono tracking-widest uppercase"
            maxLength={12}
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </Button>
        </form>

        {history.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">Histórico</p>
            <div className="flex flex-wrap gap-2">
              {history.map((item) => {
                const active =
                  friend?.friendCode === item.friendCode ||
                  draft === item.friendCode;
                return (
                  <div
                    key={item.friendCode}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                      active
                        ? "border-foreground/30 bg-background"
                        : "border-border bg-background/60",
                    )}
                  >
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => {
                        setDraft(item.friendCode);
                        void loadFriend(item.friendCode);
                      }}
                    >
                      <span className="font-medium">{item.friendName}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {item.friendCode}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Remover ${item.friendName} do histórico`}
                      onClick={() => void removeHistory(item.friendCode)}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {friend ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Amigo:{" "}
            <span className="font-medium text-foreground">{friend.name}</span>
            <span className="font-mono tracking-wider">
              {" "}
              · {friend.friendCode}
            </span>
          </p>
        ) : null}
      </div>

      {!friend ? null : !setCards ? (
        <LoadingState message="Carregue as cartas da coleção para comparar…" />
      ) : (
        <div className="space-y-4">
          <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setView("owned")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                view === "owned"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/60",
              )}
            >
              Amigo tem ({ownedCards.length})
            </button>
            <button
              type="button"
              onClick={() => setView("missing")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                view === "missing"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/60",
              )}
            >
              Amigo falta ({missingCards.length})
            </button>
          </div>

          {view === "owned" ? (
            <>
              <TypeFilter
                types={ownedTypes}
                selected={typeFilter}
                onSelect={setTypeFilter}
              />
              <CardGrid
                cards={filteredOwned}
                getStatus={getStatus}
                onStatusChange={() => undefined}
                readOnly
                emptyMessage="Seu amigo ainda não marcou cartas desta coleção."
              />
            </>
          ) : (
            <>
              <TypeFilter
                types={missingTypes}
                selected={typeFilter}
                onSelect={setTypeFilter}
              />
              <CardGrid
                cards={filteredMissing}
                getStatus={getStatus}
                onStatusChange={() => undefined}
                readOnly
                emptyMessage="Seu amigo já tem todas as cartas desta coleção."
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
