import { NextResponse } from "next/server";

import { getSetCardsWithVariants } from "@/lib/tcgdex";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ setId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { setId } = await context.params;
    const data = await getSetCardsWithVariants(setId);
    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Não foi possível carregar as cartas desta coleção." },
      { status: 500 },
    );
  }
}
