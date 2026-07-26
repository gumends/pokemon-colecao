import { NextResponse } from "next/server";

import { getAbbrMap, warmAbbreviationMap } from "@/lib/set-abbreviations";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Lista abreviações oficiais conhecidas (para filtrar lixo do OCR). */
export async function GET() {
  try {
    await warmAbbreviationMap(80);
    const map = getAbbrMap();
    const abbreviations = [...map.keys()].sort();
    const sets: Record<string, { setId: string; setName: string }> = {};
    for (const [abbr, info] of map) {
      sets[abbr] = { setId: info.setId, setName: info.setName };
    }
    return NextResponse.json({ abbreviations, sets, count: abbreviations.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Não foi possível carregar abreviações." },
      { status: 500 },
    );
  }
}
