"use client";

import { Suspense, useCallback, useMemo, useState } from "react";

import { CardGrid } from "@/components/card-grid";
import { LoadingState } from "@/components/loading-state";
import { SearchBar } from "@/components/search-bar";
import { SetBrowser } from "@/components/set-browser";
import { StatCards } from "@/components/stat-cards";
import { collectTypes, TypeFilter } from "@/components/type-filter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollection } from "@/hooks/use-collection";
import {
  type AppTab,
  useCollectionUrl,
} from "@/hooks/use-collection-url";
import type { CardBrief } from "@/lib/types";

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
    setTab,
    setQuery,
    setSerie,
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

  // Com uma coleção aberta, "Tenho" e "Faltam" são derivados das cartas dela.
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
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "sets" || value === "owned" || value === "wanted") {
            setTab(value as AppTab);
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="sets">Todas</TabsTrigger>
          <TabsTrigger value="owned">Tenho ({ownedCards.length})</TabsTrigger>
          <TabsTrigger value="wanted">
            Faltam ({setCards ? missingCards.length : "—"})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sets" className="mt-4" keepMounted>
          {setBrowser}
        </TabsContent>

        <TabsContent value="owned" className="mt-4 space-y-4">
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
        </TabsContent>

        <TabsContent value="wanted" className="mt-4 space-y-4">
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
        </TabsContent>
      </Tabs>
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
