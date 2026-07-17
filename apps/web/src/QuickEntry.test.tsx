import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { QuickEntryPage } from "./QuickEntry";
import type { DashboardData } from "./dashboardTypes";
import type { QuickEntryOptions } from "./QuickEntry";

const dashboardData: DashboardData = {
  currentMonthLabel: "Julio 2026",
  availableToSpend: 345000,
  operativeBalance: 500000,
  pendingCommitmentsTotal: 155000,
  liquidNetWorth: 1250000,
  liquidNetWorthVariation: 50000,
  monthlyIncome: 123456,
  monthlyExpenses: 855000,
  goals: [],
  recentTransactions: [],
};

const quickEntryOptions: QuickEntryOptions = {
  accounts: [
    { id: "account-operativa", nombre: "Cuenta operativa demo", tipo: "OPERATIVA" },
    { id: "account-savings", nombre: "Cuenta ahorro demo", tipo: "AHORRO" },
    { id: "account-card", nombre: "Tarjeta demo", tipo: "TARJETA_CREDITO" },
    { id: "account-primary", nombre: "Cuenta principal demo", tipo: "OPERATIVA" },
  ],
  categories: {
    GASTO: [
      { id: "category-auto", nombre: "Auto", icono: "car" },
      { id: "category-sent-transfer", nombre: "Transferencia enviada", icono: "send" },
      { id: "category-delivery", nombre: "Delivery", icono: "bike" },
    ],
    INGRESO: [{ id: "category-salary", nombre: "Sueldo", icono: "salary" }],
  },
  lastUsedAccountId: "account-primary",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuickEntryPage", () => {
  it("opens from the dashboard FAB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user: { id: "user-1", email: "user@example.com" } }));
        return Promise.resolve(jsonResponse(url.includes("quick-entry") ? quickEntryOptions : dashboardData));
      }),
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar movimiento" }));

    expect(await screen.findByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monto")).toBeInTheDocument();
  });

  it("renders loading while quick-entry options load", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<QuickEntryPage onClose={vi.fn()} />);

    expect(screen.getByText("Cargando opciones para registrar el movimiento...")).toBeInTheDocument();
  });

  it("renders an error when quick-entry options fail", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ message: "Server error" }, false, 500))));

    render(<QuickEntryPage onClose={vi.fn()} />);

    expect(await screen.findByText("No se pudieron cargar las opciones para registrar el movimiento. Revisa tu conexión e inténtalo nuevamente.")).toBeInTheDocument();
  });

  it("fetches options from the Vite API proxy and defaults to GASTO and the API last used account", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(quickEntryOptions)));
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickEntryPage onClose={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/quick-entry/options", expect.objectContaining({ credentials: "include" }));
    expect(screen.getByRole("button", { name: "Gasto" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Cuenta principal demo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("defaults to the first active account when the API has no last used account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ ...quickEntryOptions, lastUsedAccountId: null }))),
    );

    render(<QuickEntryPage onClose={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Cuenta operativa demo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("focuses amount after options load and shows a deterministic today label", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(quickEntryOptions))));

    render(<QuickEntryPage onClose={vi.fn()} />);

    expect(await screen.findByLabelText("Monto")).toHaveFocus();
    expect(screen.getByText("Hoy · 05-jul")).toBeInTheDocument();
  });

  it("shows Transferencia enviada as a GASTO category from API options", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(quickEntryOptions))));

    render(<QuickEntryPage onClose={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Transferencia enviada" })).toBeInTheDocument();
  });

  it("selects Préstamo and routes each loan action to the matching flow", async () => {
    const onLoanAction = vi.fn();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(quickEntryOptions))));

    render(<QuickEntryPage onClose={vi.fn()} onLoanAction={onLoanAction} />);
    await screen.findByRole("button", { name: "Guardar" });
    fireEvent.click(screen.getByRole("button", { name: "Préstamo" }));
    expect(screen.getByRole("button", { name: "Préstamo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Un préstamo no es gasto ni ingreso.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Entregar préstamo/ }));
    fireEvent.click(screen.getByRole("button", { name: /Registrar devolución/ }));
    expect(onLoanAction).toHaveBeenNthCalledWith(1, "create");
    expect(onLoanAction).toHaveBeenNthCalledWith(2, "repay");
  });

  it("preserves App navigation when QuickEntry opens a loan flow and returns to Dashboard", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user: { id: "user-1", email: "user@example.com" } }));
      if (url === "/api/quick-entry/options") return Promise.resolve(jsonResponse(quickEntryOptions));
      if (url === "/api/dashboard?month=2026-07") return Promise.resolve(jsonResponse(dashboardData));
      if (url === "/api/loans") return Promise.resolve(jsonResponse({ loans: [], summary: { pendingLoansTotal: 0, pendingLoansCount: 0 } }));
      if (url === "/api/accounts") return Promise.resolve(jsonResponse({ groups: [{ accounts: [] }], inactive: [] }));
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar movimiento" }));
    fireEvent.click(await screen.findByRole("button", { name: "Préstamo" }));
    fireEvent.click(screen.getByRole("button", { name: "Entregar préstamo" }));
    expect(await screen.findByRole("heading", { name: "Nuevo préstamo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dashboard" }));
    expect(await screen.findByText("Julio 2026")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/dashboard?month=2026-07").length).toBeGreaterThanOrEqual(2);
  });

  it("requires amount, account, and category before saving GASTO or INGRESO", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(quickEntryOptions))));

    render(<QuickEntryPage onClose={vi.fn()} />);

    const saveButton = await screen.findByRole("button", { name: "Guardar" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12500" } });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(saveButton).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Ingreso" }));
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Sueldo" }));
    expect(saveButton).toBeEnabled();
  });

  it("posts a valid GASTO payload, returns to dashboard, and refreshes dashboard data", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    const refreshedDashboardData: DashboardData = {
      ...dashboardData,
      availableToSpend: 332500,
      operativeBalance: 487500,
      pendingCommitmentsTotal: 155000,
      recentTransactions: [
        {
          id: "transaction-new",
          tipo: "GASTO",
          monto: 12500,
          descripcion: "Almuerzo equipo",
          fecha: "2026-07-05T00:00:00.000Z",
          displayDate: "05 jul",
          accountId: "account-primary",
          categoryId: "category-auto",
          transferId: null,
          account: { id: "account-primary", nombre: "Cuenta principal demo" },
          category: { id: "category-auto", nombre: "Auto", icono: "car" },
        },
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user: { id: "user-1", email: "user@example.com" } }));

      if (url === "/api/dashboard?month=2026-07") {
        const dashboardCalls = fetchMock.mock.calls.filter(([calledInput]) => String(calledInput) === url).length;
        return Promise.resolve(jsonResponse(dashboardCalls === 1 ? dashboardData : refreshedDashboardData));
      }

      if (url === "/api/quick-entry/options") {
        return Promise.resolve(jsonResponse(quickEntryOptions));
      }

      if (url === "/api/transactions" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ transactions: [] }, true, 201));
      }

      return Promise.resolve(jsonResponse({ message: "Not found" }, false, 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar movimiento" }));

    const saveButton = await screen.findByRole("button", { name: "Guardar" });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12.500" } });
    fireEvent.change(screen.getByPlaceholderText("Ej: almuerzo con..."), { target: { value: "  Almuerzo equipo  " } });
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));

    fireEvent.click(saveButton);

    await waitFor(() => expect(screen.getByText("Almuerzo equipo")).toBeInTheDocument());
    expect(screen.getByText("$332.500")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    const transactionCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/transactions");
    expect(transactionCall?.[1]).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String((transactionCall?.[1] as RequestInit).body))).toEqual({
      tipo: "GASTO",
      monto: 12500,
      accountId: "account-primary",
      categoryId: "category-auto",
      descripcion: "Almuerzo equipo",
      fecha: "2026-07-05",
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/dashboard?month=2026-07")).toHaveLength(2);
  });

  it("shows an error and keeps the form open when save fails", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(
        url === "/api/transactions"
          ? jsonResponse({ error: "Server error" }, false, 500)
          : jsonResponse(quickEntryOptions),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickEntryPage onClose={vi.fn()} />);

    const saveButton = await screen.findByRole("button", { name: "Guardar" });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12500" } });
    fireEvent.change(screen.getByPlaceholderText("Ej: almuerzo con..."), { target: { value: "Compra fallida" } });
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    fireEvent.click(saveButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar el movimiento. Inténtalo nuevamente.");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monto")).toHaveValue("12.500");
    expect(screen.getByPlaceholderText("Ej: almuerzo con...")).toHaveValue("Compra fallida");
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
  });

  it("posts a TRANSFERENCIA payload with from/to accounts and no categoryId", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    const onSaved = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/transactions" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ transactions: [] }, true, 201));
      }

      return Promise.resolve(jsonResponse(quickEntryOptions));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickEntryPage onClose={vi.fn()} onSaved={onSaved} />);

    const saveButton = await screen.findByRole("button", { name: "Guardar" });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "25000" } });
    fireEvent.click(screen.getByRole("button", { name: "Transferencia" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Hacia" })).getByRole("button", { name: "Cuenta ahorro demo" }));
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const transactionCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/transactions");
    const body = JSON.parse(String((transactionCall?.[1] as RequestInit).body));
    expect(body).toEqual({
      tipo: "TRANSFERENCIA",
      monto: 25000,
      fromAccountId: "account-primary",
      toAccountId: "account-savings",
      fecha: "2026-07-05",
    });
    expect(body).not.toHaveProperty("categoryId");
  });

  it("posts a valid INGRESO payload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    const onSaved = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/transactions" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ transactions: [] }, true, 201));
      }

      return Promise.resolve(jsonResponse(quickEntryOptions));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickEntryPage onClose={vi.fn()} onSaved={onSaved} />);

    const saveButton = await screen.findByRole("button", { name: "Guardar" });
    fireEvent.click(screen.getByRole("button", { name: "Ingreso" }));
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "950000" } });
    fireEvent.click(screen.getByRole("button", { name: "Cuenta operativa demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Sueldo" }));
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const transactionCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/transactions");
    expect(transactionCall?.[1]).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String((transactionCall?.[1] as RequestInit).body))).toEqual({
      tipo: "INGRESO",
      monto: 950000,
      accountId: "account-operativa",
      categoryId: "category-salary",
      fecha: "2026-07-05",
    });
  });

  it("disables Guardar while saving", async () => {
    let resolveTransaction: (response: Response) => void = () => undefined;
    const transactionResponse = new Promise<Response>((resolve) => {
      resolveTransaction = resolve;
    });
    const onSaved = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/transactions") {
        return transactionResponse;
      }

      return Promise.resolve(jsonResponse(quickEntryOptions));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickEntryPage onClose={vi.fn()} onSaved={onSaved} />);

    const saveButton = await screen.findByRole("button", { name: "Guardar" });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12500" } });
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    fireEvent.click(saveButton);

    expect(await screen.findByRole("button", { name: "Guardando..." })).toBeDisabled();

    resolveTransaction(jsonResponse({ transactions: [] }, true, 201));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("prevents duplicate transaction posts while the first save is pending", async () => {
    let resolveTransaction: (response: Response) => void = () => undefined;
    const transactionResponse = new Promise<Response>((resolve) => {
      resolveTransaction = resolve;
    });
    const onSaved = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/transactions") {
        return transactionResponse;
      }

      return Promise.resolve(jsonResponse(quickEntryOptions));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuickEntryPage onClose={vi.fn()} onSaved={onSaved} />);

    const saveButton = await screen.findByRole("button", { name: "Guardar" });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "12500" } });
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/transactions")).toHaveLength(1);

    resolveTransaction(jsonResponse({ transactions: [] }, true, 201));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("requires a destination account different from origin in transferencia mode", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(quickEntryOptions))));

    render(<QuickEntryPage onClose={vi.fn()} />);

    const saveButton = await screen.findByRole("button", { name: "Guardar" });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "25000" } });
    fireEvent.click(screen.getByRole("button", { name: "Transferencia" }));

    expect(saveButton).toBeDisabled();

    const destinationGroup = screen.getByRole("group", { name: "Hacia" });
    expect(within(destinationGroup).queryByRole("button", { name: "Cuenta principal demo" })).not.toBeInTheDocument();

    fireEvent.click(within(destinationGroup).getByRole("button", { name: "Cuenta ahorro demo" }));
    expect(saveButton).toBeEnabled();

    const originGroup = screen.getByRole("group", { name: "Desde" });
    fireEvent.click(within(originGroup).getByRole("button", { name: "Cuenta ahorro demo" }));
    expect(saveButton).toBeDisabled();
  });
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}
