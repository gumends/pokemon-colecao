import type { CardBrief } from "@/lib/types";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/pt";

export function cardImageUrl(
  imageBase: string | undefined,
  quality: "low" | "high" = "low",
): string | null {
  if (!imageBase) return null;
  return `${imageBase}/${quality}.webp`;
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
