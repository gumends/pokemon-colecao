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

async function ingestSetDetail(setId: string, fallbackOfficial: number) {
  const map = getAbbrMap();
  const response = await fetch(`${TCGDEX_EN}/sets/${encodeURIComponent(setId)}`, {
    next: { revalidate: 86400 },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    id: string;
    name: string;
    abbreviation?: { official?: string };
    cardCount?: { official?: number };
  };
  const abbr = data.abbreviation?.official?.toUpperCase();
  if (!abbr) return null;
  const info: SetAbbrInfo = {
    setId: data.id,
    setName: data.name,
    officialCount: data.cardCount?.official ?? fallbackOfficial,
  };
  if (!map.has(abbr)) map.set(abbr, info);
  return { abbr, info };
}

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
      const row = await ingestSetDetail(set.id, set.cardCount.official);
      if (row?.abbr === abbreviation) return row.info;
    } catch {
      // continua
    }
  }

  return map.get(abbreviation) ?? null;
}

export async function warmAbbreviationMap(limit = 50): Promise<string[]> {
  const sets = await listSets();
  const scanned = scannedIds();
  let processed = 0;

  for (const set of sets) {
    if (processed >= limit) break;
    processed += 1;
    if (scanned.has(set.id)) continue;
    scanned.add(set.id);
    try {
      await ingestSetDetail(set.id, set.cardCount.official);
    } catch {
      // continua
    }
  }

  return [...getAbbrMap().keys()].sort();
}

/** Índice officialCount → sets (secret rare usa o total impresso, ex. 086). */
export function getSetsByOfficialCount(count: number): SetAbbrInfo[] {
  const out: SetAbbrInfo[] = [];
  const seen = new Set<string>();
  for (const info of getAbbrMap().values()) {
    if (info.officialCount !== count) continue;
    if (seen.has(info.setId)) continue;
    seen.add(info.setId);
    out.push(info);
  }
  return out;
}
