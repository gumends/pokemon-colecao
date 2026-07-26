import { listSets } from "@/lib/tcgdex";

export type SetAbbrInfo = {
  setId: string;
  setName: string;
  officialCount: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __setAbbrMap: Map<string, SetAbbrInfo> | undefined;
  // eslint-disable-next-line no-var
  var __setAbbrScanned: Set<string> | undefined;
}

const TCGDEX_EN = "https://api.tcgdex.net/v2/en";

export function getAbbrMap() {
  if (!globalThis.__setAbbrMap) globalThis.__setAbbrMap = new Map();
  return globalThis.__setAbbrMap;
}

function scannedIds() {
  if (!globalThis.__setAbbrScanned) {
    globalThis.__setAbbrScanned = new Set();
  }
  return globalThis.__setAbbrScanned;
}

/** Varre sets (recentes primeiro) até achar a abreviação ou esgotar. */
export async function resolveSetByAbbreviation(
  abbreviation: string,
): Promise<SetAbbrInfo | null> {
  const map = getAbbrMap();
  const cached = map.get(abbreviation);
  if (cached) return cached;

  const sets = await listSets();
  const scanned = scannedIds();

  for (const set of sets) {
    if (scanned.has(set.id)) continue;
    scanned.add(set.id);

    try {
      const response = await fetch(
        `${TCGDEX_EN}/sets/${encodeURIComponent(set.id)}`,
        { next: { revalidate: 86400 } },
      );
      if (!response.ok) continue;
      const data = (await response.json()) as {
        id: string;
        name: string;
        abbreviation?: { official?: string };
        cardCount?: { official?: number };
      };
      const abbr = data.abbreviation?.official?.toUpperCase();
      if (!abbr) continue;

      const info: SetAbbrInfo = {
        setId: data.id,
        setName: data.name,
        officialCount: data.cardCount?.official ?? set.cardCount.official,
      };
      if (!map.has(abbr)) map.set(abbr, info);
      if (abbr === abbreviation) return info;
    } catch {
      // continua
    }
  }

  return map.get(abbreviation) ?? null;
}

/** Pré-aquece abreviações dos N sets mais recentes (para validar OCR). */
export async function warmAbbreviationMap(limit = 60): Promise<string[]> {
  const sets = await listSets();
  const scanned = scannedIds();
  const map = getAbbrMap();
  let processed = 0;

  for (const set of sets) {
    if (processed >= limit) break;
    if (scanned.has(set.id)) {
      processed += 1;
      continue;
    }
    scanned.add(set.id);
    processed += 1;

    try {
      const response = await fetch(
        `${TCGDEX_EN}/sets/${encodeURIComponent(set.id)}`,
        { next: { revalidate: 86400 } },
      );
      if (!response.ok) continue;
      const data = (await response.json()) as {
        id: string;
        name: string;
        abbreviation?: { official?: string };
        cardCount?: { official?: number };
      };
      const abbr = data.abbreviation?.official?.toUpperCase();
      if (!abbr || map.has(abbr)) continue;
      map.set(abbr, {
        setId: data.id,
        setName: data.name,
        officialCount: data.cardCount?.official ?? set.cardCount.official,
      });
    } catch {
      // continua
    }
  }

  return [...map.keys()].sort();
}
