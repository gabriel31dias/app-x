// mesma origem do site: o serve.mjs repassa /api pra API (no `npm run dev`, o proxy do vite faz isso)
const API = "/api";
const TOKEN = "orama_admin_token";
const USER = "orama_admin_user";

// papel: "admin" vê o painel inteiro; "influencer" só o próprio dashboard (/influencer)
export type AdminUser = { nome: string; email: string; avatarUrl?: string | null; papel?: "admin" | "influencer" };

export const session = {
  token: () => localStorage.getItem(TOKEN),
  user: (): AdminUser | null => {
    try { return JSON.parse(localStorage.getItem(USER) || "null"); } catch { return null; }
  },
  save(token: string, user: AdminUser) {
    localStorage.setItem(TOKEN, token);
    localStorage.setItem(USER, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(USER);
  },
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.token();
  const res = await fetch(API + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }), ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    session.clear();
    location.hash = "#/login";
  }
  if (!res.ok) throw new ApiError(Object.values(body.erros || {})[0] as string || body.message || `Erro ${res.status}`, res.status);
  return body as T;
}

/** query string sem os campos vazios */
export const qs = (p: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : "";
};
