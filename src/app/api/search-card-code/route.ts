import { NextResponse } from "next/server";

import { parseCardCodeQuery } from "@/lib/card-query";
import {
  expandCardToVariantEntries,
  getCard,
  listSets,
  searchCardsByLocalId,
} from "@/lib/tcgdex";

export const runtime = "nodejs";
export const maxDuration = 30;

export type OtherSetCardHit = {
  setId: string;
  setName: string;
  officialCount: number;
  cards: ReturnType<typeof expandCardToVariantEntries>;
};

function setIdFromCardId(tcgdexId: string): string {
  const idx = tcgdexId.lastIndexOf("-");
  return idx > 0 ? tcgdexId.slice(0, idx) : tcgdexId;
}

/** Busca 083 ou 083/086 em outras coleções (exclui a atual). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const excludeSet = (searchParams.get("excludeSet") ?? "").trim();

    const parsed = parseCardCodeQuery(q);
    if (!parsed) {
      return NextResponse.json({
        ok: true,
        results: [] as OtherSetCardHit[],
        reason: "not-a-code",
      });
    }

    const briefs = await searchCardsByLocalId(parsed.number, { perPage: 50 });
    const sets = await listSets();
    const setById = new Map(sets.map((s) => [s.id, s]));

    const results: OtherSetCardHit[] = [];
    const seenSets = new Set<string>();

    for (const brief of briefs) {
      const setId = setIdFromCardId(brief.id);
      if (!setId || setId === excludeSet) continue;
      if (seenSets.has(setId)) continue;

      const set = setById.get(setId);
      if (!set) continue;

      if (parsed.total) {
        if (set.cardCount.official !== Number(parsed.total)) continue;
      }

      try {
        const detail = await getCard(brief.id);
        const cards = expandCardToVariantEntries(
          detail,
          set.cardCount.official,
        );
        if (cards.length === 0) continue;
        seenSets.add(setId);
        results.push({
          setId,
          setName: set.name,
          officialCount: set.cardCount.official,
          cards,
        });
      } catch {
        // carta sem detalhe
      }

      if (results.length >= 12) break;
    }

    return NextResponse.json({
      ok: true,
      query: parsed,
      results,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Falha ao buscar em outras coleções." },
      { status: 500 },
    );
  }
}
