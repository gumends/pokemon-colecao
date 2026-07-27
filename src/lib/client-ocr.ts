"use client";

import { createWorker, PSM, type Worker } from "tesseract.js";

declare global {
  // eslint-disable-next-line no-var
  var __clientOcrWorker: Promise<Worker> | undefined;
}

async function getWorker() {
  if (!globalThis.__clientOcrWorker) {
    globalThis.__clientOcrWorker = (async () => {
      const worker = await createWorker("eng");
      await worker.setParameters({
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

/** OCR no navegador (funciona na Vercel; o servidor só resolve a carta). */
export async function ocrImageInBrowser(imageDataUrl: string): Promise<string> {
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(imageDataUrl);
  return cleanOcrText(text ?? "");
}

/**
 * Segunda passagem: só faixa inferior (código CRI + NNN/NNN),
 * com whitelist mais restrita.
 */
export async function ocrCodeStripInBrowser(
  imageDataUrl: string,
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement("canvas");
  const stripH = Math.max(40, Math.floor(img.height * 0.28));
  canvas.width = img.width;
  canvas.height = stripH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(
    img,
    0,
    img.height - stripH,
    img.width,
    stripH,
    0,
    0,
    img.width,
    stripH,
  );
  const stripUrl = canvas.toDataURL("image/jpeg", 0.92);

  const worker = await getWorker();
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/",
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  });
  const {
    data: { text },
  } = await worker.recognize(stripUrl);
  await worker.setParameters({
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç /.,;:()'-",
    tessedit_pageseg_mode: PSM.AUTO,
  });
  return cleanOcrText(text ?? "");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem p/ OCR"));
    img.src = src;
  });
}
