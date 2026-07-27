"use client";

import { ImagePlus, Loader2, ScanLine } from "lucide-react";
import Image from "next/image";
import { useRef, useState, type ChangeEvent } from "react";

import { CardGrid } from "@/components/card-grid";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/lib/api-client";
import { ocrCodeStripInBrowser, ocrImageInBrowser } from "@/lib/client-ocr";
import { cardImageUrl } from "@/lib/tcgdex";
import type { CardBrief, CollectionStatus } from "@/lib/types";

/** Câmera desligada por enquanto (detecção automática instável). */
const CAMERA_ENABLED = false;

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

export function CardScanner({ getStatus, onStatusChange }: CardScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "looking" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function applyResult(data: LookupResult) {
    setResult(data);
    setPhase("done");
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

  async function processCapturedImage(dataUrl: string) {
    setError(null);
    setResult(null);
    setPhase("looking");
    setLiveStatus("Identificando carta…");

    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(dataUrl);

    try {
      const { result: found } = await scanImageBase64(dataUrl);
      if (!found) {
        setPhase("idle");
        setLiveStatus(null);
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
      setLiveStatus(null);
      setError(err instanceof Error ? err.message : "Falha ao ler a imagem.");
    }
  }

  async function processFile(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });
    await processCapturedImage(dataUrl);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void processFile(file);
  }

  const isLoading = phase === "looking";

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
              {CAMERA_ENABLED
                ? "Use a câmera ou envie uma foto. O texto é lido com Amazon Textract."
                : "Envie uma foto da carta. O texto é lido com Amazon Textract (e Tesseract se precisar)."}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
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

        {isLoading ? (
          <div className="mt-4 space-y-3">
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-border bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Foto enviada"
                  className="max-h-56 w-full object-contain opacity-70"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/50 backdrop-blur-[1px]">
                  <Loader2 className="size-8 animate-spin text-foreground" />
                  <p className="px-4 text-center text-sm font-medium">
                    {liveStatus ?? "Identificando carta…"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {liveStatus ?? "Lendo carta…"}
              </p>
            )}
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {!isLoading && liveStatus?.startsWith("Carta encontrada") ? (
          <p className="mt-4 text-sm font-medium text-foreground">{liveStatus}</p>
        ) : null}

        {previewUrl && !isLoading ? (
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
            Marque a variante. Para outra carta, envie outra foto.
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
