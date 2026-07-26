"use client";

import { useAuth } from "@/hooks/use-auth";
import { LoginForm } from "@/components/login-form";
import { LoadingState } from "@/components/loading-state";
import { CollectionApp } from "@/components/collection-app";

export function AppProviders() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <LoadingState message="Verificando sessão…" />
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return <CollectionApp key={user.id} />;
}
