import type { CardBrief, CollectionMap, CollectionStatus } from "@/lib/types";

export const COLLECTION_STORAGE_KEY = "pokemon-colecao:v1";

export function readCollection(): CollectionMap {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(COLLECTION_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CollectionMap;
  } catch {
    return {};
  }
}

export function writeCollection(map: CollectionMap): void {
  window.localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(map));
}

export function setCardStatus(
  map: CollectionMap,
  card: CardBrief,
  status: CollectionStatus | null,
): CollectionMap {
  const next = { ...map };

  if (status === null) {
    delete next[card.id];
    return next;
  }

  next[card.id] = {
    card,
    status,
    updatedAt: new Date().toISOString(),
  };

  return next;
}

export function countByStatus(map: CollectionMap) {
  let owned = 0;
  let wanted = 0;

  for (const entry of Object.values(map)) {
    if (entry.status === "owned") owned += 1;
    if (entry.status === "wanted") wanted += 1;
  }

  return { owned, wanted, total: owned + wanted };
}
