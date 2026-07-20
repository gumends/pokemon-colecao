"use client";

import { Suspense, useMemo } from "react";

import { CardGrid } from "@/components/card-grid";
import { SearchBar } from "@/components/search-bar";
import { SetBrowser } from "@/components/set-browser";
import { StatCards } from "@/components/stat-cards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollection } from "@/hooks/use-collection";
import {
  type AppTab,
  useCollectionUrl,
} from "@/hooks/use-collection-url";

function CollectionAppContent() {
  const {
    owned,
    wanted,
    counts,
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

  const ownedCardIds = useMemo(
    () => owned.map((entry) => entry.card.id),
    [owned],
  );

  const filteredOwned = useMemo(() => {
    const term = query.trim().toLowerCase();
    const cards = owned.map((entry) => entry.card);
    if (!term) return cards;
    return cards.filter(
      (card) =>
        card.name.toLowerCase().includes(term) ||
        card.localId.toLowerCase().includes(term) ||
        card.id.toLowerCase().includes(term),
    );
  }, [owned, query]);

  const filteredWanted = useMemo(() => {
    const term = query.trim().toLowerCase();
    const cards = wanted.map((entry) => entry.card);
    if (!term) return cards;
    return cards.filter(
      (card) =>
        card.name.toLowerCase().includes(term) ||
        card.localId.toLowerCase().includes(term) ||
        card.id.toLowerCase().includes(term),
    );
  }, [wanted, query]);

  const searchPlaceholder =
    tab === "owned"
      ? "Buscar nas cartas que tenho…"
      : tab === "wanted"
        ? "Buscar nas cartas que preciso…"
        : setId
          ? "Buscar carta nesta coleção…"
          : "Buscar coleção…";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <StatCards owned={counts.owned} wanted={counts.wanted} />

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

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === "sets" || value === "owned" || value === "wanted") {
            setTab(value as AppTab);
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="sets">Coleções</TabsTrigger>
          <TabsTrigger value="owned">Tenho ({counts.owned})</TabsTrigger>
          <TabsTrigger value="wanted">Preciso ({counts.wanted})</TabsTrigger>
        </TabsList>

        <TabsContent value="sets" className="mt-4">
          <SetBrowser
            setId={setId}
            query={query}
            serie={serie}
            onSerieChange={setSerie}
            ownedCardIds={ownedCardIds}
            getStatus={getStatus}
            onStatusChange={updateStatus}
          />
        </TabsContent>

        <TabsContent value="owned" className="mt-4">
          <CardGrid
            cards={filteredOwned}
            getStatus={getStatus}
            onStatusChange={updateStatus}
            emptyMessage={
              query
                ? "Nenhuma carta encontrada em “Tenho”."
                : "Você ainda não marcou nenhuma carta como “Tenho”."
            }
          />
        </TabsContent>

        <TabsContent value="wanted" className="mt-4">
          <CardGrid
            cards={filteredWanted}
            getStatus={getStatus}
            onStatusChange={updateStatus}
            emptyMessage={
              query
                ? "Nenhuma carta encontrada em “Preciso”."
                : "Nenhuma carta na lista de “Preciso” ainda."
            }
          />
        </TabsContent>
      </Tabs>
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
