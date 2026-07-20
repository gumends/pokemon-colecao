import { NextResponse } from "next/server";

import {
  deleteCardStatus,
  listCollection,
  upsertCardStatus,
} from "@/lib/db";
import type { CardBrief, CollectionStatus } from "@/lib/types";

export const runtime = "nodejs";

type UpsertBody = {
  card?: CardBrief;
  status?: CollectionStatus | null;
  cardId?: string;
};

export async function GET() {
  try {
    return NextResponse.json({ collection: listCollection() });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Não foi possível carregar a coleção." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as UpsertBody;
    const { card, status } = body;

    if (!card?.id || !card.localId || !card.name) {
      return NextResponse.json(
        { error: "Dados da carta incompletos." },
        { status: 400 },
      );
    }

    if (status !== "owned" && status !== "wanted") {
      return NextResponse.json(
        { error: "Status inválido. Use owned ou wanted." },
        { status: 400 },
      );
    }

    const entry = upsertCardStatus(card, status);
    return NextResponse.json({ entry });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Não foi possível salvar a carta." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cardId =
      searchParams.get("cardId") ??
      ((await request.json().catch(() => null)) as UpsertBody | null)?.cardId;

    if (!cardId) {
      return NextResponse.json(
        { error: "Informe o cardId da carta." },
        { status: 400 },
      );
    }

    deleteCardStatus(cardId);
    return NextResponse.json({ ok: true, cardId });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Não foi possível remover a carta." },
      { status: 500 },
    );
  }
}
