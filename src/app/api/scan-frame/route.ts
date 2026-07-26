import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";

import { smartResolveFromOcrText } from "@/lib/smart-card-lookup";

export const runtime = "nodejs";
export const maxDuration = 60;

declare global {
  // eslint-disable-next-line no-var
  var __ocrFullWorkerPromise: Promise<Worker> | undefined;
  // eslint-disable-next-line no-var
  var __ocrCodeWorkerPromise: Promise<Worker> | undefined;
}

function tesseractPaths() {
  const root = process.cwd();
  return {
    workerPath: path.join(
      root,
      "node_modules/tesseract.js/src/worker-script/node/index.js",
    ),
    corePath: path.join(
      root,
      "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    ),
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    cachePath: path.join(root, ".tesscache"),
  };
}

async function createFixedWorker() {
  const paths = tesseractPaths();
  return createWorker("eng", 1, {
    workerPath: paths.workerPath,
    corePath: paths.corePath,
    langPath: paths.langPath,
    cachePath: paths.cachePath,
  });
}

async function getFullWorker() {
  if (!globalThis.__ocrFullWorkerPromise) {
    globalThis.__ocrFullWorkerPromise = createFixedWorker();
  }
  return globalThis.__ocrFullWorkerPromise;
}

async function getCodeWorker() {
  if (!globalThis.__ocrCodeWorkerPromise) {
    globalThis.__ocrCodeWorkerPromise = createFixedWorker();
  }
  return globalThis.__ocrCodeWorkerPromise;
}

function cleanOcrText(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function prepareFullCard(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .resize({ width: 1400, withoutEnlargement: false })
    .normalize()
    .sharpen({ sigma: 1 })
    .png()
    .toBuffer();
}

/** OCR da carta inteira — sem whitelist. */
async function ocrFullCard(buffer: Buffer): Promise<string> {
  const worker = await getFullWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
  });
  const {
    data: { text },
  } = await worker.recognize(buffer);
  return cleanOcrText(text ?? "");
}

async function ocrCodeRegion(buffer: Buffer): Promise<string> {
  const worker = await getCodeWorker();
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/",
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  });
  const {
    data: { text },
  } = await worker.recognize(buffer);
  return cleanOcrText(text ?? "");
}

async function buildCodeVariants(input: Buffer): Promise<Buffer[]> {
  const meta = await sharp(input, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 10 || height < 10) return [];

  const bands = [
    { left: 0.1, top: 0.82, width: 0.5, height: 0.1 },
    { left: 0.05, top: 0.7, width: 0.6, height: 0.22 },
  ];

  const out: Buffer[] = [];
  for (const band of bands) {
    const region = {
      left: Math.floor(width * band.left),
      top: Math.floor(height * band.top),
      width: Math.floor(width * band.width),
      height: Math.floor(height * band.height),
    };

    out.push(
      await sharp(input, { failOn: "none" })
        .extract(region)
        .resize({ width: 1200, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.2 })
        .png()
        .toBuffer(),
    );
    out.push(
      await sharp(input, { failOn: "none" })
        .extract(region)
        .resize({ width: 1200, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .threshold(160)
        .png()
        .toBuffer(),
    );
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      imageBase64?: string;
      textOnly?: boolean;
    };
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

    const fullPrepared = await prepareFullCard(input);
    const ocrText = await ocrFullCard(fullPrepared);

    if (body.textOnly) {
      return NextResponse.json({
        ok: Boolean(ocrText),
        reason: ocrText ? "text-only" : "empty-ocr",
        ocrText,
      });
    }

    if (!ocrText) {
      return NextResponse.json({
        ok: false,
        reason: "empty-ocr",
        ocrText: "",
      });
    }

    let match: Awaited<ReturnType<typeof smartResolveFromOcrText>> = null;
    // Sempre tenta resolver (por nome e/ou código)
    match = await smartResolveFromOcrText(ocrText);

    if (!match) {
      const variants = await buildCodeVariants(input);
      const bag = [ocrText];
      for (const variant of variants) {
        try {
          const text = await ocrCodeRegion(variant);
          if (!text) continue;
          bag.push(text);
          const joined = bag.join("\n");
          match = await smartResolveFromOcrText(joined);
          if (match) break;
        } catch {
          // ignora
        }
      }
    }

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
          error instanceof Error
            ? error.message
            : "Falha ao analisar o frame.",
        ocrText: "",
      },
      { status: 500 },
    );
  }
}
