"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";

import { hasUsableTightTokens } from "@/lib/tight-ocr-tokens";

declare global {
  // eslint-disable-next-line no-var
  var __clientOcrWorker: Promise<Worker> | undefined;
}

const OPEN_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç /.,;:()'-";
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/";

type FilterSpec = {
  name: string;
  /** Multiplica luminosidade (1 = normal, >1 clareia). */
  brightness: number;
  /** Contraste em torno de 128 (1 = normal). */
  contrast: number;
  grayscale?: boolean;
  /** Se definido, binariza após gray (0–255). */
  threshold?: number;
  /** Escala da imagem (1 = original). */
  scale?: number;
  /** Só faixa inferior (código). */
  bottomStrip?: boolean;
  codeWhitelist?: boolean;
};

const FILTERS: FilterSpec[] = [
  { name: "clarear", brightness: 1.35, contrast: 1.2, scale: 1.2 },
  { name: "clarear+", brightness: 1.55, contrast: 1.35, scale: 1.25 },
  {
    name: "cinza-claro",
    brightness: 1.4,
    contrast: 1.3,
    grayscale: true,
    scale: 1.3,
  },
  {
    name: "limiar-claro",
    brightness: 1.45,
    contrast: 1.4,
    grayscale: true,
    threshold: 150,
    scale: 1.4,
  },
  {
    name: "limiar-forte",
    brightness: 1.6,
    contrast: 1.5,
    grayscale: true,
    threshold: 135,
    scale: 1.4,
  },
  {
    name: "rodapé-código",
    brightness: 1.5,
    contrast: 1.4,
    grayscale: true,
    threshold: 145,
    scale: 1.6,
    bottomStrip: true,
    codeWhitelist: true,
  },
  {
    name: "rodapé-claro",
    brightness: 1.7,
    contrast: 1.5,
    grayscale: true,
    scale: 1.6,
    bottomStrip: true,
    codeWhitelist: true,
  },
];

async function getWorker() {
  if (!globalThis.__clientOcrWorker) {
    globalThis.__clientOcrWorker = (async () => {
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_char_whitelist: OPEN_CHARS,
        tessedit_pageseg_mode: PSM.AUTO,
      });
      return worker;
    })();
  }
  return globalThis.__clientOcrWorker;
}

function cleanOcrText(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem p/ OCR"));
    img.src = src;
  });
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Aplica clarear / contraste / limiar na carta (ajuda foto escura). */
export async function preprocessForOcr(
  imageDataUrl: string,
  filter: FilterSpec,
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const scale = filter.scale ?? 1;
  const srcH = filter.bottomStrip
    ? Math.max(48, Math.floor(img.height * 0.3))
    : img.height;
  const srcY = filter.bottomStrip ? img.height - srcH : 0;
  const width = Math.max(320, Math.floor(img.width * scale));
  const height = Math.max(80, Math.floor(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return imageDataUrl;

  ctx.drawImage(img, 0, srcY, img.width, srcH, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const b = filter.brightness;
  const c = filter.contrast;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let bl = data[i + 2];

    // clarear
    r *= b;
    g *= b;
    bl *= b;

    // contraste
    r = (r - 128) * c + 128;
    g = (g - 128) * c + 128;
    bl = (bl - 128) * c + 128;

    if (filter.grayscale || filter.threshold != null) {
      let y = 0.299 * r + 0.587 * g + 0.114 * bl;
      if (filter.threshold != null) {
        y = y >= filter.threshold ? 255 : 0;
      }
      r = g = bl = y;
    }

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(bl);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function recognizeVariant(
  dataUrl: string,
  codeWhitelist: boolean,
): Promise<string> {
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_char_whitelist: codeWhitelist ? CODE_CHARS : OPEN_CHARS,
    tessedit_pageseg_mode: codeWhitelist ? PSM.SPARSE_TEXT : PSM.AUTO,
  });
  const {
    data: { text },
  } = await worker.recognize(dataUrl);
  return cleanOcrText(text ?? "");
}

function looksPromising(text: string): boolean {
  if (!text || text.length < 6) return false;
  if (hasUsableTightTokens(text)) return true;
  // título provável: 2+ palavras com letras
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  return lines.some((l) => {
    const words = l.split(/\s+/).filter((w) => /[A-Za-zÀ-ü]{3,}/.test(w));
    return words.length >= 2 && l.length >= 10;
  });
}

export type OcrProgress = (message: string) => void;

/**
 * Lê a carta com vários filtros (clarear → limiar).
 * Se uma tentativa já tiver código/nome útil, para cedo.
 * Se falhar, tenta o próximo filtro.
 */
export async function ocrCardWithRetries(
  imageDataUrl: string,
  onProgress?: OcrProgress,
): Promise<string> {
  const collected: string[] = [];

  for (let i = 0; i < FILTERS.length; i += 1) {
    const filter = FILTERS[i];
    onProgress?.(
      `Tentativa ${i + 1}/${FILTERS.length}: ${filter.name}…`,
    );
    try {
      const prepared = await preprocessForOcr(imageDataUrl, filter);
      const text = await recognizeVariant(
        prepared,
        Boolean(filter.codeWhitelist),
      );
      if (text) {
        collected.push(text);
        const joined = collected.join("\n");
        if (hasUsableTightTokens(joined)) {
          onProgress?.("Código lido — resolvendo carta…");
          return joined;
        }
        if (looksPromising(joined) && i >= 2) {
          // já tem título razoável após alguns filtros
          onProgress?.("Texto útil encontrado — resolvendo…");
          // ainda tenta 1 filtro de rodapé se ainda não rodou
          const hasStrip = FILTERS.slice(0, i + 1).some((f) => f.bottomStrip);
          if (hasStrip) return joined;
        }
      }
    } catch {
      // tenta próximo filtro
    }
  }

  return collected.join("\n");
}

/** @deprecated use ocrCardWithRetries */
export async function ocrImageInBrowser(imageDataUrl: string): Promise<string> {
  return ocrCardWithRetries(imageDataUrl);
}

/** @deprecated use ocrCardWithRetries */
export async function ocrCodeStripInBrowser(
  imageDataUrl: string,
): Promise<string> {
  const prepared = await preprocessForOcr(imageDataUrl, {
    name: "rodapé",
    brightness: 1.5,
    contrast: 1.4,
    grayscale: true,
    threshold: 145,
    scale: 1.6,
    bottomStrip: true,
    codeWhitelist: true,
  });
  return recognizeVariant(prepared, true);
}
