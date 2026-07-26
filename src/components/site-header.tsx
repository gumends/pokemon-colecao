"use client";

import Image from "next/image";
import Link from "next/link";

import { ProfileButton } from "@/components/profile-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function SiteHeader() {
  const { user, logout, isLoading } = useAuth();

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
              Pokemon TCG
            </p>
            <p className="text-xs text-white/60 sm:text-sm">
              {user
                ? `Olá, ${user.name}`
                : "Gerencie o que você tem e o que ainda precisa"}
            </p>
          </div>
        </Link>

        {!isLoading && user ? (
          <div className="ml-auto flex items-center gap-2">
            <ProfileButton />
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={() => void logout()}
            >
              Sair
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
