"use client";

import { Copy, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";

type FriendHistoryItem = {
  friendCode: string;
  friendName: string;
  friendUsername: string;
};

type ProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<FriendHistoryItem[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    setName(user.name);
    setUsername(user.username);
    setPassword("");
    setMessage(null);
    setError(null);
    setCopied(false);

    void (async () => {
      try {
        const response = await apiFetch("/api/friends/history");
        if (!response.ok) return;
        const data = (await response.json()) as {
          history?: FriendHistoryItem[];
        };
        setHistory(data.history ?? []);
      } catch {
        setHistory([]);
      }
    })();
  }, [open, user]);

  if (!user) return null;

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await updateProfile({
        name,
        username,
        password: password.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      setPassword("");
      setMessage("Perfil atualizado.");
    } finally {
      setPending(false);
    }
  }

  async function copyCode() {
    if (!user?.friendCode) return;
    try {
      await navigator.clipboard.writeText(user.friendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar o código.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-4" showCloseButton>
        <DialogHeader>
          <DialogTitle>Meu perfil</DialogTitle>
          <DialogDescription>
            Edite seus dados e compartilhe seu código com amigos.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Seu código de amigo</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-heading text-xl font-semibold tracking-[0.2em]">
              {user.friendCode || "—"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyCode()}
              disabled={!user.friendCode}
            >
              <Copy data-icon="inline-start" />
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>

        {history.length > 0 ? (
          <div className="rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">Amigos que você buscou</p>
            <ul className="mt-2 space-y-1.5">
              {history.map((item) => (
                <li
                  key={item.friendCode}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="font-medium">{item.friendName}</span>
                  <span className="font-mono text-xs tracking-wider text-muted-foreground">
                    {item.friendCode}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <form onSubmit={onSave} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="profile-name">
              Nome
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="profile-username"
            >
              Usuário
            </label>
            <Input
              id="profile-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="profile-password"
            >
              Nova senha (opcional)
            </label>
            <Input
              id="profile-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Deixe em branco para manter"
              autoComplete="new-password"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-green-700" role="status">
              {message}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProfileButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
        onClick={() => setOpen(true)}
        aria-label="Abrir perfil"
      >
        <UserRound data-icon="inline-start" />
        Perfil
      </Button>
      <ProfileDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
