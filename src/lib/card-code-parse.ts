/**
 * Extrai abreviação do set + número impresso no canto da carta.
 * Só aceita tokens colados: 3 letras juntas + NNN/NNN sem espaço na barra.
 */

import {
  extractTightLetterWords,
  extractTightNumberPairs,
} from "@/lib/tight-ocr-tokens";

export type ParsedCardCode = {
  abbreviation: string;
  number: string;
  total?: string;
  rawMatch: string;
  /** Maior = mais confiável. */
  score: number;
};

const LANG_MARKERS = new Set(["PT", "EN", "ES", "DE", "FR", "IT", "JP", "KO"]);

/** Normaliza ruído típico de OCR — não cola tokens separados. */
export function normalizeOcrText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[|\\]/g, "/")
    .replace(/[^\w\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pushCandidate(
  list: ParsedCardCode[],
  candidate: Omit<ParsedCardCode, "score"> & { score: number },
) {
  if (LANG_MARKERS.has(candidate.abbreviation)) return;
  if (!/^[A-Z0-9]{3}$/.test(candidate.abbreviation)) return;
  if (!/[A-Z]/.test(candidate.abbreviation)) return;
  const num = Number(candidate.number);
  if (!Number.isFinite(num) || num < 1 || num > 400) return;
  list.push(candidate);
}

/**
 * Só candidatos com:
 * - NNN/NNN colado (sem espaço)
 * - palavra de exatamente 3 letras juntas
 */
export function collectCardCodeCandidates(text: string): ParsedCardCode[] {
  const pairs = extractTightNumberPairs(text);
  const abbrs = extractTightLetterWords(text);
  if (pairs.length === 0 || abbrs.length === 0) return [];

  const found: ParsedCardCode[] = [];
  for (const pair of pairs) {
    for (const abbreviation of abbrs) {
      pushCandidate(found, {
        abbreviation,
        number: pair.number,
        total: pair.total,
        rawMatch: `${abbreviation} ${pair.raw}`,
        score: 100,
      });
    }
  }

  const best = new Map<string, ParsedCardCode>();
  for (const item of found) {
    const key = `${item.abbreviation}-${item.number}`;
    const prev = best.get(key);
    if (!prev || item.score > prev.score) best.set(key, item);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

export function parseCardCodeFromText(text: string): ParsedCardCode | null {
  return collectCardCodeCandidates(text)[0] ?? null;
}

/**
 * Escolhe o melhor código entre várias leituras OCR.
 * Se `knownAbbreviations` for passado, só aceita sets reais.
 */
export function parseCardCodeFromOcrAttempts(
  texts: string[],
  knownAbbreviations?: Set<string> | string[],
): ParsedCardCode | null {
  const known = knownAbbreviations
    ? knownAbbreviations instanceof Set
      ? knownAbbreviations
      : new Set(knownAbbreviations.map((a) => a.toUpperCase()))
    : null;

  const all = texts.flatMap((text) => collectCardCodeCandidates(text));
  if (all.length === 0) return null;

  const filtered = known
    ? all.filter((c) => known.has(c.abbreviation))
    : all;

  if (filtered.length === 0) return null;

  const ranked = new Map<string, { item: ParsedCardCode; hits: number }>();
  for (const item of filtered) {
    const key = `${item.abbreviation}-${item.number}`;
    const prev = ranked.get(key);
    if (!prev) ranked.set(key, { item, hits: 1 });
    else {
      prev.hits += 1;
      if (item.score > prev.item.score) prev.item = item;
    }
  }

  return [...ranked.values()].sort((a, b) => {
    if (b.hits !== a.hits) return b.hits - a.hits;
    return b.item.score - a.item.score;
  })[0]?.item ?? null;
}
