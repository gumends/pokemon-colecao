/**
 * Estratégia de tokens “colados”:
 * - Letras: só palavras de exatamente 3 chars juntas (ex.: CRI / CR1), sem letras soltas.
 * - Números: só padrão NNN/NNN colado, sem espaço em volta da barra (ex.: 112/086).
 */

const LANG = new Set(["PT", "EN", "ES", "DE", "FR", "IT", "JP", "KO"]);
const LANG_ALT = "PT|EN|ES|DE|FR|IT|JP|KO";

export type TightNumberPair = {
  number: string;
  total: string;
  raw: string;
};

export type TightTokens = {
  letterWords: string[];
  numberPairs: TightNumberPair[];
};

/** Uppercase + barra; não cola tokens separados por espaço. */
function prepareOcr(text: string): string {
  return text
    .toUpperCase()
    .replace(/[|\\]/g, "/")
    .replace(/[^\w\s/]/g, " ");
}

function toDigits(chunk: string): string {
  return chunk.replace(/O/g, "0");
}

function pushPair(
  pairs: TightNumberPair[],
  left: string,
  right: string,
  raw: string,
) {
  const number = toDigits(left);
  const total = toDigits(right);
  if (!/^\d{3}$/.test(number) || !/^\d{3}$/.test(total)) return;
  const n = Number(number);
  const t = Number(total);
  if (n < 1 || n > 400 || t < 1 || t > 400) return;
  if (pairs.some((p) => p.number === number && p.total === total)) return;
  pairs.push({ number, total, raw });
}

/** Só NNN/NNN sem espaço em volta da barra (também se colado em CRI/CRIPT). */
export function extractTightNumberPairs(text: string): TightNumberPair[] {
  const prepared = prepareOcr(text);
  const pairs: TightNumberPair[] = [];

  // Isolado: 112/086  (O12/O86 com O de OCR)
  const alone =
    /(?<![0-9A-Z])([0-9O]{3})\/([0-9O]{3})(?![0-9A-Z])/g;
  for (const match of prepared.matchAll(alone)) {
    pushPair(pairs, match[1], match[2], `${toDigits(match[1])}/${toDigits(match[2])}`);
  }

  // Colado no código: CRIPT112/086 ou CRI112/086
  const glued = new RegExp(
    `(?<![A-Z0-9])(?:[A-Z0-9]{3})(?:${LANG_ALT})?([0-9O]{3})\\/([0-9O]{3})(?![0-9A-Z])`,
    "g",
  );
  for (const match of prepared.matchAll(glued)) {
    pushPair(pairs, match[1], match[2], `${toDigits(match[1])}/${toDigits(match[2])}`);
  }

  return pairs;
}

/**
 * Só blocos de exatamente 3 chars colados (letras; dígitos só se OCR confunde,
 * ex.: CR1). Ignora números puros e idiomas. Aceita CRI ou CRIPT → CRI.
 */
export function extractTightLetterWords(text: string): string[] {
  const prepared = prepareOcr(text);
  // Não tratar o próprio NNN/NNN como “palavra”
  const withoutPairs = prepared.replace(
    /(?<![0-9A-Z])[0-9O]{3}\/[0-9O]{3}(?![0-9A-Z])/g,
    " ",
  );
  const words = new Set<string>();

  const accept = (token: string) => {
    if (LANG.has(token)) return;
    if (/^[0-9O]{3}$/.test(token)) return;
    if (!/[A-Z]/.test(token)) return;
    words.add(token);
  };

  // CRI + idioma colado: CRIPT / CR1PT
  const withLang = new RegExp(
    `(?<![A-Z0-9])([A-Z0-9]{3})(?:${LANG_ALT})(?![A-Z0-9])`,
    "g",
  );
  for (const match of withoutPairs.matchAll(withLang)) {
    accept(match[1]);
  }

  // Colado no número: CRIPT112/086 → CRI
  const gluedToNumber = new RegExp(
    `(?<![A-Z0-9])([A-Z0-9]{3})(?:${LANG_ALT})?[0-9O]{3}\\/[0-9O]{3}(?![0-9A-Z])`,
    "g",
  );
  for (const match of prepared.matchAll(gluedToNumber)) {
    accept(match[1]);
  }

  // Exatamente 3 chars isolados: CRI / CR1
  const alone = /(?<![A-Z0-9])([A-Z0-9]{3})(?![A-Z0-9])/g;
  for (const match of withoutPairs.matchAll(alone)) {
    accept(match[1]);
  }

  return [...words];
}

/** Extrai só os tokens válidos para o scanner. */
export function extractTightTokens(text: string): TightTokens {
  return {
    letterWords: extractTightLetterWords(text),
    numberPairs: extractTightNumberPairs(text),
  };
}

/** Tem o mínimo para tentar resolver: pelo menos um NNN/NNN colado. */
export function hasUsableTightTokens(text: string): boolean {
  return extractTightNumberPairs(text).length > 0;
}
