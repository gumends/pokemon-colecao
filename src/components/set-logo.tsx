"use client";

import Image from "next/image";
import { useState } from "react";

import { setLogoCandidates } from "@/lib/tcgdex";
import type { SetBrief } from "@/lib/types";

type SetLogoProps = {
  set: Pick<SetBrief, "id" | "name" | "logo" | "symbol">;
};

/** Tenta logo/symbol/EN/carta até uma URL funcionar; senão mostra o id do set. */
export function SetLogo({ set }: SetLogoProps) {
  const candidates = setLogoCandidates(set);
  const [index, setIndex] = useState(0);
  const src = candidates[index] ?? null;

  if (!src) {
    return <SetLogoBadge id={set.id} />;
  }

  return (
    <Image
      key={src}
      src={src}
      alt=""
      width={160}
      height={48}
      unoptimized
      className="max-h-12 w-auto object-contain"
      onError={() => {
        setIndex((current) => current + 1);
      }}
    />
  );
}

function SetLogoBadge({ id }: { id: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-md bg-zinc-900 px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-white">
      <span className="truncate">{id}</span>
    </span>
  );
}
