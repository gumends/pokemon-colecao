import type { CardBrief } from "@/lib/types";
import { VARIANT_LABELS } from "@/lib/types";

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

  const pair = /^(\d{1,3})\s*\/\s*(\d{1,3})$/.exec(term);
  if (!pair) return false;

  const numberRaw = pair[1];
  const totalNum = Number(pair[2]);
  const localDigits = card.localId.replace(/\D/g, "");
  const numberMatch =
    localDigits === numberRaw ||
    localDigits.padStart(3, "0") === numberRaw.padStart(3, "0") ||
    Number(localDigits) === Number(numberRaw);

  if (!numberMatch) return false;

  if (
    typeof card.setOfficialCount === "number" &&
    Number.isFinite(card.setOfficialCount)
  ) {
    return card.setOfficialCount === totalNum;
  }

  // Sem total no card: aceita só pelo número da esquerda
  return true;
}
