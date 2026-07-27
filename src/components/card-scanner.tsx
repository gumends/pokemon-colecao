"use client";

import { Camera, ImagePlus, Loader2, ScanLine, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { CardGrid } from "@/components/card-grid";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/lib/api-client";
import { ocrCodeStripInBrowser, ocrImageInBrowser } from "@/lib/client-ocr";
import { cardImageUrl } from "@/lib/tcgdex";
import type { CardBrief, CollectionStatus } from "@/lib/types";

type LookupResult = {
  abbreviation: string;
  number: string;
  setId: string;
  setName: string;
  tcgdexId: string;
  cards: CardBrief[];
  strategy?: string;
  ocrText?: string;
  engine?: string;
};

type CardScannerProps = {
  getStatus: (cardId: string) => CollectionStatus | null;
  onStatusChange: (card: CardBrief, status: CollectionStatus | null) => void;
};

function captureVideoFrame(video: HTMLVideoElement): string | null {
  if (video.videoWidth === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function CardScanner({ getStatus, onStatusChange }: CardScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFoundRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const foundLockRef = useRef(false);
  const stableRef = useRef<{ hash: string; count: number } | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "looking" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  function stopCamera(options?: { keepStatus?: boolean }) {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    if (!options?.keepStatus) setLiveStatus(null);
    busyRef.current = false;
    stableRef.current = null;
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

  async function applyResult(data: LookupResult) {
    setResult(data);
    setPhase("done");
    lastFoundRef.current = data.tcgdexId;
  }

  async function scanWithTextract(imageBase64: string): Promise<{
    result: LookupResult | null;
    ocrText: string;
    failed?: boolean;
  }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch("/api/scan-textract", {
      method: "POST",
      headers,
      body: JSON.stringify({ imageBase64 }),
    });

    const data = (await response.json()) as LookupResult & {
      ok?: boolean;
      reason?: string;
      error?: string;
      ocrText?: string;
      engine?: string;
    };

    // Sem credencial / sem permissão → deixa o Tesseract tentar
    if (response.status === 401 || response.status === 502) {
      return { result: null, ocrText: "", failed: true };
    }

    if (!response.ok) {
      throw new Error(data.error ?? "Falha no Textract.");
    }

    if (!data.ok || !data.cards) {
      return {
        result: null,
        ocrText: data.ocrText ?? "",
        failed: data.reason === "textract-failed",
      };
    }

    return {
      result: { ...data, engine: data.engine ?? "textract" } as LookupResult,
      ocrText: data.ocrText ?? "",
    };
  }

  async function scanWithTesseract(imageBase64: string): Promise<{
    result: LookupResult | null;
    ocrText: string;
  }> {
    setLiveStatus("Lendo texto no aparelho (Tesseract)…");
    const fullText = await ocrImageInBrowser(imageBase64);
    let stripText = "";
    try {
      stripText = await ocrCodeStripInBrowser(imageBase64);
    } catch {
      // opcional
    }
    const joined = [fullText, stripText].filter(Boolean).join("\n");

    if (!joined.trim()) {
      return { result: null, ocrText: "" };
    }

    setLiveStatus("Resolvendo carta…");
    const response = await fetch("/api/resolve-ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ocrText: joined }),
    });
    const data = (await response.json()) as LookupResult & {
      ok?: boolean;
      reason?: string;
      error?: string;
      ocrText?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "Falha ao resolver a carta.");
    }

    if (!data.ok || !data.cards) {
      return { result: null, ocrText: joined };
    }

    return {
      result: { ...data, engine: "tesseract" } as LookupResult,
      ocrText: joined,
    };
  }

  async function scanImageBase64(imageBase64: string): Promise<{
    result: LookupResult | null;
    ocrText: string;
  }> {
    setLiveStatus("Lendo com Amazon Textract…");
    try {
      const textract = await scanWithTextract(imageBase64);
      if (textract.result) return textract;
      // Textract leu mas não achou carta — ainda tenta Tesseract
      if (!textract.failed && textract.ocrText) {
        setLiveStatus("Textract não achou; tentando no aparelho…");
      } else {
        setLiveStatus("Textract indisponível; tentando no aparelho…");
      }
    } catch {
      setLiveStatus("Textract falhou; tentando no aparelho…");
    }

    return scanWithTesseract(imageBase64);
  }

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    foundLockRef.current = false;
    lastFoundRef.current = null;
    stableRef.current = null;
    setPhase("looking");

    async function tick() {
      if (cancelled || busyRef.current || foundLockRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const frame = captureVideoFrame(video);
      if (!frame) return;

      const hash = `${frame.length}:${frame.slice(40, 80)}`;
      const stable = stableRef.current;
      if (stable?.hash === hash) stable.count += 1;
      else stableRef.current = { hash, count: 1 };

      if ((stableRef.current?.count ?? 0) < 2) {
        setLiveStatus("Segure a carta firme no enquadramento…");
        return;
      }

      busyRef.current = true;
      setLiveStatus("Procurando carta…");

      try {
        const { result: found } = await scanImageBase64(frame);
        if (cancelled || foundLockRef.current) return;

        if (!found) {
          setLiveStatus("Ainda procurando… aproxime a carta e segure firme.");
          return;
        }

        foundLockRef.current = true;
        cancelled = true;
        window.clearInterval(intervalId);
        await applyResult(found);
        const label = found.cards[0]?.name ?? found.tcgdexId;
        setLiveStatus(`Carta encontrada: ${label}`);
        stopCamera({ keepStatus: true });
      } catch (err) {
        if (!cancelled && !foundLockRef.current) {
          setLiveStatus(
            err instanceof Error ? err.message : "Erro ao analisar frame.",
          );
        }
      } finally {
        busyRef.current = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void tick();
    }, 2500);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [cameraOpen]);

  async function openCamera() {
    setError(null);
    setResult(null);
    lastFoundRef.current = null;
    foundLockRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não permite acessar a webcam.");
      return;
    }

    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
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
      setLiveStatus("Enquadre a carta — ao achar, paro na hora.");
      setPhase("looking");
    } catch {
      setError(
        "Não consegui abrir a webcam. Permita o acesso à câmera e tente de novo.",
      );
      setCameraOpen(false);
    }
  }

  async function processFile(file: File) {
    stopCamera();
    setError(null);
    setResult(null);
    setPhase("looking");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
        reader.readAsDataURL(file);
      });

      const { result: found } = await scanImageBase64(dataUrl);
      if (!found) {
        setPhase("idle");
        setError(
          "Não identifiquei a carta. Tente outra foto, mais nítida e bem iluminada.",
        );
        return;
      }
      await applyResult(found);
      setLiveStatus(
        `Carta encontrada: ${found.cards[0]?.name ?? found.tcgdexId}`,
      );
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
              Use a câmera ou envie uma foto. O texto é lido com Amazon Textract
              (e Tesseract se precisar). Ao achar, para e mostra embaixo.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void openCamera()}>
            <Camera className="size-4" />
            {cameraOpen ? "Reiniciar câmera" : "Usar câmera"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={phase === "looking"}
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
              <div className="pointer-events-none absolute inset-[6%] rounded-md border-2 border-dashed border-yellow-300/80" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {liveStatus ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {liveStatus}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="ml-auto"
                onClick={() => stopCamera()}
              >
                <X className="size-4" />
                Fechar câmera
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "looking" && !cameraOpen ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Lendo carta…
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {!cameraOpen && liveStatus?.startsWith("Carta encontrada") ? (
          <p className="mt-4 text-sm font-medium text-foreground">{liveStatus}</p>
        ) : null}

        {previewUrl && !cameraOpen ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Prévia"
              className="max-h-56 w-full object-contain"
            />
          </div>
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
            Marque a variante. Para outra carta, abra a câmera de novo.
            {result.engine ? ` · OCR: ${result.engine}` : ""}
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
