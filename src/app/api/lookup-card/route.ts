import { NextResponse } from "next/server";

import {
  expandCardToVariantEntries,
  getCard,
  listSets,
} from "@/lib/tcgdex";

export const runtime = "nodejs";
export const maxDuration = 60;

type SetAbbrInfo = {
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

function abbrMap() {
  if (!globalThis.__setAbbrMap) globalThis.__setAbbrMap = new Map();
  return globalThis.__setAbbrMap;
}

function scannedIds() {
  if (!globalThis.__setAbbrScanned) {
    globalThis.__setAbbrScanned = new Set();
  }
  return globalThis.__setAbbrScanned;
}

async function resolveSetByAbbreviation(
  abbreviation: string,
): Promise<SetAbbrInfo | null> {
  const map = abbrMap();
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
      // segue para o próximo set
    }
  }

  return map.get(abbreviation) ?? null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const abbreviation = (searchParams.get("abbr") ?? "").trim().toUpperCase();
    const numberRaw = (searchParams.get("number") ?? "").trim();

    if (!abbreviation || !numberRaw) {
      return NextResponse.json(
        { error: "Informe abbr e number (ex.: CRI e 083)." },
        { status: 400 },
      );
    }

    const number = numberRaw.replace(/\D/g, "").padStart(3, "0");
    const setInfo = await resolveSetByAbbreviation(abbreviation);

    if (!setInfo) {
      return NextResponse.json(
        {
          error: `Abreviação “${abbreviation}” não encontrada. Funciona melhor em coleções modernas (código de 3 letras, ex.: CRI).`,
          abbreviation,
          number,
        },
        { status: 404 },
      );
    }

    const tcgdexId = `${setInfo.setId}-${number}`;
    const detail = await getCard(tcgdexId);
    const cards = expandCardToVariantEntries(detail, setInfo.officialCount);

    return NextResponse.json({
      abbreviation,
      number,
      setId: setInfo.setId,
      setName: setInfo.setName,
      tcgdexId,
      cards,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Não foi possível identificar a carta." },
      { status: 500 },
    );
  }
}
