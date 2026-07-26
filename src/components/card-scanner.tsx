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

/** Recorte rápido do canto inferior (modo ao vivo). */
async function prepareLiveOcrImage(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const left = Math.floor(width * 0.04);
  const top = Math.floor(height * 0.76);
  const sw = Math.floor(width * 0.62);
  const sh = Math.floor(height * 0.18);
  const scale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw * scale);
  canvas.height = Math.max(1, sh * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, left, top, sw, sh, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const boosted = Math.min(255, Math.max(0, (gray - 105) * 1.7 + 128));
    d[i] = d[i + 1] = d[i + 2] = boosted;
  }
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Falha ao preparar frame");
  return blob;
}

async function prepareUploadOcrImages(file: Blob): Promise<Blob[]> {
  const bitmap = await createImageBitmap(file);
  const specs = [
    { leftRatio: 0.02, topRatio: 0.74, widthRatio: 0.7, heightRatio: 0.2, scale: 3 },
    { leftRatio: 0.05, topRatio: 0.8, widthRatio: 0.55, heightRatio: 0.14, scale: 4 },
  ];
  const blobs: Blob[] = [];
  for (const spec of specs) {
    const sx = Math.floor(bitmap.width * spec.leftRatio);
    const sy = Math.floor(bitmap.height * spec.topRatio);
    const sw = Math.floor(bitmap.width * spec.widthRatio);
    const sh = Math.floor(bitmap.height * spec.heightRatio);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, sw * spec.scale);
    canvas.height = Math.max(1, sh * spec.scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const boosted = Math.min(255, Math.max(0, (gray - 110) * 1.6 + 128));
      d[i] = d[i + 1] = d[i + 2] = boosted;
    }
    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.95),
    );
    if (blob) blobs.push(blob);
  }
  bitmap.close();
  return blobs.length > 0 ? blobs : [file];
}

export function CardScanner({ getStatus, onStatusChange }: CardScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const frameBusyRef = useRef(false);

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

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setLiveStatus(null);
    frameBusyRef.current = false;
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void workerRef.current?.terminate();
      workerRef.current = null;
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

  async function recognizeBlobs(blobs: Blob[], thorough: boolean) {
    const worker = await getWorker();
    const texts: string[] = [];
    const modes = thorough
      ? [PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT, PSM.SINGLE_LINE]
      : [PSM.SPARSE_TEXT, PSM.SINGLE_LINE];

    for (const blob of blobs) {
      for (const psm of modes) {
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

  // Loop ao vivo: tenta achar o código sem precisar capturar.
  useEffect(() => {
    if (!cameraOpen) return;

    let cancelled = false;
    lastCodeRef.current = null;

    async function scanFrame() {
      if (cancelled || frameBusyRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      frameBusyRef.current = true;
      setLiveStatus((prev) =>
        prev?.startsWith("Encontrei") ? prev : "Procurando código…",
      );

      try {
        const blob = await prepareLiveOcrImage(
          video,
          video.videoWidth,
          video.videoHeight,
        );
        const texts = await recognizeBlobs([blob], false);
        if (cancelled) return;

        setOcrText(texts.join("\n---\n"));
        const parsed = parseCardCodeFromOcrAttempts(texts);
        if (!parsed) {
          setLiveStatus("Mostre o canto com o código (ex.: CRI PT 112/086)…");
          return;
        }

        const codeKey = `${parsed.abbreviation}-${parsed.number}`;
        setAbbr(parsed.abbreviation);
        setNumber(parsed.number);

        if (lastCodeRef.current === codeKey) {
          setLiveStatus(`Código estável: ${parsed.abbreviation} ${parsed.number}`);
          return;
        }

        setLiveStatus(`Li ${parsed.abbreviation} ${parsed.number} — buscando…`);
        const data = await runLookup(parsed.abbreviation, parsed.number);
        if (cancelled) return;
        lastCodeRef.current = codeKey;
        setLiveStatus(`Encontrei: ${data.cards[0]?.name ?? data.tcgdexId}`);
      } catch (err) {
        if (cancelled) return;
        // não spamma erro a cada frame; só se lookup falhar com código lido
        if (err instanceof Error && err.message.includes("não encontrada")) {
          setLiveStatus(err.message);
        }
      } finally {
        frameBusyRef.current = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void scanFrame();
    }, 1600);
    void scanFrame();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loop só depende da câmera aberta
  }, [cameraOpen]);

  async function openCamera() {
    setError(null);
    setResult(null);
    lastCodeRef.current = null;

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
      setLiveStatus("Procurando código…");
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
    lastCodeRef.current = null;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const crops = await prepareUploadOcrImages(file);
      const texts = await recognizeBlobs(crops, true);
      setOcrText(texts.join("\n---\n"));
      const parsed = parseCardCodeFromOcrAttempts(texts);
      if (!parsed) {
        setPhase("idle");
        setError(
          "Não li o código automaticamente. Aproxime o canto inferior esquerdo ou digite manualmente.",
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
              Abra a câmera e mostre o canto inferior esquerdo. O app tenta
              identificar sozinho, sem tirar foto (ex.:{" "}
              <span className="font-mono text-foreground">CRI PT 112/086</span>).
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
              <div className="pointer-events-none absolute inset-x-3 bottom-3 h-[22%] rounded-md border-2 border-dashed border-yellow-300/80 bg-yellow-300/10" />
              <p className="pointer-events-none absolute bottom-4 left-4 text-xs font-medium text-yellow-100 drop-shadow">
                Alinhe o código aqui — leitura automática
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
            <summary className="cursor-pointer">Texto lido pelo OCR</summary>
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
            O código impresso não diz se é normal, reverse ou holo — marque a
            variante certa abaixo. Com a câmera aberta, mostre outra carta para
            identificar a próxima.
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
