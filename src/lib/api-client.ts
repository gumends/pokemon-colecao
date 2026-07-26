const TOKEN_KEY = "pokemon_colecao_token";

/**
 * URL da API .NET.
 * Sem NEXT_PUBLIC_API_URL → usa /backend no mesmo host:porta do site
 * (rewrite no next.config → 127.0.0.1:5080). Assim acesso externo
 * só precisa da TCP 8211 aberta.
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    return `${window.location.origin}/backend`;
  }

  return "http://127.0.0.1:5080";
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });
}
