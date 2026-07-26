/** Extrai abreviação do set + número impresso no canto da carta. */

export type ParsedCardCode = {
  abbreviation: string;
  number: string;
  total?: string;
  rawMatch: string;
};

const LANG_MARKERS = new Set(["PT", "EN", "ES", "DE", "FR", "IT", "JP", "KO"]);

/** Normaliza ruído típico de OCR em fotos de carta. */
export function normalizeOcrText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[|\\]/g, "/")
    .replace(/[^\w\s/]/g, " ")
    // O/0 trocados perto de dígitos
    .replace(/\bO(?=\d)/g, "0")
    .replace(/(?<=\d)O\b/g, "0")
    .replace(/\bO(\d{2,3})\b/g, "0$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exemplos aceitos:
 * - CRI 083/086
 * - CRI PT 112/086  (idioma entre set e número)
 * - CRIPT 112/086
 * - SVI 001
 * - texto OCR quebrado com 112 / 086 e CRI perto
 */
export function parseCardCodeFromText(text: string): ParsedCardCode | null {
  const normalized = normalizeOcrText(text);
  if (!normalized) return null;

  // CRI PT 112/086  |  CRI 112/086  |  SVI 001/198
  const withLang = /\b([A-Z]{2,4})\s+(?:PT|EN|ES|DE|FR|IT|JP|KO)\s+(\d{1,3})\s*\/\s*(\d{1,3})\b/.exec(
    normalized,
  );
  if (withLang && !LANG_MARKERS.has(withLang[1])) {
    return {
      abbreviation: withLang[1],
      number: withLang[2].padStart(3, "0"),
      total: withLang[3].padStart(3, "0"),
      rawMatch: withLang[0],
    };
  }

  // CRIPT112/086 (idioma colado)
  const gluedLang =
    /\b([A-Z]{3})(?:PT|EN|ES|DE|FR|IT|JP|KO)\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/.exec(
      normalized,
    );
  if (gluedLang) {
    return {
      abbreviation: gluedLang[1],
      number: gluedLang[2].padStart(3, "0"),
      total: gluedLang[3].padStart(3, "0"),
      rawMatch: gluedLang[0],
    };
  }

  const withTotal =
    /\b([A-Z]{2,4})\s*[- ]?\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/.exec(normalized);
  if (withTotal && !LANG_MARKERS.has(withTotal[1])) {
    return {
      abbreviation: withTotal[1],
      number: withTotal[2].padStart(3, "0"),
      total: withTotal[3].padStart(3, "0"),
      rawMatch: withTotal[0],
    };
  }

  const abbrThenNumber = /\b([A-Z]{2,4})\s+(\d{1,3})\b/.exec(normalized);
  if (
    abbrThenNumber &&
    !LANG_MARKERS.has(abbrThenNumber[1]) &&
    abbrThenNumber[1].length >= 3
  ) {
    return {
      abbreviation: abbrThenNumber[1],
      number: abbrThenNumber[2].padStart(3, "0"),
      rawMatch: abbrThenNumber[0],
    };
  }

  // Fallback: achar 112/086 e procurar abreviação de 3 letras perto
  const numOnly = /(\d{1,3})\s*\/\s*(\d{1,3})/.exec(normalized);
  if (numOnly) {
    const pickAbbr = (chunk: string): string | null => {
      const tokens = chunk.split(" ").filter(Boolean);
      for (let i = tokens.length - 1; i >= 0; i -= 1) {
        const token = tokens[i];
        if (LANG_MARKERS.has(token)) continue;
        const three = /^(?:([A-Z]{3})(?:PT|EN|ES|DE|FR|IT|JP|KO)?)$/.exec(token);
        if (three) return three[1];
        if (/^[A-Z]{3}$/.test(token)) return token;
      }
      return null;
    };

    const before = normalized.slice(0, numOnly.index);
    const after = normalized.slice(numOnly.index + numOnly[0].length);
    const abbreviation = pickAbbr(before) ?? pickAbbr(after);
    if (abbreviation) {
      return {
        abbreviation,
        number: numOnly[1].padStart(3, "0"),
        total: numOnly[2].padStart(3, "0"),
        rawMatch: `${abbreviation} ${numOnly[0]}`,
      };
    }

    // OCR às vezes solta "112" e "086" sem barra, já normalizamos O86→086
    // e ainda achamos um código de 3 letras no texto
    const anyAbbr = /\b([A-Z]{3})\b/.exec(
      normalized
        .split(" ")
        .filter((t) => !LANG_MARKERS.has(t))
        .join(" "),
    );
    if (anyAbbr && !LANG_MARKERS.has(anyAbbr[1])) {
      return {
        abbreviation: anyAbbr[1],
        number: numOnly[1].padStart(3, "0"),
        total: numOnly[2].padStart(3, "0"),
        rawMatch: `${anyAbbr[1]} ${numOnly[0]}`,
      };
    }
  }

  // Fallback extra: 112 e 086 em linhas separadas + CRI em qualquer lugar
  const looseNums = normalized.match(/\b(\d{3})\b/g);
  const looseAbbr = normalized
    .split(" ")
    .map((t) => t.replace(/(PT|EN|ES|DE|FR|IT|JP|KO)$/, ""))
    .find((t) => /^[A-Z]{3}$/.test(t) && !LANG_MARKERS.has(t));
  if (looseNums && looseNums.length >= 2 && looseAbbr) {
    return {
      abbreviation: looseAbbr,
      number: looseNums[0],
      total: looseNums[1],
      rawMatch: `${looseAbbr} ${looseNums[0]}/${looseNums[1]}`,
    };
  }

  return null;
}

/** Junta vários textos OCR e tenta parsear o melhor candidato. */
export function parseCardCodeFromOcrAttempts(
  texts: string[],
): ParsedCardCode | null {
  const combined = texts.join("\n");
  const direct = parseCardCodeFromText(combined);
  if (direct) return direct;

  for (const text of texts) {
    const parsed = parseCardCodeFromText(text);
    if (parsed) return parsed;
  }
  return null;
}
