"use client";

import { useEffect, useMemo, useState } from "react";

import { CardGrid } from "@/components/card-grid";
import { SetGrid } from "@/components/set-grid";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getSerie,
  getSet,
  listSeries,
  listSets,
  ownedCountInSet,
} from "@/lib/tcgdex";
import type {
  CardBrief,
  CollectionStatus,
  SerieBrief,
  SetBrief,
  SetDetail,
} from "@/lib/types";

type SetBrowserProps = {
  setId: string | null;
  query: string;
  serie: string;
  onSerieChange: (serie: string) => void;
  ownedCardIds: string[];
  getStatus: (cardId: string) => CollectionStatus | null;
  onStatusChange: (card: CardBrief, status: CollectionStatus | null) => void;
};

export function SetBrowser({
  setId,
  query,
  serie,
  onSerieChange,
  ownedCardIds,
  getStatus,
  onStatusChange,
}: SetBrowserProps) {
  const [series, setSeries] = useState<SerieBrief[]>([]);
  const [sets, setSets] = useState<SetBrief[]>([]);
  const [serieSetIds, setSerieSetIds] = useState<Set<string> | null>(null);
  const [setDetail, setSetDetail] = useState<SetDetail | null>(null);
  const [isLoadingSets, setIsLoadingSets] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingSets(true);
    setError(null);

    void Promise.all([
      listSeries(controller.signal),
      listSets({ signal: controller.signal }),
    ])
      .then(([seriesData, setsData]) => {
        setSeries(seriesData);
        setSets(setsData);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as coleções.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingSets(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (serie === "all") {
      setSerieSetIds(null);
      return;
    }

    const controller = new AbortController();

    void getSerie(serie, controller.signal)
      .then((serieData) => {
        setSerieSetIds(new Set(serieData.sets.map((set) => set.id)));
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        setSerieSetIds(new Set());
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível filtrar a série.",
        );
      });

    return () => controller.abort();
  }, [serie]);

  useEffect(() => {
    if (!setId) {
      setSetDetail(null);
      return;
    }

    const controller = new AbortController();
    setIsLoadingDetail(true);
    setError(null);

    void getSet(setId, controller.signal)
      .then((detail) => {
        setSetDetail(detail);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        setSetDetail(null);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível abrir esta coleção.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingDetail(false);
      });

    return () => controller.abort();
  }, [setId]);

  const filteredSets = useMemo(() => {
    const term = query.trim().toLowerCase();

    return sets.filter((set) => {
      const matchesSerie = !serieSetIds || serieSetIds.has(set.id);
      const matchesName =
        !term ||
        set.name.toLowerCase().includes(term) ||
        set.id.toLowerCase().includes(term);
      return matchesSerie && matchesName;
    });
  }, [sets, serieSetIds, query]);

  const filteredCards = useMemo(() => {
    const cards = setDetail?.cards ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return cards;
    return cards.filter(
      (card) =>
        card.name.toLowerCase().includes(term) ||
        card.localId.toLowerCase().includes(term) ||
        card.id.toLowerCase().includes(term),
    );
  }, [setDetail, query]);

  if (setId) {
    const ownedInSet = ownedCountInSet(setId, ownedCardIds);
    const total = setDetail?.cardCount.total ?? 0;

    return (
      <div className="space-y-4">
        {setDetail ? (
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight">
                {setDetail.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {setDetail.serie?.name ?? "Coleção"} · {setDetail.id}
              </p>
            </div>
            <Badge variant="secondary" className="ml-auto">
              {ownedInSet}/{total} tenho
            </Badge>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <CardGrid
          cards={filteredCards}
          getStatus={getStatus}
          onStatusChange={onStatusChange}
          emptyMessage={
            isLoadingDetail
              ? "Carregando cartas da coleção…"
              : query
                ? "Nenhuma carta encontrada nesta coleção."
                : "Esta coleção não tem cartas listadas."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Select
        value={serie}
        onValueChange={(value) => {
          if (typeof value === "string") onSerieChange(value);
        }}
      >
        <SelectTrigger className="h-10 w-full rounded-xl sm:w-56">
          <SelectValue placeholder="Série" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as séries</SelectItem>
          {series.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <SetGrid
        sets={filteredSets}
        ownedCardIds={ownedCardIds}
        emptyMessage={
          isLoadingSets
            ? "Carregando coleções…"
            : "Nenhuma coleção encontrada com esse filtro."
        }
      />
    </div>
  );
}
