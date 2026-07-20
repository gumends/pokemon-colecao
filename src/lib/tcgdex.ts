import type { CardBrief, SerieBrief, SetBrief, SetDetail } from "@/lib/types";

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

  return (await response.json()) as CardBrief[];
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

  return (await response.json()) as SetDetail;
}

export function ownedCountInSet(
  setId: string,
  ownedCardIds: Iterable<string>,
): number {
  const prefix = `${setId}-`;
  let count = 0;
  for (const id of ownedCardIds) {
    if (id.startsWith(prefix)) count += 1;
  }
  return count;
}
