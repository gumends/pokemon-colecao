"use client";

import { Camera, ImagePlus, Loader2, ScanLine, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createWorker, PSM, type Worker } from "tesseract.js";

import { CardGrid } from "@/components/card-grid";
import { Button } from "@/components/ui/button";
import { parseCardCodeFromOcrAttempts } from "@/lib/card-code-parse";
import { cardImageUrl } from "@/lib/tcgdex";
import type { CardBrief, CollectionStatus } from "@/lib/types";

type LookupResult = {
  abbreviation: string;
  number: string;
  setId: string;
  setName: string;
  tcgdexId: string;
  cards: CardBrief[];
};

type CardScannerProps = {
  getStatus: (cardId: string) => CollectionStatus | null;
  onStatusChange: (card: CardBrief, status: CollectionStatus | null) => void;
};

type Band = { top: number; height: number; left: number; width: number; scale: number };

function enhanceAndCrop(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  band: Band,
): HTMLCanvasElement {
  const sx = Math.floor(srcW * band.left);
  const sy = Math.floor(srcH * band.top);
  const sw = Math.floor(srcW * band.width);
  const sh = Math.floor(srcH * band.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw * band.scale);
  canvas.height = Math.max(1, sh * band.scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // limiar suave: texto claro em fundo escuro (canto das cartas)
    const boosted = gray > 140 ? 255 : gray < 90 ? 0 : Math.round(gray);
    const contrast = Math.min(255, Math.max(0, (boosted - 100) * 1.8 + 110));
    d[i] = d[i + 1] = d[i + 2] = contrast;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Falha ao preparar imagem");
  return blob;
}

/** Várias faixas verticais: carta longe ou perto. */
async function prepareLiveOcrImages(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob[]> {
  const bands: Band[] = [
    { left: 0.03, top: 0.78, width: 0.55, height: 0.16, scale: 4 },
    { left: 0.05, top: 0.68, width: 0.55, height: 0.18, scale: 3 },
    { left: 0.04, top: 0.58, width: 0.5, height: 0.2, scale: 3 },
  ];
  const blobs: Blob[] = [];
  for (const band of bands) {
    blobs.push(await canvasToBlob(enhanceAndCrop(source, width, height, band)));
  }
  return blobs;
}

async function prepareUploadOcrImages(file: Blob): Promise<Blob[]> {
  const bitmap = await createImageBitmap(file);
  const blobs = await prepareLiveOcrImages(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return blobs;
}

export function CardScanner({ getStatus, onStatusChange }: CardScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastConfirmedRef = useRef<string | null>(null);
  const streakRef = useRef<{ key: string; count: number } | null>(null);
  const frameBusyRef = useRef(false);
  const knownAbbrRef = useRef<Set<string>>(new Set());

  const [cameraOpen, setCameraOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [abbr, setAbbr] = useState("");
  const [number, setNumber] = useState("");
  const [phase, setPhase] = useState<"idle" | "reading" | "looking" | "done">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [abbrReady, setAbbrReady] = useState(false);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setLiveStatus(null);
    frameBusyRef.current = false;
    streakRef.current = null;
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Carrega abreviações reais (CRI, SVI, …) para ignorar letras aleatórias
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/set-abbreviations")
      .then(async (response) => {
        if (!response.ok) throw new Error("abbr");
        const data = (await response.json()) as { abbreviations?: string[] };
        if (cancelled) return;
        knownAbbrRef.current = new Set(
          (data.abbreviations ?? []).map((a) => a.toUpperCase()),
        );
        setAbbrReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAbbrReady(false);
          setError(
            "Não carreguei a lista de coleções. A busca manual ainda funciona.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      setError("Não foi possível iniciar a prévia da câmera.");
    });
  }, [cameraOpen]);

  async function getWorker() {
    if (workerRef.current) return workerRef.current;
    const worker = await createWorker("eng");
    workerRef.current = worker;
    return worker;
  }

  async function runLookup(nextAbbr: string, nextNumber: string) {
    setPhase("looking");
    setError(null);

    const params = new URLSearchParams({
      abbr: nextAbbr.trim().toUpperCase(),
      number: nextNumber.trim(),
    });
    const response = await fetch(`/api/lookup-card?${params.toString()}`);
    const data = (await response.json()) as LookupResult & { error?: string };
    if (!response.ok) {
      throw new Error(data.error ?? "Carta não encontrada.");
    }
    setResult(data);
    setAbbr(data.abbreviation);
    setNumber(data.number);
    setPhase("done");
    setLiveStatus(`Encontrei: ${data.cards[0]?.name ?? data.tcgdexId}`);
    return data;
  }

  async function recognizeBlobs(blobs: Blob[]) {
    const worker = await getWorker();
    const texts: string[] = [];
    for (const blob of blobs) {
      for (const psm of [PSM.SPARSE_TEXT, PSM.SINGLE_LINE]) {
        await worker.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ ",
          tessedit_pageseg_mode: psm,
        });
        const { data } = await worker.recognize(blob);
        if (data.text?.trim()) texts.push(data.text);
      }
    }
    return texts;
  }

  useEffect(() => {
    if (!cameraOpen) return;

    let cancelled = false;
    lastConfirmedRef.current = null;
    streakRef.current = null;

    async function scanFrame() {
      if (cancelled || frameBusyRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      frameBusyRef.current = true;
      if (!lastConfirmedRef.current) {
        setLiveStatus(
          abbrReady
            ? "Aproxime o código no guia amarelo…"
            : "Carregando coleções…",
        );
      }

      try {
        if (knownAbbrRef.current.size === 0) return;

        const blobs = await prepareLiveOcrImages(
          video,
          video.videoWidth,
          video.videoHeight,
        );
        const texts = await recognizeBlobs(blobs);
        if (cancelled) return;

        setOcrText(texts.join("\n---\n"));
        const parsed = parseCardCodeFromOcrAttempts(texts, knownAbbrRef.current);
        if (!parsed) {
          streakRef.current = null;
          if (!lastConfirmedRef.current) {
            setLiveStatus("Ainda sem código válido — aproxime CRI 112/086…");
          }
          return;
        }

        const codeKey = `${parsed.abbreviation}-${parsed.number}`;
        setAbbr(parsed.abbreviation);
        setNumber(parsed.number);

        const streak = streakRef.current;
        if (streak?.key === codeKey) streak.count += 1;
        else streakRef.current = { key: codeKey, count: 1 };

        const count = streakRef.current?.count ?? 1;
        setLiveStatus(
          `Possível ${parsed.abbreviation} ${parsed.number} (${count}/3)…`,
        );

        // Exige 3 leituras iguais seguidas para não aceitar lixo
        if (count < 3) return;
        if (lastConfirmedRef.current === codeKey) {
          setLiveStatus(`Código estável: ${parsed.abbreviation} ${parsed.number}`);
          return;
        }

        setLiveStatus(`Confirmado ${parsed.abbreviation} ${parsed.number} — buscando…`);
        const data = await runLookup(parsed.abbreviation, parsed.number);
        if (cancelled) return;
        lastConfirmedRef.current = codeKey;
        setLiveStatus(`Encontrei: ${data.cards[0]?.name ?? data.tcgdexId}`);
      } catch (err) {
        if (cancelled) return;
        streakRef.current = null;
        if (err instanceof Error) setLiveStatus(err.message);
      } finally {
        frameBusyRef.current = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void scanFrame();
    }, 1400);
    void scanFrame();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [cameraOpen, abbrReady]);

  async function openCamera() {
    setError(null);
    setResult(null);
    lastConfirmedRef.current = null;
    streakRef.current = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não permite acessar a webcam.");
      return;
    }

    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setLiveStatus("Aproxime o código no guia amarelo…");
      setPhase("idle");
    } catch {
      setError(
        "Não consegui abrir a webcam. Permita o acesso à câmera no navegador e tente de novo.",
      );
      setCameraOpen(false);
    }
  }

  async function processFile(file: File) {
    stopCamera();
    setError(null);
    setResult(null);
    setOcrText("");
    setAbbr("");
    setNumber("");
    setPhase("reading");
    lastConfirmedRef.current = null;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      if (knownAbbrRef.current.size === 0) {
        const response = await fetch("/api/set-abbreviations");
        if (response.ok) {
          const data = (await response.json()) as { abbreviations?: string[] };
          knownAbbrRef.current = new Set(
            (data.abbreviations ?? []).map((a) => a.toUpperCase()),
          );
        }
      }

      const crops = await prepareUploadOcrImages(file);
      const texts = await recognizeBlobs(crops);
      setOcrText(texts.join("\n---\n"));
      const parsed = parseCardCodeFromOcrAttempts(
        texts,
        knownAbbrRef.current.size > 0 ? knownAbbrRef.current : undefined,
      );
      if (!parsed) {
        setPhase("idle");
        setError(
          "Não li um código válido. Aproxime o canto (ex.: CRI PT 112/086) ou digite manualmente.",
        );
        return;
      }
      setAbbr(parsed.abbreviation);
      setNumber(parsed.number);
      await runLookup(parsed.abbreviation, parsed.number);
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Falha ao ler a imagem.");
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void processFile(file);
  }

  const busy = phase === "reading" || phase === "looking";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card/80 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-muted p-2">
            <ScanLine className="size-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-semibold">Escanear carta</h2>
            <p className="text-sm text-muted-foreground">
              Encha o guia amarelo com o código (bem de perto). Só aceitamos
              abreviações reais de coleção — ignora letras aleatórias.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void openCamera()}
            disabled={busy && !cameraOpen}
          >
            <Camera className="size-4" />
            {cameraOpen ? "Reiniciar câmera" : "Usar câmera"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            <ImagePlus className="size-4" />
            Enviar foto
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        {cameraOpen ? (
          <div className="mt-4 space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-border bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-80 w-full object-contain"
              />
              <div className="pointer-events-none absolute inset-x-[8%] bottom-[6%] h-[20%] rounded-md border-2 border-dashed border-yellow-300/90 bg-yellow-300/10" />
              <p className="pointer-events-none absolute bottom-[8%] left-[10%] text-xs font-medium text-yellow-100 drop-shadow">
                Código aqui · precisa confirmar 3×
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {liveStatus ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  {!liveStatus.startsWith("Encontrei") ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {liveStatus}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="ml-auto"
                onClick={stopCamera}
              >
                <X className="size-4" />
                Fechar câmera
              </Button>
            </div>
          </div>
        ) : null}

        {!cameraOpen && busy ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {phase === "reading"
              ? "Lendo o código na imagem…"
              : "Buscando a carta na coleção…"}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {previewUrl && !cameraOpen ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Prévia da foto"
              className="max-h-56 w-full object-contain"
            />
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Abreviação</span>
            <input
              value={abbr}
              onChange={(e) => setAbbr(e.target.value.toUpperCase())}
              placeholder="CRI"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Número</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="112"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!abbr.trim() || !number.trim() || phase === "looking"}
              onClick={() => {
                void runLookup(abbr, number).catch((err: unknown) => {
                  setPhase("idle");
                  setError(
                    err instanceof Error ? err.message : "Falha na busca.",
                  );
                });
              }}
            >
              Buscar
            </Button>
          </div>
        </div>

        {ocrText ? (
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Texto bruto do OCR (debug)</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-2 font-mono">
              {ocrText}
            </pre>
          </details>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">
              {result.cards[0]?.name ?? result.tcgdexId}
            </span>
            <span className="text-muted-foreground">
              {result.setName} · {result.abbreviation} {result.number}
            </span>
            {result.cards[0]?.image ? (
              <Image
                src={cardImageUrl(result.cards[0].image, "low") ?? ""}
                alt=""
                width={40}
                height={56}
                className="ml-auto rounded object-contain"
                unoptimized
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Marque a variante. Com a câmera aberta, mostre outra carta para a
            próxima.
          </p>
          <CardGrid
            cards={result.cards}
            getStatus={getStatus}
            onStatusChange={onStatusChange}
            emptyMessage="Nenhuma variante encontrada."
          />
        </div>
      ) : null}
    </div>
  );
}
