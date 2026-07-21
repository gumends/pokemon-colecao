"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import { CardGrid } from "@/components/card-grid";
import { LoadingState } from "@/components/loading-state";
import { SetGrid } from "@/components/set-grid";
import { collectTypes, TypeFilter } from "@/components/type-filter";
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
import { VARIANT_LABELS } from "@/lib/types";

/** Layouts de pasta: colunas x linhas por página. */
const BINDER_LAYOUTS: Record<string, { cols: number; rows: number } | null> = {
  none: null,
  "2x2": { cols: 2, rows: 2 },
  "3x3": { cols: 3, rows: 3 },
  "4x3": { cols: 4, rows: 3 },
  "4x4": { cols: 4, rows: 4 },
  "5x4": { cols: 5, rows: 4 },
};

type SetBrowserProps = {
  setId: string | null;
  query: string;
  serie: string;
  onSerieChange: (serie: string) => void;
  ownedCardIds: string[];
  getStatus: (cardId: string) => CollectionStatus | null;
  onStatusChange: (card: CardBrief, status: CollectionStatus | null) => void;
  onSetCardsChange: (setId: string, cards: CardBrief[]) => void;
};

export function SetBrowser({
  setId,
  query,
  serie,
  onSerieChange,
  ownedCardIds,
  getStatus,
  onStatusChange,
  onSetCardsChange,
}: SetBrowserProps) {
  const [series, setSeries] = useState<SerieBrief[]>([]);
  const [sets, setSets] = useState<SetBrief[]>([]);
  const [serieSetIds, setSerieSetIds] = useState<Set<string> | null>(null);
  const [setDetail, setSetDetail] = useState<SetDetail | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [binder, setBinder] = useState<string>("none");
  const [page, setPage] = useState(0);
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

  const [prevSetId, setPrevSetId] = useState(setId);
  if (prevSetId !== setId) {
    setPrevSetId(setId);
    setTypeFilter(null);
    setPage(0);
  }

  useEffect(() => {
    if (!setId) {
      setSetDetail(null);
      return;
    }

    const controller = new AbortController();
    setIsLoadingDetail(true);
    setError(null);

    void fetch(`/api/sets/${encodeURIComponent(setId)}/cards`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Não foi possível abrir esta coleção.");
        }
        return (await response.json()) as {
          set: SetDetail;
          cards: CardBrief[];
        };
      })
      .then((data) => {
        setSetDetail({ ...data.set, cards: data.cards });
        onSetCardsChange(setId, data.cards);
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
  }, [setId, onSetCardsChange]);

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

  const availableTypes = useMemo(
    () => collectTypes(setDetail?.cards ?? []),
    [setDetail],
  );

  const filteredCards = useMemo(() => {
    let cards = setDetail?.cards ?? [];

    if (typeFilter) {
      cards = cards.filter((card) => card.types?.includes(typeFilter));
    }

    const term = query.trim().toLowerCase();
    if (!term) return cards;
    return cards.filter((card) => {
      const variantLabel = VARIANT_LABELS[card.variant]?.toLowerCase() ?? "";
      return (
        card.name.toLowerCase().includes(term) ||
        card.localId.toLowerCase().includes(term) ||
        card.tcgdexId.toLowerCase().includes(term) ||
        variantLabel.includes(term) ||
        card.variant.toLowerCase().includes(term)
      );
    });
  }, [setDetail, query, typeFilter]);

  if (setId) {
    const ownedInSet = ownedCountInSet(setId, ownedCardIds);
    const total = setDetail?.cards.length ?? 0;

    const binderSize = BINDER_LAYOUTS[binder];
    const pageSize = binderSize ? binderSize.cols * binderSize.rows : null;
    const pageCount = pageSize
      ? Math.max(1, Math.ceil(filteredCards.length / pageSize))
      : 1;
    const safePage = Math.min(page, pageCount - 1);
    const visibleCards = pageSize
      ? filteredCards.slice(safePage * pageSize, (safePage + 1) * pageSize)
      : filteredCards;

    return (
      <div className="space-y-4">
        {setDetail ? (
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight">
                {setDetail.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {setDetail.serie?.name ?? "Coleção"} · {setDetail.id} · {total}{" "}
                variantes
              </p>
            </div>
            <Badge variant="secondary" className="ml-auto">
              {ownedInSet}/{total} tenho
            </Badge>
          </div>
        ) : null}

        {setDetail && !isLoadingDetail ? (
          <div className="flex flex-wrap items-center gap-3">
            <TypeFilter
              types={availableTypes}
              selected={typeFilter}
              onSelect={(type) => {
                setTypeFilter(type);
                setPage(0);
              }}
            />
            <Select
              value={binder}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setBinder(value);
                  setPage(0);
                }
              }}
            >
              <SelectTrigger className="h-9 w-40 rounded-xl sm:ml-auto">
                <SelectValue placeholder="Modelo da pasta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem pasta</SelectItem>
                <SelectItem value="2x2">Pasta 2x2</SelectItem>
                <SelectItem value="3x3">Pasta 3x3</SelectItem>
                <SelectItem value="4x3">Pasta 4x3</SelectItem>
                <SelectItem value="4x4">Pasta 4x4</SelectItem>
                <SelectItem value="5x4">Pasta 5x4</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {isLoadingDetail ? (
          <LoadingState message="Carregando variantes das cartas…" />
        ) : (
          <>
            <CardGrid
              cards={visibleCards}
              getStatus={getStatus}
              onStatusChange={onStatusChange}
              columns={binderSize?.cols}
              emptyMessage={
                query || typeFilter
                  ? "Nenhuma carta encontrada com esse filtro."
                  : "Esta coleção não tem cartas listadas."
              }
            />
            {binderSize && filteredCards.length > 0 ? (
              <div className="flex items-center justify-center gap-4">
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Página anterior"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {safePage + 1} de {pageCount}
                </span>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Próxima página"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            ) : null}
          </>
        )}
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

      {isLoadingSets ? (
        <LoadingState message="Carregando coleções…" />
      ) : (
        <SetGrid
          sets={filteredSets}
          ownedCardIds={ownedCardIds}
          emptyMessage="Nenhuma coleção encontrada com esse filtro."
        />
      )}
    </div>
  );
}
