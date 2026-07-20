import Link from "next/link";
import { Layers } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-border/80 bg-[#0b1f17]/95 text-[#e8f2ec] backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#f0c94a]/20 text-[#f0c94a] ring-1 ring-[#f0c94a]/30">
            <Layers className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
              PokéColeção
            </p>
            <p className="text-xs text-[#e8f2ec]/70 sm:text-sm">
              Gerencie o que você tem e o que ainda precisa
            </p>
          </div>
        </Link>
        <p className="hidden text-xs text-[#e8f2ec]/55 sm:block">
          Catálogo via TCGdex · coleção no SQLite
        </p>
      </div>
    </header>
  );
}
