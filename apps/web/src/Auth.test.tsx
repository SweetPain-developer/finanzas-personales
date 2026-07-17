import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { authenticatedFetch } from "./authClient";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App authentication gate", () => {
  it("renders the financial app for a valid session", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user }));
      return Promise.resolve(jsonResponse({ currentMonthLabel: "Julio 2026", availableToSpend: 0, operativeBalance: 0, pendingCommitmentsTotal: 0, liquidNetWorth: 0, liquidNetWorthVariation: 0, monthlyIncome: 0, monthlyExpenses: 0, goals: [], recentTransactions: [] }));
    }));

    render(<App />);

    expect(await screen.findByText("Julio 2026")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).not.toBeInTheDocument();
  });

  it("renders login when the session is absent", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input) === "/api/auth/session" ? Promise.resolve(jsonResponse({ error: "Authentication required." }, false, 401)) : Promise.resolve(jsonResponse({}))));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("logs in successfully and shows the app", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({}, false, 401));
      if (url === "/api/auth/login") return Promise.resolve(jsonResponse({ user }));
      return Promise.resolve(jsonResponse({ currentMonthLabel: "Julio 2026", availableToSpend: 0, operativeBalance: 0, pendingCommitmentsTotal: 0, liquidNetWorth: 0, liquidNetWorthVariation: 0, monthlyIncome: 0, monthlyExpenses: 0, goals: [], recentTransactions: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(await screen.findByLabelText("Correo electrónico"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Julio 2026")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ credentials: "include", method: "POST" }));
  });

  it("shows the backend login error", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({}, false, 401));
      return Promise.resolve(jsonResponse({ error: "Invalid email or password." }, false, 401));
    }));

    render(<App />);
    fireEvent.change(await screen.findByLabelText("Correo electrónico"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("logs out and returns to login", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user }));
      if (url === "/api/auth/logout") return Promise.resolve({ ok: true, status: 204 } as Response);
      return Promise.resolve(jsonResponse({ currentMonthLabel: "Julio 2026", availableToSpend: 0, operativeBalance: 0, pendingCommitmentsTotal: 0, liquidNetWorth: 0, liquidNetWorthVariation: 0, monthlyIncome: 0, monthlyExpenses: 0, goals: [], recentTransactions: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ credentials: "include", method: "POST" }));
  });

  it("disables logout while the request is pending and keeps the session after failure", async () => {
    let resolveLogout!: (response: Response) => void;
    const logoutResponse = new Promise<Response>((resolve) => { resolveLogout = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user }));
      if (url === "/api/auth/logout") return logoutResponse;
      return Promise.resolve(jsonResponse({ currentMonthLabel: "Julio 2026", availableToSpend: 0, operativeBalance: 0, pendingCommitmentsTotal: 0, liquidNetWorth: 0, liquidNetWorthVariation: 0, monthlyIncome: 0, monthlyExpenses: 0, goals: [], recentTransactions: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const logoutButton = await screen.findByRole("button", { name: "Cerrar sesión" });
    fireEvent.click(logoutButton);
    fireEvent.click(logoutButton);

    expect(screen.getByRole("button", { name: "Cerrando sesión..." })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/auth/logout")).toHaveLength(1);

    resolveLogout(jsonResponse({ error: "Unavailable" }, false, 500));
    expect(await screen.findByRole("alert")).toHaveTextContent("El servidor no confirmó el cierre de sesión");
    expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeEnabled();
  });

  it("keeps the session visible when logout is not confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user }));
      if (url === "/api/auth/logout") return Promise.resolve(jsonResponse({ error: "Unavailable" }, false, 500));
      return Promise.resolve(jsonResponse({ currentMonthLabel: "Julio 2026", availableToSpend: 0, operativeBalance: 0, pendingCommitmentsTotal: 0, liquidNetWorth: 0, liquidNetWorthVariation: 0, monthlyIncome: 0, monthlyExpenses: 0, goals: [], recentTransactions: [] }));
    }));

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El servidor no confirmó el cierre de sesión");
    expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).not.toBeInTheDocument();
  });

  it("returns to login when a protected request receives 401", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user }));
      return Promise.resolve(jsonResponse({ error: "Authentication required." }, false, 401));
    }));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Comprobando sesión...")).not.toBeInTheDocument());
  });

  it("shows the session-expired message in the login page", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user }));
      if (url.startsWith("/api/dashboard")) return Promise.resolve(jsonResponse({ error: "Authentication required." }, false, 401));
      return Promise.resolve(jsonResponse({}));
    }));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Tu sesión expiró. Inicia sesión nuevamente.");
  });

  it("does not let a late 401 from before login replace the new session", async () => {
    let resolveLateRequest!: (response: Response) => void;
    const lateRequest = new Promise<Response>((resolve) => { resolveLateRequest = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({}, false, 401));
      if (url === "/api/auth/login") return Promise.resolve(jsonResponse({ user }));
      if (url === "/api/old-request") return lateRequest;
      return Promise.resolve(jsonResponse({ currentMonthLabel: "Julio 2026", availableToSpend: 0, operativeBalance: 0, pendingCommitmentsTotal: 0, liquidNetWorth: 0, liquidNetWorthVariation: 0, monthlyIncome: 0, monthlyExpenses: 0, goals: [], recentTransactions: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    void authenticatedFetch("/api/old-request");
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("Julio 2026")).toBeInTheDocument();

    resolveLateRequest(jsonResponse({ error: "Authentication required." }, false, 401));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).not.toBeInTheDocument());
  });

  it("shows a retryable bootstrap error instead of silently showing login", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input) === "/api/auth/session" ? Promise.reject(new Error("network down")) : Promise.resolve(jsonResponse({}))));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "No se pudo comprobar la sesión" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).not.toBeInTheDocument();
  });

  it("does not let StrictMode cleanup expose a stale bootstrap result", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user }));
      return Promise.resolve(jsonResponse({ currentMonthLabel: "Julio 2026", availableToSpend: 0, operativeBalance: 0, pendingCommitmentsTotal: 0, liquidNetWorth: 0, liquidNetWorthVariation: 0, monthlyIncome: 0, monthlyExpenses: 0, goals: [], recentTransactions: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StrictMode><App /></StrictMode>);

    expect(await screen.findByText("Julio 2026")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/auth/session")).toHaveLength(2);
  });

  it("authenticatedFetch always includes session credentials", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await authenticatedFetch("/api/protected", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledWith("/api/protected", expect.objectContaining({ method: "GET", credentials: "include" }));
  });
});

const user = { id: "user-1", email: "user@example.com", displayName: "User" };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}
