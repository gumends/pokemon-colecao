import type { CardBrief } from "@/lib/types";
import { VARIANT_LABELS } from "@/lib/types";

export type ParsedCardCodeQuery = {
  number: string;
  total?: string;
};

/** Extrai 083 ou 083/086 da busca (barra digitada pela pessoa). */
export function parseCardCodeQuery(query: string): ParsedCardCodeQuery | null {
  const term = query.trim();
  if (!term) return null;

  const withTotal = /^(\d{1,3})\s*\/\s*(\d{1,3})$/.exec(term);
  if (withTotal) {
    return {
      number: withTotal[1].padStart(3, "0"),
      total: withTotal[2].padStart(3, "0"),
    };
  }

  const onlyNumber = /^(\d{1,3})$/.exec(term);
  if (onlyNumber) {
    return { number: onlyNumber[1].padStart(3, "0") };
  }

  return null;
}

/**
 * Busca por nome, id, variante, número (083)
 * ou número/total (083/086) — a barra é digitada pela pessoa, sem máscara.
 */
export function cardMatchesQuery(card: CardBrief, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;

  const variantLabel = VARIANT_LABELS[card.variant]?.toLowerCase() ?? "";

  if (
    card.name.toLowerCase().includes(term) ||
    card.localId.toLowerCase().includes(term) ||
    card.id.toLowerCase().includes(term) ||
    card.tcgdexId.toLowerCase().includes(term) ||
    (card.variant?.toLowerCase() ?? "").includes(term) ||
    variantLabel.includes(term)
  ) {
    return true;
  }

  const pair = parseCardCodeQuery(term);
  if (!pair) return false;

  const localDigits = card.localId.replace(/\D/g, "");
  const numberMatch =
    localDigits === pair.number ||
    localDigits.padStart(3, "0") === pair.number ||
    Number(localDigits) === Number(pair.number);

  if (!numberMatch) return false;

  if (pair.total) {
    if (
      typeof card.setOfficialCount === "number" &&
      Number.isFinite(card.setOfficialCount)
    ) {
      return card.setOfficialCount === Number(pair.total);
    }
  }

  return true;
}
