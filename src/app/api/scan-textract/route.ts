import { NextResponse } from "next/server";

import { smartResolveFromOcrText } from "@/lib/smart-card-lookup";
import {
  extractTextWithTextract,
  hasTextractCredentials,
} from "@/lib/textract-ocr";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  imageBase64?: string;
};

/**
 * OCR com Amazon Textract + resolve da carta.
 * 1) Preferência: AWS_* no ambiente do Next
 * 2) Fallback: API .NET /api/ocr/textract (mesmas credenciais do Dynamo)
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const imageBase64 = body.imageBase64?.trim() ?? "";
    if (!imageBase64) {
      return NextResponse.json(
        { ok: false, reason: "empty-image", error: "Envie imageBase64." },
        { status: 400 },
      );
    }

    let ocrText = "";
    let engine = "textract";

    if (hasTextractCredentials()) {
      const text = await extractTextWithTextract(imageBase64);
      ocrText = text ?? "";
      engine = "textract-next";
    } else {
      const apiBase =
        process.env.API_INTERNAL_URL?.trim() ||
        process.env.NEXT_PUBLIC_API_URL?.trim() ||
        "http://127.0.0.1:5080";

      const auth = request.headers.get("authorization");
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/ocr/textract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: auth } : {}),
        },
        body: JSON.stringify({ imageBase64 }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        text?: string;
        error?: string;
        detail?: string;
        code?: string;
      };

      if (!response.ok) {
        return NextResponse.json(
          {
            ok: false,
            reason: "textract-failed",
            error: data.error ?? "Falha no Textract.",
            detail: data.detail ?? data.code,
            engine: "textract-api",
          },
          { status: response.status === 401 ? 401 : 502 },
        );
      }

      ocrText = data.text?.trim() ?? "";
      engine = "textract-api";
    }

    if (!ocrText) {
      return NextResponse.json({
        ok: false,
        reason: "empty-ocr",
        ocrText: "",
        engine,
      });
    }

    const match = await smartResolveFromOcrText(ocrText);
    if (match) {
      return NextResponse.json({
        ok: true,
        ...match,
        ocrText,
        engine,
      });
    }

    return NextResponse.json({
      ok: false,
      reason: "no-match",
      ocrText,
      engine,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        ok: false,
        reason: "error",
        error:
          error instanceof Error
            ? error.message
            : "Falha ao escanear com Textract.",
      },
      { status: 500 },
    );
  }
}
