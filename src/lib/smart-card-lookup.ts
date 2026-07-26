import {
  expandCardToVariantEntries,
  getCard,
  listSets,
  searchCards,
} from "@/lib/tcgdex";
import {
  getAbbrMap,
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

function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Similaridade 0–1 entre dois nomes (leve a typos de OCR). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    return Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
  }
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Fuzzy só em palavras de 3 letras coladas, contra uma lista restrita
 * (ex.: só abreviações de sets com aquele officialCount).
 */
export function fuzzyMatchAbbreviation(
  text: string,
  known: string[],
): { abbr: string; distance: number } | null {
  const tokens = extractTightLetterWords(text);
  if (tokens.length === 0 || known.length === 0) return null;

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

/** @deprecated use extractTightNumberPairs */
export function extractNumberTotalPairs(
  text: string,
): Array<{ number: string; total: string }> {
  return extractTightNumberPairs(text).map(({ number, total }) => ({
    number,
    total,
  }));
}

const NAME_STOP = new Set([
  "item",
  "treinador",
  "apoiador",
  "pokemon",
  "estadio",
  "stadium",
  "trainer",
  "durante",
  "proximo",
  "oponente",
  "escolha",
  "voce",
  "pode",
  "jogar",
  "cartas",
  "quanto",
  "quantas",
  "turno",
  "seus",
  "suas",
  "pilha",
  "descarte",
  "efeito",
  "efeitos",
  "basico",
  "basicos",
]);

/** Linhas do OCR que parecem título da carta. */
export function extractNameCandidates(ocrText: string): string[] {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const line of lines) {
    if (line.length < 8 || line.length > 60) continue;
    if (/^\d/.test(line)) continue;
    const words = line.split(" ").filter((w) => /\p{L}/u.test(w));
    if (words.length < 2) continue;
    const lower = normalizeName(line);
    if (NAME_STOP.has(lower)) continue;
    // ignora linhas só com palavras muito genéricas
    const meaningful = words.filter((w) => !NAME_STOP.has(normalizeName(w)));
    if (meaningful.length < 2) continue;
    out.push(line);
  }

  // também tenta achar "Tomo da Transform…" colado em lixo: "s Tomo da Transformagio de uma"
  for (const line of lines) {
    const m = /\b([A-ZÀ-Ü][\p{L}']+(?:\s+(?:da|de|do|das|dos|e|the|of)\s+)?[\p{L}']+(?:\s+[\p{L}']+){0,4})/u.exec(
      line,
    );
    if (m?.[1] && m[1].length >= 10) out.push(m[1].trim());
  }

  return [...new Set(out)].slice(0, 10);
}

function ocrNameQueries(name: string): string[] {
  const base = name.trim();
  const ascii = normalizeName(base);
  const fixed = ascii
    .replace(/gao\b/g, "cao")
    .replace(/agio\b/g, "acao")
    .replace(/gdes\b/g, "coes")
    .replace(/transformagao/g, "transformacao")
    .replace(/transformagio/g, "transformacao");

  const words = fixed.split(" ").filter((w) => w.length > 1);
  const queries = [base, ascii, fixed];
  if (words.length >= 2) queries.push(words.slice(0, 2).join(" "));
  if (words.length >= 3) queries.push(words.slice(0, 3).join(" "));
  // palavra distintiva (ex.: Transformacao, Roxie, Munkidori)
  const distinctive = [...words].sort((a, b) => b.length - a.length)[0];
  if (distinctive && distinctive.length >= 5) queries.push(distinctive);

  return [...new Set(queries.filter((q) => q.length >= 4))];
}

function setIdFromCardId(tcgdexId: string): string {
  const idx = tcgdexId.lastIndexOf("-");
  return idx > 0 ? tcgdexId.slice(0, idx) : tcgdexId;
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
    if (total) {
      const printed = Number(total);
      if (
        Number.isFinite(printed) &&
        info.officialCount > 0 &&
        info.officialCount !== printed
      ) {
        return null;
      }
    }
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

async function resultFromCardId(
  tcgdexId: string,
  strategy: string,
  ocrText: string,
  total?: string,
): Promise<SmartLookupResult | null> {
  try {
    const detail = await getCard(tcgdexId);
    const setId = setIdFromCardId(detail.id);
    const map = getAbbrMap();
    let info =
      [...map.values()].find((v) => v.setId === setId) ?? null;
    if (!info) {
      const sets = await listSets();
      const set = sets.find((s) => s.id === setId);
      if (!set) return null;
      info = {
        setId: set.id,
        setName: set.name,
        officialCount: set.cardCount.official,
      };
    }
    if (total) {
      const printed = Number(total);
      if (
        Number.isFinite(printed) &&
        info.officialCount > 0 &&
        info.officialCount !== printed
      ) {
        // nome bateu mas o total impresso não — ainda pode ser a carta certa
        // (secret rare / OCR do total errado). Não bloqueia busca por nome.
      }
    }
    const abbr =
      [...map.entries()].find(([, v]) => v.setId === setId)?.[0] ??
      setId.toUpperCase().slice(0, 3);
    const number = String(detail.localId).replace(/\D/g, "").padStart(3, "0");
    const cards = expandCardToVariantEntries(detail, info.officialCount);
    return {
      abbreviation: abbr,
      number: number || String(detail.localId),
      total,
      setId: info.setId,
      setName: info.setName,
      tcgdexId: detail.id,
      cards,
      strategy,
      ocrText,
    };
  } catch {
    return null;
  }
}

/** Busca carta pelo nome lido no OCR (com tolerância a typo). */
export async function resolveByCardName(
  ocrText: string,
  pair?: { number: string; total: string },
): Promise<SmartLookupResult | null> {
  const candidates = extractNameCandidates(ocrText);
  if (candidates.length === 0) return null;

  type Scored = { id: string; name: string; localId: string; score: number; query: string };
  const scored: Scored[] = [];

  for (const candidate of candidates) {
    for (const query of ocrNameQueries(candidate)) {
      try {
        const hits = await searchCards(query, { perPage: 16 });
        for (const hit of hits) {
          const score = Math.max(
            nameSimilarity(candidate, hit.name),
            nameSimilarity(query, hit.name),
          );
          if (score < 0.55) continue;
          scored.push({
            id: hit.tcgdexId,
            name: hit.name,
            localId: hit.localId,
            score,
            query,
          });
        }
      } catch {
        // próxima query
      }
    }
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);

  // Se temos NNN/NNN, prefere carta com o mesmo número
  if (pair) {
    const withNumber = scored.filter((s) => {
      const n = String(s.localId).replace(/\D/g, "").padStart(3, "0");
      return n === pair.number;
    });
    for (const hit of withNumber) {
      if (hit.score < 0.55) continue;
      const result = await resultFromCardId(
        hit.id,
        `name+number(${hit.score.toFixed(2)})`,
        ocrText,
        pair.total,
      );
      if (result) return result;
    }
  }

  // Melhor nome puro (score alto)
  for (const hit of scored) {
    if (hit.score < 0.72) continue;
    const result = await resultFromCardId(
      hit.id,
      `name(${hit.score.toFixed(2)})`,
      ocrText,
      pair?.total,
    );
    if (result) return result;
  }

  return null;
}

/** Sets cujo officialCount == total impresso (mapa + lista TCGdex). */
async function setsMatchingTotal(totalNum: number): Promise<SetAbbrInfo[]> {
  const byId = new Map<string, SetAbbrInfo>();

  for (const info of getAbbrMap().values()) {
    if (info.officialCount === totalNum) byId.set(info.setId, info);
  }

  try {
    const sets = await listSets();
    for (const set of sets) {
      if (set.cardCount.official !== totalNum) continue;
      if (byId.has(set.id)) continue;
      byId.set(set.id, {
        setId: set.id,
        setName: set.name,
        officialCount: set.cardCount.official,
      });
    }
  } catch {
    // usa só o mapa em cache
  }

  return [...byId.values()];
}

function abbrsForSets(
  sets: SetAbbrInfo[],
  map: Map<string, SetAbbrInfo>,
): string[] {
  const ids = new Set(sets.map((s) => s.setId));
  const out: string[] = [];
  for (const [abbr, info] of map.entries()) {
    if (ids.has(info.setId)) out.push(abbr);
  }
  return out;
}

async function resolveByCode(
  ocrText: string,
): Promise<SmartLookupResult | null> {
  const pairs = extractTightNumberPairs(ocrText);
  if (pairs.length === 0) return null;

  const map = getAbbrMap();
  const letterWords = extractTightLetterWords(ocrText);

  for (const pair of pairs) {
    const totalNum = Number(pair.total);
    const setsForTotal = await setsMatchingTotal(totalNum);
    const allowedAbbrs = abbrsForSets(setsForTotal, map);

    for (const word of letterWords) {
      const candidates = [word, normalizeAbbrToken(word)];
      for (const key of candidates) {
        let info = map.get(key) ?? null;
        if (!info && allowedAbbrs.length === 0) {
          info = await resolveSetByAbbreviation(key);
        }
        if (!info) continue;
        if (info.officialCount !== totalNum) continue;
        const hit = await tryLoadCard(
          info,
          pair.number,
          key,
          pair.total,
          "tight-total+exact-abbr",
          ocrText,
        );
        if (hit) return hit;
      }
    }

    const fuzzy = fuzzyMatchAbbreviation(
      ocrText,
      allowedAbbrs.length > 0 ? allowedAbbrs : [...map.keys()],
    );
    if (fuzzy) {
      const info = map.get(fuzzy.abbr);
      if (info && info.officialCount === totalNum) {
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

    for (const info of setsForTotal) {
      const abbr =
        [...map.entries()].find(([, v]) => v.setId === info.setId)?.[0] ??
        info.setId.toUpperCase().slice(0, 3);
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

/**
 * Resolve carta a partir do OCR:
 * 1) nome impresso (Tomo da Transformação…)
 * 2) código colado CRI + 083/086
 */
export async function smartResolveFromOcrText(
  ocrText: string,
): Promise<SmartLookupResult | null> {
  await warmAbbreviationMap(80);
  const pairs = extractTightNumberPairs(ocrText);
  const pair = pairs[0];

  // Nome primeiro quando o OCR já leu o título (evita SFA errado)
  const byName = await resolveByCardName(ocrText, pair);
  if (byName) return byName;

  return resolveByCode(ocrText);
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
