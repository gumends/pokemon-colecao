import { NextResponse } from "next/server";

import { smartResolveFromOcrText } from "@/lib/smart-card-lookup";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Recebe texto OCR do cliente e resolve a carta (sem Tesseract no servidor). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ocrText?: string };
    const ocrText = body.ocrText?.trim() ?? "";
    if (!ocrText) {
      return NextResponse.json(
        { ok: false, reason: "empty-ocr", ocrText: "" },
        { status: 400 },
      );
    }

    const match = await smartResolveFromOcrText(ocrText);
    if (match) {
      return NextResponse.json({
        ok: true,
        ...match,
        ocrText,
      });
    }

    return NextResponse.json({
      ok: false,
      reason: "no-match",
      ocrText,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao resolver OCR.",
        ocrText: "",
      },
      { status: 500 },
    );
  }
}
