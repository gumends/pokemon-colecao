/** Extrai abreviação do set + número impresso no canto da carta. */

export type ParsedCardCode = {
  abbreviation: string;
  number: string;
  total?: string;
  rawMatch: string;
  /** Maior = mais confiável (precisa de barra e set conhecido). */
  score: number;
};

const LANG_MARKERS = new Set(["PT", "EN", "ES", "DE", "FR", "IT", "JP", "KO"]);

/** Normaliza ruído típico de OCR em fotos de carta. */
export function normalizeOcrText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[|\\]/g, "/")
    .replace(/[^\w\s/]/g, " ")
    .replace(/\bO(?=\d)/g, "0")
    .replace(/(?<=\d)O\b/g, "0")
    .replace(/\bO(\d{2,3})\b/g, "0$1")
    .replace(/\s+/g, " ")
    .trim();
}

function pushCandidate(
  list: ParsedCardCode[],
  candidate: Omit<ParsedCardCode, "score"> & { score: number },
) {
  if (LANG_MARKERS.has(candidate.abbreviation)) return;
  if (!/^[A-Z]{2,4}$/.test(candidate.abbreviation)) return;
  const num = Number(candidate.number);
  if (!Number.isFinite(num) || num < 1 || num > 400) return;
  list.push(candidate);
}

/** Coleta candidatos ranqueados a partir de um texto OCR. */
export function collectCardCodeCandidates(text: string): ParsedCardCode[] {
  const normalized = normalizeOcrText(text);
  if (!normalized) return [];
  const found: ParsedCardCode[] = [];

  const withLang =
    /\b([A-Z]{3})\s+(?:PT|EN|ES|DE|FR|IT|JP|KO)\s+(\d{1,3})\s*\/\s*(\d{1,3})\b/g;
  for (const match of normalized.matchAll(withLang)) {
    pushCandidate(found, {
      abbreviation: match[1],
      number: match[2].padStart(3, "0"),
      total: match[3].padStart(3, "0"),
      rawMatch: match[0],
      score: 100,
    });
  }

  const gluedLang =
    /\b([A-Z]{3})(?:PT|EN|ES|DE|FR|IT|JP|KO)\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/g;
  for (const match of normalized.matchAll(gluedLang)) {
    pushCandidate(found, {
      abbreviation: match[1],
      number: match[2].padStart(3, "0"),
      total: match[3].padStart(3, "0"),
      rawMatch: match[0],
      score: 95,
    });
  }

  const withTotal = /\b([A-Z]{3})\s+(\d{1,3})\s*\/\s*(\d{1,3})\b/g;
  for (const match of normalized.matchAll(withTotal)) {
    pushCandidate(found, {
      abbreviation: match[1],
      number: match[2].padStart(3, "0"),
      total: match[3].padStart(3, "0"),
      rawMatch: match[0],
      score: 90,
    });
  }

  // Só número XXX/YYY + abreviação de 3 letras no mesmo texto
  const numOnly = /(\d{1,3})\s*\/\s*(\d{1,3})/.exec(normalized);
  if (numOnly) {
    const abbrs = [...normalized.matchAll(/\b([A-Z]{3})\b/g)]
      .map((m) => m[1])
      .filter((a) => !LANG_MARKERS.has(a));
    for (const abbreviation of abbrs) {
      pushCandidate(found, {
        abbreviation,
        number: numOnly[1].padStart(3, "0"),
        total: numOnly[2].padStart(3, "0"),
        rawMatch: `${abbreviation} ${numOnly[0]}`,
        score: 70,
      });
    }
  }

  // Dedup por abbr+number, mantém maior score
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
    : all.filter((c) => c.score >= 90); // sem whitelist, exige padrão forte com /

  if (filtered.length === 0) return null;

  // Preferir candidatos que aparecem mais vezes + maior score
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
