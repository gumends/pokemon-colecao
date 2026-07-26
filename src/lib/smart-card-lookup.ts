import { expandCardToVariantEntries, getCard } from "@/lib/tcgdex";
import {
  getAbbrMap,
  getSetsByOfficialCount,
  resolveSetByAbbreviation,
  warmAbbreviationMap,
  type SetAbbrInfo,
} from "@/lib/set-abbreviations";
import {
  extractTightLetterWords,
  extractTightNumberPairs,
} from "@/lib/tight-ocr-tokens";
import type { CardBrief } from "@/lib/types";

export type SmartLookupResult = {
  abbreviation: string;
  number: string;
  total?: string;
  setId: string;
  setName: string;
  tcgdexId: string;
  cards: CardBrief[];
  strategy: string;
  ocrText?: string;
};

/** Normaliza confusões comuns de OCR em letras de set. */
export function normalizeAbbrToken(token: string): string {
  return token
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/5/g, "S")
    .replace(/8/g, "B")
    .replace(/\$/g, "S");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/**
 * Fuzzy só em palavras de 3 letras coladas (nunca letras soltas).
 * Ex.: CR1 ≈ CRI.
 */
export function fuzzyMatchAbbreviation(
  text: string,
  known: string[],
): { abbr: string; distance: number } | null {
  const tokens = extractTightLetterWords(text);
  if (tokens.length === 0) return null;

  let best: { abbr: string; distance: number } | null = null;
  for (const token of tokens) {
    const norm = normalizeAbbrToken(token);
    for (const abbr of known) {
      if (abbr.length !== 3) continue;
      if (Math.abs(abbr.length - norm.length) > 1) continue;
      const distance = Math.min(
        levenshtein(norm, abbr),
        levenshtein(token.toUpperCase(), abbr),
      );
      if (distance > 1) continue;
      if (!best || distance < best.distance) {
        best = { abbr, distance };
      }
      if (distance === 0) return best;
    }
  }
  return best;
}

/** @deprecated use extractTightNumberPairs — mantido p/ imports antigos */
export function extractNumberTotalPairs(
  text: string,
): Array<{ number: string; total: string }> {
  return extractTightNumberPairs(text).map(({ number, total }) => ({
    number,
    total,
  }));
}

async function tryLoadCard(
  info: SetAbbrInfo,
  number: string,
  abbreviation: string,
  total: string | undefined,
  strategy: string,
  ocrText?: string,
): Promise<SmartLookupResult | null> {
  const tcgdexId = `${info.setId}-${number}`;
  try {
    const detail = await getCard(tcgdexId);
    const cards = expandCardToVariantEntries(detail, info.officialCount);
    return {
      abbreviation,
      number,
      total,
      setId: info.setId,
      setName: info.setName,
      tcgdexId,
      cards,
      strategy,
      ocrText,
    };
  } catch {
    return null;
  }
}

/**
 * Estratégia “tokens colados”:
 * 1) só aceita NNN/NNN sem espaço (ex.: 112/086)
 * 2) só usa palavras de 3 letras juntas (ex.: CRI)
 * 3) filtra sets pelo total + fuzzy na abreviação
 * 4) confirma que a carta existe na TCGdex
 *
 * Sem NNN/NNN colado → não resolve (espera frame melhor).
 */
export async function smartResolveFromOcrText(
  ocrText: string,
): Promise<SmartLookupResult | null> {
  const pairs = extractTightNumberPairs(ocrText);
  if (pairs.length === 0) return null;

  await warmAbbreviationMap(50);
  const map = getAbbrMap();
  const known = [...map.keys()];
  const fuzzy = fuzzyMatchAbbreviation(ocrText, known);
  const letterWords = extractTightLetterWords(ocrText);

  for (const pair of pairs) {
    const totalNum = Number(pair.total);
    const setsForTotal = getSetsByOfficialCount(totalNum);

    // 1) palavra de 3 letras + fuzzy contra sets conhecidos
    if (fuzzy) {
      const info = map.get(fuzzy.abbr);
      if (info) {
        const hit = await tryLoadCard(
          info,
          pair.number,
          fuzzy.abbr,
          pair.total,
          `tight-total+fuzzy-abbr(${fuzzy.distance})`,
          ocrText,
        );
        if (hit) return hit;
      }
    }

    // 2) match exato de palavra de 3 letras no mapa
    for (const word of letterWords) {
      const info = map.get(word) ?? map.get(normalizeAbbrToken(word));
      if (!info) continue;
      const hit = await tryLoadCard(
        info,
        pair.number,
        word,
        pair.total,
        "tight-total+exact-abbr",
        ocrText,
      );
      if (hit) return hit;
    }

    // 3) só o total oficial (NNN/NNN) — última tentativa
    for (const info of setsForTotal) {
      let abbr = [...map.entries()].find(([, v]) => v.setId === info.setId)?.[0];
      abbr = abbr ?? info.setId.toUpperCase().slice(0, 3);
      const hit = await tryLoadCard(
        info,
        pair.number,
        abbr,
        pair.total,
        "tight-total-only",
        ocrText,
      );
      if (hit) return hit;
    }
  }

  return null;
}

export async function resolveExact(
  abbreviation: string,
  numberRaw: string,
): Promise<SmartLookupResult | null> {
  const abbreviationNorm = abbreviation.trim().toUpperCase();
  const number = numberRaw.replace(/\D/g, "").padStart(3, "0");
  const info = await resolveSetByAbbreviation(abbreviationNorm);
  if (!info) return null;
  return tryLoadCard(
    info,
    number,
    abbreviationNorm,
    undefined,
    "manual",
  );
}
