"use client";

import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { AuthProvider } from "@/hooks/use-auth";

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SiteHeader />
      {children}
    </AuthProvider>
  );
}
