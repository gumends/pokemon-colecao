/** Extrai abreviação do set + número impresso no canto da carta. */

export type ParsedCardCode = {
  abbreviation: string;
  number: string;
  total?: string;
  rawMatch: string;
};

/**
 * Exemplos aceitos:
 * - CRI 083/086
 * - CRI083/086
 * - CRI 83/86
 * - SVI 001
 */
export function parseCardCodeFromText(text: string): ParsedCardCode | null {
  const normalized = text
    .toUpperCase()
    .replace(/[|\\]/g, "/")
    .replace(/O(?=\d)/g, "0") // O confunde com 0 perto de dígitos
    .replace(/\s+/g, " ")
    .trim();

  const withTotal =
    /\b([A-Z]{2,5})\s*[- ]?\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/.exec(normalized);
  if (withTotal) {
    return {
      abbreviation: withTotal[1],
      number: withTotal[2].padStart(3, "0"),
      total: withTotal[3].padStart(3, "0"),
      rawMatch: withTotal[0],
    };
  }

  const abbrThenNumber = /\b([A-Z]{2,5})\s+(\d{1,3})\b/.exec(normalized);
  if (abbrThenNumber) {
    return {
      abbreviation: abbrThenNumber[1],
      number: abbrThenNumber[2].padStart(3, "0"),
      rawMatch: abbrThenNumber[0],
    };
  }

  return null;
}
