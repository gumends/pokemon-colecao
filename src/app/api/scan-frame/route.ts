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
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/",
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  });
  const {
    data: { text },
  } = await worker.recognize(buffer);
  return text ?? "";
}

type Band = { left: number; top: number; width: number; height: number };

/** Gera várias versões processadas da região do código. */
async function buildOcrVariants(input: Buffer): Promise<Buffer[]> {
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 10 || height < 10) return [input];

  // Cliente já manda faixa inferior → processa a imagem inteira.
  // Foto completa → prioriza canto inferior esquerdo (código impresso).
  const alreadyCropped = height / width < 0.85;
  const bands: Band[] = alreadyCropped
    ? [
        { left: 0, top: 0, width: 1, height: 1 },
        { left: 0, top: 0.35, width: 0.75, height: 0.65 },
      ]
    : [
        // código impresso fica bem no rodapé esquerdo
        { left: 0.1, top: 0.82, width: 0.5, height: 0.1 },
        { left: 0.08, top: 0.78, width: 0.55, height: 0.14 },
        { left: 0.05, top: 0.68, width: 0.6, height: 0.22 },
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

    // contraste + nitidez
    out.push(
      await sharp(input, { failOn: "none" })
        .extract(region)
        .resize({ width: 1400, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .linear(1.35, -15)
        .sharpen({ sigma: 1.5 })
        .png()
        .toBuffer(),
    );

    // limiares — 160 leu bem 112/086 nesta carta holo
    for (const thr of [140, 160, 175]) {
      out.push(
        await sharp(input, { failOn: "none" })
          .extract(region)
          .resize({ width: 1400, withoutEnlargement: false })
          .grayscale()
          .normalize()
          .linear(1.4, -20)
          .threshold(thr)
          .png()
          .toBuffer(),
      );
    }
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
