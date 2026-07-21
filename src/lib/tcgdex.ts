import type {
  CardBrief,
  CardVariant,
  CardVariantsFlags,
  SerieBrief,
  SetBrief,
  SetDetail,
  TcgdexCardDetail,
} from "@/lib/types";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/pt";

export function cardImageUrl(
  imageBase: string | undefined,
  quality: "low" | "high" = "low",
): string | null {
  if (!imageBase) return null;
  return `${imageBase}/${quality}.webp`;
}

export function assetUrl(base: string | undefined, ext = "webp"): string | null {
  if (!base) return null;
  return `${base}.${ext}`;
}

export function collectionCardId(tcgdexId: string, variant: CardVariant): string {
  return `${tcgdexId}::${variant}`;
}

function addVariant(set: Set<CardVariant>, variant: CardVariant) {
  set.add(variant);
}

function variantFromDetailedType(type: string | undefined): CardVariant | null {
  if (!type) return null;
  const normalized = type.trim().toLowerCase();
  if (normalized === "normal") return "normal";
  if (normalized === "reverse" || normalized === "reverse-holo") return "reverse";
  if (normalized === "holo" || normalized === "holofoil") return "holo";
  if (normalized === "firstedition" || normalized === "1st-edition") {
    return "firstEdition";
  }
  return null;
}

/** Descobre quais variantes existem (flags + detalhes + preços). */
export function resolveAvailableVariants(card: TcgdexCardDetail): CardVariant[] {
  const found = new Set<CardVariant>();
  const flags: CardVariantsFlags = card.variants ?? {};

  if (flags.normal) addVariant(found, "normal");
  if (flags.reverse) addVariant(found, "reverse");
  if (flags.holo) addVariant(found, "holo");
  if (flags.firstEdition) addVariant(found, "firstEdition");

  for (const detailed of card.variants_detailed ?? []) {
    const variant = variantFromDetailedType(detailed.type);
    if (variant) addVariant(found, variant);
  }

  const tcgplayer = card.pricing?.tcgplayer;
  if (tcgplayer && typeof tcgplayer === "object") {
    for (const key of Object.keys(tcgplayer)) {
      const lower = key.toLowerCase();
      if (lower === "updated" || lower === "unit" || lower === "productid") continue;
      if (lower.includes("reverse")) addVariant(found, "reverse");
      else if (lower.includes("holo")) addVariant(found, "holo");
      else if (lower.includes("1st") || lower.includes("first")) {
        addVariant(found, "firstEdition");
      } else if (lower === "normal" || lower === "unlimited") {
        addVariant(found, "normal");
      }
    }
  }

  if (found.size === 0) addVariant(found, "normal");

  const order: CardVariant[] = ["normal", "reverse", "holo", "firstEdition"];
  return order.filter((variant) => found.has(variant));
}

export function expandCardToVariantEntries(card: TcgdexCardDetail): CardBrief[] {
  return resolveAvailableVariants(card).map((variant) => ({
    id: collectionCardId(card.id, variant),
    tcgdexId: card.id,
    localId: card.localId,
    name: card.name,
    image: card.image,
    variant,
    types: card.types,
  }));
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function searchCards(
  name: string,
  options?: { page?: number; perPage?: number; signal?: AbortSignal },
): Promise<CardBrief[]> {
  const query = name.trim();
  if (!query) return [];

  const params = new URLSearchParams();
  params.set("name", query);
  params.set("pagination:page", String(options?.page ?? 1));
  params.set("pagination:itemsPerPage", String(options?.perPage ?? 24));

  const response = await fetch(`${TCGDEX_BASE}/cards?${params.toString()}`, {
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar cartas (${response.status})`);
  }

  const briefs = (await response.json()) as Array<{
    id: string;
    localId: string;
    name: string;
    image?: string;
  }>;

  return briefs.map((card) => ({
    id: collectionCardId(card.id, "normal"),
    tcgdexId: card.id,
    localId: card.localId,
    name: card.name,
    image: card.image,
    variant: "normal" as const,
  }));
}

export async function getCard(
  cardId: string,
  signal?: AbortSignal,
): Promise<TcgdexCardDetail> {
  const response = await fetch(
    `${TCGDEX_BASE}/cards/${encodeURIComponent(cardId)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Falha ao carregar carta ${cardId} (${response.status})`);
  }

  return (await response.json()) as TcgdexCardDetail;
}

export async function listSeries(signal?: AbortSignal): Promise<SerieBrief[]> {
  const response = await fetch(`${TCGDEX_BASE}/series`, { signal });

  if (!response.ok) {
    throw new Error(`Falha ao listar séries (${response.status})`);
  }

  return (await response.json()) as SerieBrief[];
}

export async function listSets(
  options?: { signal?: AbortSignal },
): Promise<SetBrief[]> {
  const params = new URLSearchParams();
  params.set("sort:field", "releaseDate");
  params.set("sort:order", "DESC");

  const response = await fetch(`${TCGDEX_BASE}/sets?${params.toString()}`, {
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Falha ao listar coleções (${response.status})`);
  }

  return (await response.json()) as SetBrief[];
}

export async function getSerie(
  serieId: string,
  signal?: AbortSignal,
): Promise<{ id: string; name: string; sets: SetBrief[] }> {
  const response = await fetch(
    `${TCGDEX_BASE}/series/${encodeURIComponent(serieId)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Falha ao carregar a série (${response.status})`);
  }

  return (await response.json()) as {
    id: string;
    name: string;
    sets: SetBrief[];
  };
}

export async function getSet(
  setId: string,
  signal?: AbortSignal,
): Promise<SetDetail> {
  const response = await fetch(
    `${TCGDEX_BASE}/sets/${encodeURIComponent(setId)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Falha ao carregar a coleção (${response.status})`);
  }

  const raw = (await response.json()) as SetBrief & {
    cards: Array<{
      id: string;
      localId: string;
      name: string;
      image?: string;
    }>;
    releaseDate?: string;
    serie?: SerieBrief;
  };

  return {
    ...raw,
    cards: raw.cards.map((card) => ({
      id: collectionCardId(card.id, "normal"),
      tcgdexId: card.id,
      localId: card.localId,
      name: card.name,
      image: card.image,
      variant: "normal" as const,
    })),
  };
}

/** Carrega o set e expande cada carta nas variantes disponíveis. */
export async function getSetCardsWithVariants(
  setId: string,
  signal?: AbortSignal,
): Promise<{ set: SetDetail; cards: CardBrief[] }> {
  const set = await getSet(setId, signal);
  const uniqueIds = [...new Set(set.cards.map((card) => card.tcgdexId))];

  const details = await mapPool(uniqueIds, 8, async (cardId) => {
    try {
      return await getCard(cardId, signal);
    } catch {
      const fallback = set.cards.find((card) => card.tcgdexId === cardId);
      return {
        id: cardId,
        localId: fallback?.localId ?? cardId,
        name: fallback?.name ?? cardId,
        image: fallback?.image,
        variants: { normal: true },
      } satisfies TcgdexCardDetail;
    }
  });

  const cards = details.flatMap((detail) => expandCardToVariantEntries(detail));

  return {
    set: { ...set, cards },
    cards,
  };
}

export function ownedCountInSet(
  setId: string,
  ownedCardIds: Iterable<string>,
): number {
  const prefix = `${setId}-`;
  let count = 0;
  for (const id of ownedCardIds) {
    const tcgdexId = id.includes("::") ? id.split("::")[0] : id;
    if (tcgdexId.startsWith(prefix) || tcgdexId === setId) count += 1;
  }
  return count;
}
