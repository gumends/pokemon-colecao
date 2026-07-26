import { NextResponse } from "next/server";

import {
  expandCardToVariantEntries,
  getCard,
} from "@/lib/tcgdex";
import { resolveSetByAbbreviation } from "@/lib/set-abbreviations";

export const runtime = "nodejs";
export const maxDuration = 60;

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
