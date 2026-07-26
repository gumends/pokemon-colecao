"use client";

import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";

import { CardGrid } from "@/components/card-grid";
import { CardScanner } from "@/components/card-scanner";
import { FriendPanel } from "@/components/friend-panel";
import { LoadingState } from "@/components/loading-state";
import { SearchBar } from "@/components/search-bar";
import { SetBrowser } from "@/components/set-browser";
import { StatCards } from "@/components/stat-cards";
import { collectTypes, TypeFilter } from "@/components/type-filter";
import { useCollection } from "@/hooks/use-collection";
import {
  type AppTab,
  useCollectionUrl,
} from "@/hooks/use-collection-url";
import type { CardBrief } from "@/lib/types";
import { cn } from "@/lib/utils";

function cardIsInSet(card: CardBrief, setId: string): boolean {
  return card.tcgdexId.startsWith(`${setId}-`) || card.tcgdexId === setId;
}

function filterCards(
  cards: CardBrief[],
  query: string,
  typeFilter: string | null,
): CardBrief[] {
  let result = cards;

  if (typeFilter) {
    result = result.filter((card) => card.types?.includes(typeFilter));
  }

  const term = query.trim().toLowerCase();
  if (!term) return result;
  return result.filter((card) => {
    const variant = card.variant?.toLowerCase() ?? "";
    return (
      card.name.toLowerCase().includes(term) ||
      card.localId.toLowerCase().includes(term) ||
      card.id.toLowerCase().includes(term) ||
      variant.includes(term)
    );
  });
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-foreground/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CollectionAppContent() {
  const {
    owned,
    getStatus,
    updateStatus,
    error: collectionError,
    isLoading: isCollectionLoading,
  } = useCollection();

  const {
    tab,
    setId,
    query,
    serie,
    friendCode,
    setTab,
    setQuery,
    setSerie,
    setFriendCode,
  } = useCollectionUrl();

  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [prevTab, setPrevTab] = useState(tab);
  const [loadedSet, setLoadedSet] = useState<{
    id: string;
    cards: CardBrief[];
  } | null>(null);

  if (prevTab !== tab) {
    setPrevTab(tab);
    setTypeFilter(null);
  }

  const ownedCardIds = useMemo(
    () => owned.map((entry) => entry.card.id),
    [owned],
  );
  const ownedCardIdSet = useMemo(() => new Set(ownedCardIds), [ownedCardIds]);
  const setCards =
    setId && loadedSet?.id === setId ? loadedSet.cards : null;

  const handleSetCardsChange = useCallback(
    (loadedSetId: string, cards: CardBrief[]) => {
      setLoadedSet({ id: loadedSetId, cards });
    },
    [],
  );

  const ownedCards = useMemo(() => {
    if (setCards) {
      return setCards.filter((card) => ownedCardIdSet.has(card.id));
    }
    const cards = owned.map((entry) => entry.card);
    return setId ? cards.filter((card) => cardIsInSet(card, setId)) : cards;
  }, [owned, ownedCardIdSet, setCards, setId]);
  const missingCards = useMemo(
    () => setCards?.filter((card) => !ownedCardIdSet.has(card.id)) ?? [],
    [ownedCardIdSet, setCards],
  );

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

  const searchPlaceholder =
    tab === "owned"
      ? "Buscar nas cartas que tenho…"
      : tab === "wanted"
        ? "Buscar nas cartas que faltam…"
        : tab === "friend"
          ? "Buscar nas cartas do amigo…"
          : tab === "scan"
            ? "Busca não usada no scanner…"
            : setId
              ? "Buscar carta nesta coleção…"
              : "Buscar coleção…";

  const setBrowser = (
    <SetBrowser
      setId={setId}
      query={query}
      serie={serie}
      onSerieChange={setSerie}
      ownedCardIds={ownedCardIds}
      getStatus={getStatus}
      onStatusChange={updateStatus}
      onSetCardsChange={handleSetCardsChange}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
        <TabButton
          active={tab !== "scan"}
          onClick={() => setTab("sets")}
        >
          Coleções
        </TabButton>
        <TabButton active={tab === "scan"} onClick={() => setTab("scan")}>
          Escanear
        </TabButton>
      </div>

      {tab === "scan" ? (
        <CardScanner getStatus={getStatus} onStatusChange={updateStatus} />
      ) : (
        <>
          {setId ? (
            <StatCards
              owned={ownedCards.length}
              missing={setCards ? missingCards.length : null}
            />
          ) : null}

          {isCollectionLoading ? (
            <p className="text-sm text-muted-foreground">Carregando coleção…</p>
          ) : null}
          {collectionError ? (
            <p className="text-sm text-destructive" role="alert">
              {collectionError}
            </p>
          ) : null}

          <SearchBar
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
          />

          {!setId ? (
            setBrowser
          ) : (
            <div className="space-y-4">
              <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
                <TabButton active={tab === "sets"} onClick={() => setTab("sets")}>
                  Todas
                </TabButton>
                <TabButton
                  active={tab === "owned"}
                  onClick={() => setTab("owned")}
                >
                  Tenho ({ownedCards.length})
                </TabButton>
                <TabButton
                  active={tab === "wanted"}
                  onClick={() => setTab("wanted")}
                >
                  Faltam ({setCards ? missingCards.length : "—"})
                </TabButton>
                <TabButton
                  active={tab === "friend"}
                  onClick={() => setTab("friend")}
                >
                  Amigo
                </TabButton>
              </div>

              {tab === "sets" ? setBrowser : null}

              {tab === "owned" ? (
                <div className="space-y-4">
                  <TypeFilter
                    types={ownedTypes}
                    selected={typeFilter}
                    onSelect={setTypeFilter}
                  />
                  <CardGrid
                    cards={filteredOwned}
                    getStatus={getStatus}
                    onStatusChange={updateStatus}
                    emptyMessage={
                      query || typeFilter
                        ? "Nenhuma carta encontrada em “Tenho”."
                        : "Nenhuma carta desta coleção marcada como “Tenho”."
                    }
                  />
                </div>
              ) : null}

              {tab === "wanted" ? (
                <div className="space-y-4">
                  {setId && !setCards ? (
                    <LoadingState message="Calculando as cartas que faltam…" />
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
                        onStatusChange={updateStatus}
                        emptyMessage={
                          query || typeFilter
                            ? "Nenhuma carta encontrada em “Faltam”."
                            : "Você já tem todas as cartas desta coleção."
                        }
                      />
                    </>
                  )}
                </div>
              ) : null}

              {tab === "friend" ? (
                <FriendPanel
                  setCards={setCards}
                  initialCode={friendCode}
                  onCodeCommit={setFriendCode}
                  query={query}
                />
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CollectionApp() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
          Carregando…
        </div>
      }
    >
      <CollectionAppContent />
    </Suspense>
  );
}
