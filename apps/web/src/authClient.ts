export type AuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
};

export const AUTH_SESSION_EXPIRED_EVENT = "finanzas:auth-session-expired";

let sessionEpoch = 0;

export function advanceSessionEpoch() {
  sessionEpoch += 1;
  return sessionEpoch;
}

export function getSessionEpoch() {
  return sessionEpoch;
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const requestEpoch = sessionEpoch;
  const requestInit = { ...init };
  Object.defineProperty(requestInit, "credentials", { value: "include", enumerable: false, configurable: true });
  const response = await fetch(input, requestInit);

  if (response.status === 401 && requestEpoch === sessionEpoch) {
    window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT, { detail: { epoch: requestEpoch } }));
  }

  return response;
}

export async function getSession(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/session", { credentials: "include" });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("No se pudo comprobar la sesión.");
  }

  const body = (await response.json()) as { user?: AuthUser };
  return body.user ?? null;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  const body = (await response.json().catch(() => null)) as { user?: AuthUser; error?: string } | null;
  if (!response.ok || !body?.user) {
    throw new Error(body?.error ?? "No se pudo iniciar sesión.");
  }

  return body.user;
}

export async function logout() {
  let response: Response;
  try {
    response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    throw new Error("No se pudo confirmar el cierre de sesión con el servidor. Tu sesión sigue activa.");
  }

  if (!response.ok) {
    throw new Error("El servidor no confirmó el cierre de sesión. Tu sesión sigue activa.");
  }
}
