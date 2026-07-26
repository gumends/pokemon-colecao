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
const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
const ASSETS = "https://assets.tcgdex.net";

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

/** Infere a série do set pelo id (lista PT às vezes não traz serie). */
export function guessSerieId(setId: string): string | null {
  if (/^[AB]\d/i.test(setId) || setId === "P-A") return "tcgp";
  if (setId.startsWith("me") || setId === "mep" || setId === "mee") return "me";
  if (setId.startsWith("sv") || setId === "svp" || setId === "sve") return "sv";
  if (setId.startsWith("swsh") || setId.startsWith("cel")) return "swsh";
  if (setId.startsWith("sm")) return "sm";
  if (setId.startsWith("xy")) return "xy";
  if (setId.startsWith("bw")) return "bw";
  if (setId.startsWith("dp")) return "dp";
  if (setId.startsWith("ex")) return "ex";
  if (setId.startsWith("base") || setId.startsWith("hgss")) return "base";
  return null;
}

/** Sets sem arte própria → set pai conhecido (energia/promo/subset). */
const SET_LOGO_PARENT: Record<string, string> = {
  mee: "me01",
  mep: "me01",
  sve: "sv01",
  svp: "sv01",
  "P-A": "A1",
  cel25cc: "cel25",
};

/** Ids de sets “pai” para reaproveitar logo (B2a→B2, A4a→A4, mee→me01). */
export function parentSetIds(setId: string): string[] {
  const ids: string[] = [];
  const mapped = SET_LOGO_PARENT[setId];
  if (mapped) ids.push(mapped);

  // B1a / A2b / A4a → B1 / A2 / A4
  const subset = setId.match(/^([A-Za-z]*\d+(?:\.\d+)?)([a-z]+)$/);
  if (subset?.[1] && subset[1] !== setId) ids.push(subset[1]);

  return [...new Set(ids)].filter((id) => id !== setId);
}

/**
 * Candidatos de imagem para o card da coleção.
 * Ordem: logo/symbol próprio → EN CDN → logo do set pai → símbolo do pai.
 */
export function setLogoCandidates(set: {
  id: string;
  logo?: string;
  symbol?: string;
}): string[] {
  const urls: string[] = [];
  const push = (url: string | null | undefined) => {
    if (url && !urls.includes(url)) urls.push(url);
  };

  const pushSetAssets = (setId: string, logo?: string, symbol?: string) => {
    push(assetUrl(logo));
    push(assetUrl(logo, "png"));
    push(assetUrl(symbol, "png"));
    push(assetUrl(symbol));

    const serie = guessSerieId(setId);
    if (!serie) return;
    push(`${ASSETS}/en/${serie}/${setId}/logo.webp`);
    push(`${ASSETS}/pt/${serie}/${setId}/logo.webp`);
    push(`${ASSETS}/univ/${serie}/${setId}/symbol.png`);
  };

  pushSetAssets(set.id, set.logo, set.symbol);

  for (const parentId of parentSetIds(set.id)) {
    pushSetAssets(parentId);
  }

  // Último recurso: logo da série (ex.: Megaevolução)
  const serie = guessSerieId(set.id);
  if (serie === "me") push(`${ASSETS}/en/me/me01/logo.webp`);
  if (serie === "tcgp") push(`${ASSETS}/en/tcgp/A1/logo.webp`);
  if (serie === "sv") push(`${ASSETS}/en/sv/sv01/logo.webp`);

  return urls;
}

export function collectionCardId(tcgdexId: string, variant: CardVariant): string {
  return `${tcgdexId}::${variant}`;
}

/**
 * Link da carta na Liga Pokémon no formato:
 * https://www.ligapokemon.com.br/?view=cards/card&tipo=1&card=(003/086)
 */
export function ligaPokemonCardUrl(
  localId: string,
  officialCount: number,
): string {
  const digits = localId.replace(/\D/g, "");
  const cardNum = (digits || localId).padStart(3, "0");
  const total = String(officialCount).padStart(3, "0");
  const card = `(${cardNum}/${total})`;
  const params = new URLSearchParams({
    view: "cards/card",
    tipo: "1",
    card,
  });
  return `https://www.ligapokemon.com.br/?${params.toString()}`;
}

/** Fallback: busca por nome + número quando não há total oficial da coleção. */
export function ligaPokemonSearchUrl(name: string, localId: string): string {
  const card = `${name} ${localId}`.trim();
  const params = new URLSearchParams({
    view: "cards/search",
    card,
  });
  return `https://www.ligapokemon.com.br/?${params.toString()}`;
}

export function ligaPokemonUrlForCard(card: {
  name: string;
  localId: string;
  setOfficialCount?: number;
}): string {
  if (card.setOfficialCount != null && card.setOfficialCount > 0) {
    return ligaPokemonCardUrl(card.localId, card.setOfficialCount);
  }
  return ligaPokemonSearchUrl(card.name, card.localId);
}

function addVariant(set: Set<CardVariant>, variant: CardVariant) {
  set.add(variant);
}

function variantFromDetailedType(type: string | undefined): CardVariant | null {
  if (!type) return null;
  const normalized = type.trim().toLowerCase();
  if (normalized === "normal") return "normal";
  if (
    normalized === "reverse" ||
    normalized === "reverse-holo" ||
    normalized === "reverseholo" ||
    normalized === "reverse-holofoil"
  ) {
    return "reverse";
  }
  if (
    normalized === "holo" ||
    normalized === "holofoil" ||
    normalized === "holo-foil"
  ) {
    return "holo";
  }
  if (
    normalized === "firstedition" ||
    normalized === "1st-edition" ||
    normalized === "first-edition"
  ) {
    return "firstEdition";
  }
  return null;
}

/**
 * A API PT às vezes marca reverse=false, mas o TCGPlayer ainda lista
 * reverse-holofoil / holofoil — usamos isso como fonte confiável.
 */
function addVariantsFromTcgplayerPricing(
  found: Set<CardVariant>,
  pricing: Record<string, unknown> | undefined,
) {
  if (!pricing) return;

  for (const key of Object.keys(pricing)) {
    const k = key.toLowerCase();
    if (
      k === "unit" ||
      k === "updated" ||
      k === "productid" ||
      k === "directlowprice"
    ) {
      continue;
    }

    if (k.includes("reverse")) {
      addVariant(found, "reverse");
      continue;
    }
    if (k.includes("1st") || k.includes("first")) {
      addVariant(found, "firstEdition");
      continue;
    }
    if (k === "holofoil" || k === "holo" || (k.includes("holo") && !k.includes("reverse"))) {
      addVariant(found, "holo");
      continue;
    }
    if (k === "normal") {
      addVariant(found, "normal");
    }
  }
}

/** Descobre quais variantes existem (flags + detalhes + preços TCGPlayer). */
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
    addVariantsFromTcgplayerPricing(
      found,
      detailed.pricing?.tcgplayer as Record<string, unknown> | undefined,
    );
  }

  addVariantsFromTcgplayerPricing(
    found,
    card.pricing?.tcgplayer as Record<string, unknown> | undefined,
  );

  // Cardmarket: avg-holo etc. costuma indicar reverse holo no mercado EU
  // quando a API PT veio só com normal=true e reverse=false.
  const cm = card.pricing?.cardmarket as Record<string, unknown> | undefined;
  if (cm) {
    const hasHoloMarket =
      typeof cm["avg-holo"] === "number" ||
      typeof cm["low-holo"] === "number" ||
      typeof cm["trend-holo"] === "number";
    if (hasHoloMarket && flags.normal && !flags.holo && !found.has("reverse")) {
      addVariant(found, "reverse");
    }
  }

  if (found.size === 0) addVariant(found, "normal");

  const order: CardVariant[] = ["normal", "reverse", "holo", "firstEdition"];
  return order.filter((variant) => found.has(variant));
}

export function expandCardToVariantEntries(
  card: TcgdexCardDetail,
  setOfficialCount?: number,
): CardBrief[] {
  return resolveAvailableVariants(card).map((variant) => ({
    id: collectionCardId(card.id, variant),
    tcgdexId: card.id,
    localId: card.localId,
    name: card.name,
    image: card.image,
    variant,
    types: card.types,
    setOfficialCount,
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

  // PT traz nomes localizados; EN costuma ter logo/symbol que faltam no PT.
  const [ptResponse, enResponse] = await Promise.all([
    fetch(`${TCGDEX_BASE}/sets?${params.toString()}`, {
      signal: options?.signal,
    }),
    fetch(`${TCGDEX_EN}/sets`, { signal: options?.signal }),
  ]);

  if (!ptResponse.ok) {
    throw new Error(`Falha ao listar coleções (${ptResponse.status})`);
  }

  const ptSets = (await ptResponse.json()) as SetBrief[];
  const enSets = enResponse.ok
    ? ((await enResponse.json()) as SetBrief[])
    : [];
  const enById = new Map(enSets.map((set) => [set.id, set]));
  const ptById = new Map(ptSets.map((set) => [set.id, set]));

  return ptSets.map((set) => {
    const en = enById.get(set.id);
    let logo = set.logo ?? en?.logo;
    let symbol = set.symbol ?? en?.symbol;

    if (!logo && !symbol) {
      for (const parentId of parentSetIds(set.id)) {
        const parent = enById.get(parentId) ?? ptById.get(parentId);
        if (parent?.logo || parent?.symbol) {
          logo = parent.logo;
          symbol = parent.symbol;
          break;
        }
      }
    }

    return {
      ...set,
      logo,
      symbol,
    };
  });
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

  const officialCount = set.cardCount.official;
  const cards = details.flatMap((detail) =>
    expandCardToVariantEntries(detail, officialCount),
  );

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
