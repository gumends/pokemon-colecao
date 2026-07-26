"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export function LoginForm() {
  const { login, register, error, isLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setLocalError(null);
    try {
      const ok =
        mode === "login"
          ? await login(username, password)
          : await register(username, password, name || username);
      if (!ok) setLocalError("Não foi possível entrar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {mode === "login" ? "Entrar" : "Criar conta"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada usuário tem sua própria coleção de cartas.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === "register" ? (
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome"
            autoComplete="name"
          />
        ) : null}
        <Input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Usuário"
          autoComplete="username"
          required
        />
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha"
          autoComplete={
            mode === "login" ? "current-password" : "new-password"
          }
          required
        />
        {(localError || error) && !isLoading ? (
          <p className="text-sm text-destructive" role="alert">
            {error ?? localError}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending
            ? "Aguarde…"
            : mode === "login"
              ? "Entrar"
              : "Criar conta"}
        </Button>
      </form>

      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setLocalError(null);
        }}
      >
        {mode === "login"
          ? "Não tem conta? Criar usuário"
          : "Já tem conta? Entrar"}
      </button>
    </div>
  );
}
