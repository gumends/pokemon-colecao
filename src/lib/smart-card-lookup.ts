import { expandCardToVariantEntries, getCard } from "@/lib/tcgdex";
import {
  getAbbrMap,
  getSetsByOfficialCount,
  resolveSetByAbbreviation,
  warmAbbreviationMap,
  type SetAbbrInfo,
} from "@/lib/set-abbreviations";
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

const LANG = new Set(["PT", "EN", "ES", "DE", "FR", "IT", "JP", "KO"]);

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

/** Acha a abreviação conhecida mais parecida com tokens do OCR. */
export function fuzzyMatchAbbreviation(
  text: string,
  known: string[],
): { abbr: string; distance: number } | null {
  const normalized = text.toUpperCase().replace(/[^\w\s/]/g, " ");
  const tokens = normalized
    .split(/\s+/)
    .flatMap((t) => {
      const cleaned = t.replace(/[^A-Z0-9]/g, "");
      if (!cleaned) return [];
      // CRIPT → CRI + PT
      const m = /^(?:([A-Z0-9]{3})(PT|EN|ES|DE|FR|IT|JP|KO))$/.exec(cleaned);
      if (m) return [m[1], m[2]];
      return [cleaned];
    })
    .filter((t) => t.length >= 2 && t.length <= 4 && !LANG.has(t));

  let best: { abbr: string; distance: number } | null = null;
  for (const token of tokens) {
    const norm = normalizeAbbrToken(token);
    for (const abbr of known) {
      if (abbr.length < 2) continue;
      // compara tamanhos próximos
      if (Math.abs(abbr.length - norm.length) > 1) continue;
      const distance = Math.min(
        levenshtein(norm, abbr),
        levenshtein(token.toUpperCase(), abbr),
      );
      const maxDist = abbr.length <= 3 ? 1 : 2;
      if (distance > maxDist) continue;
      if (!best || distance < best.distance) {
        best = { abbr, distance };
      }
      if (distance === 0) return best;
    }
  }
  return best;
}

export function extractNumberTotalPairs(
  text: string,
): Array<{ number: string; total: string }> {
  const normalized = text
    .toUpperCase()
    .replace(/[|\\]/g, "/")
    .replace(/\bO(?=\d)/g, "0")
    .replace(/(?<=\d)O\b/g, "0")
    .replace(/\bO(\d{2,3})\b/g, "0$1");

  const pairs: Array<{ number: string; total: string }> = [];
  const re = /(\d{1,3})\s*\/\s*(\d{1,3})/g;
  for (const match of normalized.matchAll(re)) {
    const number = match[1].replace(/\D/g, "").padStart(3, "0");
    const total = match[2].replace(/\D/g, "").padStart(3, "0");
    const n = Number(number);
    const t = Number(total);
    if (n < 1 || n > 400 || t < 1 || t > 400) continue;
    pairs.push({ number, total });
  }

  // 112 e 086 em linhas separadas
  if (pairs.length === 0) {
    const nums = [...normalized.matchAll(/\b(\d{3})\b/g)].map((m) => m[1]);
    if (nums.length >= 2) {
      pairs.push({ number: nums[0], total: nums[1] });
    }
  }

  return pairs;
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
 * Estratégia inteligente:
 * 1) achar XXX/YYY no texto (números são mais estáveis no OCR)
 * 2) filtrar sets com officialCount == YYY
 * 3) fuzzy na abreviação (CRI ≈ CR1/ORI)
 * 4) testar se a carta existe na TCGdex
 */
export async function smartResolveFromOcrText(
  ocrText: string,
): Promise<SmartLookupResult | null> {
  await warmAbbreviationMap(50);
  const map = getAbbrMap();
  const known = [...map.keys()];
  const pairs = extractNumberTotalPairs(ocrText);
  const fuzzy = fuzzyMatchAbbreviation(ocrText, known);

  // 1) número/total + set pelo total oficial
  for (const pair of pairs) {
    const totalNum = Number(pair.total);
    const setsForTotal = getSetsByOfficialCount(totalNum);

    if (fuzzy) {
      const info = map.get(fuzzy.abbr);
      if (info) {
        const hit = await tryLoadCard(
          info,
          pair.number,
          fuzzy.abbr,
          pair.total,
          `total+fuzzy-abbr(${fuzzy.distance})`,
          ocrText,
        );
        if (hit) return hit;
      }
    }

    for (const info of setsForTotal) {
      // descobre abbr desse set
      let abbr = [...map.entries()].find(([, v]) => v.setId === info.setId)?.[0];
      abbr = abbr ?? info.setId.toUpperCase().slice(0, 3);
      const hit = await tryLoadCard(
        info,
        pair.number,
        abbr,
        pair.total,
        "total-only",
        ocrText,
      );
      if (hit) return hit;
    }
  }

  // 2) só fuzzy abbr + primeiro número de 3 dígitos
  if (fuzzy) {
    const info =
      map.get(fuzzy.abbr) ?? (await resolveSetByAbbreviation(fuzzy.abbr));
    if (info) {
      const numberMatch = /\b(\d{1,3})\b/.exec(
        ocrText.replace(/\bO(\d{2,3})\b/g, "0$1"),
      );
      if (numberMatch) {
        const number = numberMatch[1].padStart(3, "0");
        const hit = await tryLoadCard(
          info,
          number,
          fuzzy.abbr,
          undefined,
          `abbr-only(${fuzzy.distance})`,
          ocrText,
        );
        if (hit) return hit;
      }
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
