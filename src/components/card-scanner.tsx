"use client";

import { Camera, ImagePlus, Loader2, ScanLine, Square, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createWorker } from "tesseract.js";

import { CardGrid } from "@/components/card-grid";
import { Button } from "@/components/ui/button";
import { parseCardCodeFromText } from "@/lib/card-code-parse";
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

/** Corta a faixa inferior da foto (onde fica o código do set). */
async function cropBottomBand(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const bandTop = Math.floor(bitmap.height * 0.72);
  const bandHeight = bitmap.height - bandTop;
  canvas.width = bitmap.width;
  canvas.height = bandHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(
    bitmap,
    0,
    bandTop,
    bitmap.width,
    bandHeight,
    0,
    0,
    bitmap.width,
    bandHeight,
  );
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Falha ao cortar imagem")),
      "image/jpeg",
      0.92,
    );
  });
}

export function CardScanner({ getStatus, onStatusChange }: CardScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
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
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
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

  async function openCamera() {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não permite acessar a webcam.");
      return;
    }

    try {
      // encerra stream anterior sem esconder o UI cedo demais
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
    } catch {
      setError(
        "Não consegui abrir a webcam. Permita o acesso à câmera no navegador e tente de novo.",
      );
      setCameraOpen(false);
    }
  }

  async function captureFromCamera() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setError("Aguarde a câmera carregar e tente capturar de novo.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) {
      setError("Falha ao capturar o frame da câmera.");
      return;
    }

    stopCamera();
    const file = new File([blob], "captura-webcam.jpg", { type: "image/jpeg" });
    await processFile(file);
  }

  async function runLookup(nextAbbr: string, nextNumber: string) {
    setPhase("looking");
    setError(null);
    setResult(null);

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
    setPhase("done");
  }

  async function processFile(file: File) {
    setError(null);
    setResult(null);
    setOcrText("");
    setAbbr("");
    setNumber("");
    setPhase("reading");

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const cropped = await cropBottomBand(file);
      const worker = await createWorker("eng");
      try {
        const { data } = await worker.recognize(cropped);
        const text = data.text ?? "";
        setOcrText(text);
        const parsed = parseCardCodeFromText(text);
        if (!parsed) {
          setPhase("idle");
          setError(
            "Não li o código automaticamente. Digite a abreviação e o número (ex.: CRI e 083) e busque.",
          );
          return;
        }
        setAbbr(parsed.abbreviation);
        setNumber(parsed.number);
        await runLookup(parsed.abbreviation, parsed.number);
      } finally {
        await worker.terminate();
      }
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
              Abra a webcam e enquadre o canto inferior esquerdo (ex.:{" "}
              <span className="font-mono text-foreground">CRI 083/086</span>).
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void openCamera()} disabled={busy}>
            <Camera className="size-4" />
            Usar câmera
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
              {/* Guia do código no canto inferior esquerdo */}
              <div className="pointer-events-none absolute inset-x-3 bottom-3 h-[22%] rounded-md border-2 border-dashed border-yellow-300/80 bg-yellow-300/10" />
              <p className="pointer-events-none absolute bottom-4 left-4 text-xs font-medium text-yellow-100 drop-shadow">
                Alinhe o código aqui
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void captureFromCamera()}
                disabled={busy}
              >
                <Square className="size-4" />
                Capturar e ler
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={stopCamera}
                disabled={busy}
              >
                <X className="size-4" />
                Fechar câmera
              </Button>
            </div>
          </div>
        ) : null}

        {busy ? (
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
              placeholder="083"
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
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 p-2 font-mono">
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
            variante certa abaixo.
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
