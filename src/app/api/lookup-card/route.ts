import { NextResponse } from "next/server";

import { resolveExact } from "@/lib/smart-card-lookup";

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

    const result = await resolveExact(abbreviation, numberRaw);
    if (!result) {
      return NextResponse.json(
        {
          error: `Não achei “${abbreviation} ${numberRaw}”.`,
          abbreviation,
          number: numberRaw.replace(/\D/g, "").padStart(3, "0"),
        },
        { status: 404 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Não foi possível identificar a carta." },
      { status: 500 },
    );
  }
}
