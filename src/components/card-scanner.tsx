"use client";

import { Camera, ChevronDown, ChevronUp, ImagePlus, Loader2, ScanLine, X } from "lucide-react";
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

/** Captura a carta inteira (não só o rodapé) para ler todas as palavras. */
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
  const [ocrText, setOcrText] = useState("");
  const [ocrExpanded, setOcrExpanded] = useState(false);
  const [abbr, setAbbr] = useState("");
  const [number, setNumber] = useState("");
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
    setAbbr(data.abbreviation);
    setNumber(data.number);
    if (data.ocrText) setOcrText(data.ocrText);
    setPhase("done");
    lastFoundRef.current = data.tcgdexId;
  }

  async function scanImageBase64(
    imageBase64: string,
    options?: { textOnly?: boolean },
  ): Promise<{
    result: LookupResult | null;
    ocrText: string;
  }> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch("/api/scan-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          textOnly: options?.textOnly === true,
        }),
        signal: controller.signal,
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

      const text = data.ocrText ?? "";
      if (text) setOcrText(text);

      if (options?.textOnly || !data.ok || !data.cards) {
        return { result: null, ocrText: text };
      }

      return { result: data as LookupResult, ocrText: text };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("OCR demorou demais. Tente de novo com a carta mais perto.");
      }
      throw err;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  // Câmera: procura até achar UMA carta → para tudo e mostra embaixo
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
        const { result: found, ocrText: readText } =
          await scanImageBase64(frame);
        if (cancelled || foundLockRef.current) return;

        if (!found) {
          setLiveStatus(
            readText
              ? "Ainda procurando… (texto parcial abaixo)"
              : "Aproxime a carta e segure firme…",
          );
          return;
        }

        // Achou → trava, para câmera, mostra carta. Não procura mais nada.
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
    }, 2200);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [cameraOpen]);

  async function openCamera() {
    setError(null);
    setResult(null);
    setOcrText("");
    setOcrExpanded(false);
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
    setOcrText("");
    setOcrExpanded(false);
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

      // 1) Lê e mostra o texto NA HORA
      const { ocrText: readText } = await scanImageBase64(dataUrl, {
        textOnly: true,
      });
      if (!readText) {
        setPhase("idle");
        setError("Não consegui ler nenhuma palavra. Tente outra foto, mais nítida.");
        return;
      }

      // 2) Depois tenta achar o código (sem apagar o texto já mostrado)
      setLiveStatus("Procurando código CRI + NNN/NNN…");
      const { result: found } = await scanImageBase64(dataUrl);
      if (!found) {
        setPhase("idle");
        setError(
          "Texto lido abaixo. Ainda não achei CRI + NNN/NNN colados — use busca manual se quiser.",
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

  const ocrPreview =
    ocrText.length > 280 && !ocrExpanded
      ? `${ocrText.slice(0, 280).trim()}…`
      : ocrText;

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
              Na câmera: enquadre a carta. Quando achar,{" "}
              <span className="text-foreground">para na hora</span> e mostra
              embaixo. Também dá para enviar foto.
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
            Lendo todas as palavras da carta…
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

        {/* Campo sempre visível com o texto OCR — clique para expandir */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Texto lido na carta</span>
            {ocrText.length > 280 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setOcrExpanded((v) => !v)}
              >
                {ocrExpanded ? (
                  <>
                    <ChevronUp className="size-3.5" />
                    Recolher
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" />
                    Ver texto completo
                  </>
                )}
              </button>
            ) : null}
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (ocrText.length > 280) setOcrExpanded((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (ocrText.length > 280) setOcrExpanded((v) => !v);
              }
            }}
            className={`rounded-xl border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground ${
              ocrExpanded ? "max-h-96 overflow-auto" : "max-h-36 overflow-hidden"
            } ${ocrText ? "cursor-pointer" : ""}`}
          >
            {ocrText ? (
              ocrPreview
            ) : phase === "looking" ? (
              <span className="text-muted-foreground">
                Lendo palavras da carta… aguarde alguns segundos.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Ainda sem leitura. Envie uma foto ou use a câmera — o texto aparece
                aqui.
              </span>
            )}
          </div>
          {result?.strategy ? (
            <p className="text-[11px] text-muted-foreground">
              Estratégia: {result.strategy}
            </p>
          ) : null}
        </div>

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
