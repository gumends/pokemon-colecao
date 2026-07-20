import type { CardBrief, CollectionMap, CollectionStatus } from "@/lib/types";

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
