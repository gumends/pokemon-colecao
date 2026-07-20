"use client";

import { useEffect, useState } from "react";

import { CardGrid } from "@/components/card-grid";
import { SearchBar } from "@/components/search-bar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollection } from "@/hooks/use-collection";
import { searchCards } from "@/lib/tcgdex";
import type { CardBrief } from "@/lib/types";

export function CollectionApp() {
  const { owned, wanted, counts, getStatus, updateStatus } = useCollection();
  const [query, setQuery] = useState("Pikachu");
  const [results, setResults] = useState<CardBrief[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    void searchCards(query, { perPage: 24, signal: controller.signal })
      .then((cards) => {
        setResults(cards);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        setResults([]);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível buscar as cartas.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Sua coleção
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Busque cartas na TCGdex e marque as que você tem ou ainda precisa.
              A persistência própria virá depois — por agora salvamos no navegador.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary">Tenho: {counts.owned}</Badge>
            <Badge variant="secondary">Preciso: {counts.wanted}</Badge>
          </div>
        </div>
        <SearchBar onSearch={setQuery} isLoading={isLoading} />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search">Buscar</TabsTrigger>
          <TabsTrigger value="owned">Tenho ({counts.owned})</TabsTrigger>
          <TabsTrigger value="wanted">Preciso ({counts.wanted})</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {query
              ? `Resultados para “${query}”`
              : "Digite o nome de uma carta para começar."}
          </p>
          <CardGrid
            cards={results}
            getStatus={getStatus}
            onStatusChange={updateStatus}
            emptyMessage={
              isLoading
                ? "Buscando cartas…"
                : "Nenhuma carta encontrada. Tente outro nome."
            }
          />
        </TabsContent>

        <TabsContent value="owned" className="mt-4">
          <CardGrid
            cards={owned.map((entry) => entry.card)}
            getStatus={getStatus}
            onStatusChange={updateStatus}
            emptyMessage="Você ainda não marcou nenhuma carta como “Tenho”."
          />
        </TabsContent>

        <TabsContent value="wanted" className="mt-4">
          <CardGrid
            cards={wanted.map((entry) => entry.card)}
            getStatus={getStatus}
            onStatusChange={updateStatus}
            emptyMessage="Nenhuma carta na lista de “Preciso” ainda."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
