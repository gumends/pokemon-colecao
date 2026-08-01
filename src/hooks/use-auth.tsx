"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch, setAuthToken } from "@/lib/api-client";

export type AuthUser = {
  id: string;
  username: string;
  name: string;
  friendCode: string;
};

type ProfileUpdate = {
  name?: string;
  username?: string;
  password?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (
    username: string,
    password: string,
    name: string,
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (
    data: ProfileUpdate,
  ) => Promise<{ ok: boolean; error?: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeUser(raw: Partial<AuthUser> & { friendCode?: string }): AuthUser {
  return {
    id: raw.id ?? "",
    username: raw.username ?? "",
    name: raw.name ?? "",
    friendCode: raw.friendCode ?? "",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch("/api/auth", {
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 401) {
        setAuthToken(null);
        setUser(null);
        return;
      }
      if (!response.ok) {
        throw new Error("Não foi possível validar a sessão.");
      }
      const data = (await response.json()) as { user: AuthUser };
      setUser(normalizeUser(data.user));
    } catch (err) {
      setUser(null);
      const timedOut =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError");
      setError(
        timedOut
          ? "API demorou para responder. Confira se a API .NET está no ar."
          : err instanceof Error
            ? err.message
            : "Erro ao carregar sessão.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    const response = await apiFetch("/api/auth", {
      method: "POST",
      body: JSON.stringify({ username, password, mode: "login" }),
    });
    const data = (await response.json()) as {
      user?: AuthUser;
      token?: string;
      error?: string;
    };
    if (!response.ok || !data.user || !data.token) {
      setError(data.error ?? "Falha no login.");
      return false;
    }
    setAuthToken(data.token);
    setUser(normalizeUser(data.user));
    return true;
  }, []);

  const register = useCallback(
    async (username: string, password: string, name: string) => {
      setError(null);
      const response = await apiFetch("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          name,
          mode: "register",
        }),
      });
      const data = (await response.json()) as {
        user?: AuthUser;
        token?: string;
        error?: string;
      };
      if (!response.ok || !data.user || !data.token) {
        setError(data.error ?? "Falha ao criar conta.");
        return false;
      }
      setAuthToken(data.token);
      setUser(normalizeUser(data.user));
      return true;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth", { method: "DELETE" });
    } finally {
      setAuthToken(null);
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (data: ProfileUpdate) => {
    const response = await apiFetch("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    const payload = (await response.json()) as {
      user?: AuthUser;
      token?: string;
      error?: string;
    };
    if (!response.ok || !payload.user) {
      return { ok: false, error: payload.error ?? "Falha ao salvar perfil." };
    }
    if (payload.token) setAuthToken(payload.token);
    setUser(normalizeUser(payload.user));
    return { ok: true };
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      error,
      login,
      register,
      logout,
      refresh,
      updateProfile,
    }),
    [user, isLoading, error, login, register, logout, refresh, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return ctx;
}
