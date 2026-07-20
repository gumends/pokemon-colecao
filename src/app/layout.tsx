import type { Metadata } from "next";
import { Outfit, Source_Sans_3 } from "next/font/google";

import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const outfit = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const sourceSans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PokéColeção | Gerenciador de cartas Pokémon TCG",
  description:
    "Busque cartas Pokémon TCG e organize o que você tem e o que ainda precisa na sua coleção.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${outfit.variable} ${sourceSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
