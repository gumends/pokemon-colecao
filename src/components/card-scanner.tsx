"use client";

import { Camera, ImagePlus, Loader2, ScanLine, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { CardGrid } from "@/components/card-grid";
import { Button } from "@/components/ui/button";
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
};

type CardScannerProps = {
  getStatus: (cardId: string) => CollectionStatus | null;
  onStatusChange: (card: CardBrief, status: CollectionStatus | null) => void;
};

function captureVideoFrame(video: HTMLVideoElement): string | null {
  if (video.videoWidth === 0) return null;
  // Envia só a faixa inferior (onde fica o código) → OCR mais rápido/preciso
  const fullW = video.videoWidth;
  const fullH = video.videoHeight;
  const sy = Math.floor(fullH * 0.55);
  const sh = fullH - sy;
  const canvas = document.createElement("canvas");
  canvas.width = fullW;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, sy, fullW, sh, 0, 0, fullW, sh);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function CardScanner({ getStatus, onStatusChange }: CardScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastFoundRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const stableRef = useRef<{ hash: string; count: number } | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [abbr, setAbbr] = useState("");
  const [number, setNumber] = useState("");
  const [phase, setPhase] = useState<"idle" | "looking" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setLiveStatus(null);
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
    setAbbr(data.abbreviation);
    setNumber(data.number);
    setOcrText(data.ocrText ?? "");
    setPhase("done");
    lastFoundRef.current = data.tcgdexId;
    setLiveStatus(
      `Encontrei: ${data.cards[0]?.name ?? data.tcgdexId}${
        data.strategy ? ` (${data.strategy})` : ""
      }`,
    );
  }

  async function scanImageBase64(imageBase64: string) {
    const response = await fetch("/api/scan-frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 }),
    });
    const data = (await response.json()) as LookupResult & {
      ok?: boolean;
      reason?: string;
      error?: string;
      ocrText?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "Falha no scan.");
    }

    setOcrText(data.ocrText ?? "");

    if (!data.ok || !data.cards) {
      return null;
    }

    return data as LookupResult;
  }

  // Loop ao vivo: envia frame ao servidor (OCR + lógica inteligente)
  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    lastFoundRef.current = null;
    stableRef.current = null;

    async function tick() {
      if (cancelled || busyRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const frame = captureVideoFrame(video);
      if (!frame) return;

      // estabilidade simples: mesmo tamanho de dataURL ≈ frame parecido
      // (melhor: hash curto)
      const hash = `${frame.length}:${frame.slice(40, 80)}`;
      const stable = stableRef.current;
      if (stable?.hash === hash) stable.count += 1;
      else stableRef.current = { hash, count: 1 };

      // espera a mão parar um pouco
      if ((stableRef.current?.count ?? 0) < 2) {
        setLiveStatus("Segure a carta firme no guia…");
        return;
      }

      busyRef.current = true;
      setLiveStatus("Analisando código no servidor…");

      try {
        const found = await scanImageBase64(frame);
        if (cancelled) return;
        if (!found) {
          setLiveStatus(
            "Sem tokens colados ainda — preciso de CRI + 112/086 juntos…",
          );
          return;
        }
        if (lastFoundRef.current === found.tcgdexId) {
          setLiveStatus(`Código estável: ${found.abbreviation} ${found.number}`);
          return;
        }
        await applyResult(found);
      } catch (err) {
        if (!cancelled) {
          setLiveStatus(
            err instanceof Error ? err.message : "Erro ao analisar frame.",
          );
        }
      } finally {
        busyRef.current = false;
      }
    }

    const id = window.setInterval(() => {
      void tick();
    }, 1800);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [cameraOpen]);

  async function openCamera() {
    setError(null);
    setResult(null);
    lastFoundRef.current = null;

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
      setLiveStatus("Aponte o código para o guia amarelo…");
      setPhase("idle");
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
      const found = await scanImageBase64(dataUrl);
      if (!found) {
        setPhase("idle");
        setError(
          "Não identifiquei a carta. Tente foto mais perto do código (ex.: CRI PT 112/086).",
        );
        return;
      }
      await applyResult(found);
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

  async function manualLookup() {
    setPhase("looking");
    setError(null);
    try {
      const params = new URLSearchParams({
        abbr: abbr.trim().toUpperCase(),
        number: number.trim(),
      });
      const response = await fetch(`/api/lookup-card?${params.toString()}`);
      const data = (await response.json()) as LookupResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não encontrada.");
      await applyResult(data);
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Falha na busca.");
    }
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
              Só lê tokens colados:{" "}
              <span className="font-mono text-foreground">CRI</span> e{" "}
              <span className="font-mono text-foreground">112/086</span> (barra
              sem espaço). Letras soltas e números separados são ignorados.
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
              <div className="pointer-events-none absolute inset-x-[8%] bottom-[6%] h-[22%] rounded-md border-2 border-dashed border-yellow-300/90 bg-yellow-300/10" />
              <p className="pointer-events-none absolute bottom-[8%] left-[10%] text-xs font-medium text-yellow-100 drop-shadow">
                Código no guia · segure firme
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

        {phase === "looking" && !cameraOpen ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Analisando…
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
              alt="Prévia"
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
              onClick={() => void manualLookup()}
            >
              Buscar
            </Button>
          </div>
        </div>

        {ocrText ? (
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">OCR / estratégia (debug)</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-2 font-mono">
              {result?.strategy ? `strategy: ${result.strategy}\n\n` : ""}
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
            Marque a variante. Mostre outra carta na câmera para a próxima.
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
