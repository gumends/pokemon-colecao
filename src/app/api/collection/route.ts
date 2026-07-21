import { NextResponse } from "next/server";

import {
  deleteCardStatus,
  listCollection,
  updateCardTypes,
  upsertCardStatus,
} from "@/lib/db";
import { getCard, mapPool } from "@/lib/tcgdex";
import type { CardBrief, CollectionStatus } from "@/lib/types";

export const runtime = "nodejs";

type UpsertBody = {
  card?: CardBrief;
  status?: CollectionStatus | null;
  cardId?: string;
};

/** Preenche os tipos das cartas salvas antes da coluna `types` existir. */
async function backfillMissingTypes(
  collection: ReturnType<typeof listCollection>,
) {
  const missing = Object.values(collection).filter(
    (entry) => entry.card.types === undefined,
  );
  if (missing.length === 0) return;

  const uniqueIds = [...new Set(missing.map((entry) => entry.card.tcgdexId))];
  const typesById = new Map<string, string[]>();

  await mapPool(uniqueIds, 8, async (tcgdexId) => {
    try {
      const detail = await getCard(tcgdexId);
      typesById.set(tcgdexId, detail.types ?? []);
    } catch {
      // Mantém sem tipos; tenta de novo no próximo GET.
    }
  });

  for (const entry of missing) {
    const types = typesById.get(entry.card.tcgdexId);
    if (!types) continue;
    updateCardTypes(entry.card.id, types);
    entry.card.types = types;
  }
}

export async function GET() {
  try {
    const collection = listCollection();
    await backfillMissingTypes(collection);
    return NextResponse.json({ collection });
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

    if (!card.variant) {
      return NextResponse.json(
        { error: "Informe a variante da carta (normal, reverse, holo…)." },
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
