import { NextResponse } from "next/server";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";

import { smartResolveFromOcrText } from "@/lib/smart-card-lookup";
import { hasUsableTightTokens } from "@/lib/tight-ocr-tokens";

export const runtime = "nodejs";
export const maxDuration = 60;

declare global {
  // eslint-disable-next-line no-var
  var __ocrWorkerPromise: Promise<Worker> | undefined;
}

async function getOcrWorker() {
  if (!globalThis.__ocrWorkerPromise) {
    globalThis.__ocrWorkerPromise = createWorker("eng");
  }
  return globalThis.__ocrWorkerPromise;
}

async function ocrBuffer(buffer: Buffer): Promise<string> {
  const worker = await getOcrWorker();
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ ",
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  });
  const {
    data: { text },
  } = await worker.recognize(buffer);
  return text ?? "";
}

/** Gera várias versões processadas da região do código. */
async function buildOcrVariants(input: Buffer): Promise<Buffer[]> {
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 10 || height < 10) return [input];

  // Cliente já manda faixa inferior → processa a imagem inteira.
  // Foto completa → corta faixas de baixo/meio-baixo.
  const alreadyCropped = height / width < 0.85;
  const bands = alreadyCropped
    ? [{ left: 0, top: 0, width: 1, height: 1 }]
    : [
        { left: 0.03, top: 0.7, width: 0.65, height: 0.26 },
        { left: 0.05, top: 0.55, width: 0.55, height: 0.28 },
      ];

  const out: Buffer[] = [];
  for (const band of bands) {
    const left = Math.floor(width * band.left);
    const top = Math.floor(height * band.top);
    const w = Math.floor(width * band.width);
    const h = Math.floor(height * band.height);
    const region = {
      left: Math.max(0, left),
      top: Math.max(0, top),
      width: Math.max(1, Math.min(w, width - left)),
      height: Math.max(1, Math.min(h, height - top)),
    };

    out.push(
      await sharp(input, { failOn: "none" })
        .extract(region)
        .resize({ width: 800, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer(),
    );
    out.push(
      await sharp(input, { failOn: "none" })
        .extract(region)
        .resize({ width: 800, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .threshold(145)
        .png()
        .toBuffer(),
    );
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { imageBase64?: string };
    const raw = body.imageBase64?.trim();
    if (!raw) {
      return NextResponse.json(
        { error: "Envie imageBase64." },
        { status: 400 },
      );
    }

    const base64 = raw.replace(/^data:image\/\w+;base64,/, "");
    const input = Buffer.from(base64, "base64");
    if (input.length < 100) {
      return NextResponse.json({ error: "Imagem inválida." }, { status: 400 });
    }

    const variants = await buildOcrVariants(input);
    const texts: string[] = [];

    // Early-exit: tenta resolver assim que o OCR tiver um padrão útil
    for (const variant of variants) {
      try {
        const text = await ocrBuffer(variant);
        if (!text.trim()) continue;
        texts.push(text);
        // Só tenta resolver quando já há NNN/NNN colado (sem espaço)
        const joined = texts.join("\n");
        if (!hasUsableTightTokens(joined)) continue;
        const partial = await smartResolveFromOcrText(joined);
        if (partial) {
          return NextResponse.json({
            ok: true,
            ...partial,
            ocrText: joined,
          });
        }
      } catch {
        // ignora variante
      }
    }

    const ocrText = texts.join("\n");
    if (!ocrText.trim()) {
      return NextResponse.json({
        ok: false,
        reason: "empty-ocr",
        ocrText: "",
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
      { error: "Falha ao analisar o frame." },
      { status: 500 },
    );
  }
}
