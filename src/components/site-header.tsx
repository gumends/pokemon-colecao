import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-white/10 bg-black text-white">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png"
            alt="Pikachu"
            width={56}
            height={56}
            className="size-14 object-contain"
          />
          <div>
            <p className="font-heading text-lg font-semibold tracking-tight sm:text-xl">
              PokéColeção
            </p>
            <p className="text-xs text-white/60 sm:text-sm">
              Gerencie o que você tem e o que ainda precisa
            </p>
          </div>
        </Link>
      </div>
    </header>
  );
}
