import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountsPage } from "./AccountsPage";
import { App } from "./App";
import type { AccountsData } from "./accountTypes";
import type { DashboardData } from "./dashboardTypes";
import type { QuickEntryOptions } from "./QuickEntry";

const dashboardData: DashboardData = {
  currentMonthLabel: "Julio 2026",
  availableToSpend: 345000,
  liquidNetWorth: 1250000,
  liquidNetWorthVariation: 50000,
  monthlyIncome: 1200000,
  monthlyExpenses: 855000,
  goals: [],
  recentTransactions: [],
};

const accountsData: AccountsData = {
  groups: [
    {
      type: "OPERATIVA",
      label: "Operativa",
      accounts: [
        { id: "account-primary", nombre: "Cuenta operativa demo", tipo: "OPERATIVA", saldo: 450_200, activa: true, notas: null, hasHistory: true },
      ],
    },
    {
      type: "AHORRO",
      label: "Ahorro",
      accounts: [{ id: "account-demo-savings", nombre: "Cuenta ahorro demo", tipo: "AHORRO", saldo: 225_000, activa: true, notas: null, hasHistory: false }],
    },
    { type: "DEUDA", label: "Deuda", accounts: [] },
    { type: "RESERVA", label: "Reserva", accounts: [] },
  ],
  inactive: [],
};

const quickEntryOptions: QuickEntryOptions = {
  accounts: [{ id: "account-primary", nombre: "Cuenta operativa demo", tipo: "OPERATIVA" }],
  categories: {
    GASTO: [{ id: "category-delivery", nombre: "Delivery", icono: "bike" }],
    INGRESO: [{ id: "category-salary", nombre: "Sueldo", icono: "salary" }],
  },
  lastUsedAccountId: "account-primary",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountsPage", () => {
  it("opens from the dashboard bottom nav Cta item and renders accounts", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      return Promise.resolve(jsonResponse(url.includes("accounts") ? accountsData : dashboardData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Cta/ }));

    expect(await screen.findByRole("heading", { name: "Cuentas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cta/ })).toHaveClass("dashboard-nav-item--active");
    expect(screen.getByText("Operativa")).toBeInTheDocument();
    expect(screen.getByText("Cuenta operativa demo")).toBeInTheDocument();
    expect(screen.getByText("$450.200")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/accounts", expect.any(Object));
  });

  it("opens quick entry from the accounts FAB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("accounts")) {
          return Promise.resolve(jsonResponse(accountsData));
        }

        if (url.includes("quick-entry")) {
          return Promise.resolve(jsonResponse(quickEntryOptions));
        }

        return Promise.resolve(jsonResponse(dashboardData));
      }),
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Cta/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar movimiento" }));

    expect(await screen.findByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monto")).toBeInTheDocument();
  });

  it("opens account creation and submits valid data", async () => {
    const createdAccountsData: AccountsData = {
      ...accountsData,
      groups: accountsData.groups.map((group) =>
        group.type === "AHORRO"
          ? {
              ...group,
              accounts: [...group.accounts, { id: "account-savings", nombre: "Ahorro demo", tipo: "AHORRO", saldo: 150_000, activa: true, notas: null, hasHistory: false }],
            }
          : group,
      ),
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ account: { id: "account-savings" } }, true, 201));
      }

      const getAccountsCalls = fetchMock.mock.calls.filter(([callInput, callInit]) => String(callInput) === "/api/accounts" && callInit?.method !== "POST").length;

      return Promise.resolve(jsonResponse(getAccountsCalls > 1 ? createdAccountsData : accountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Crear cuenta" }));
    expect(screen.queryByRole("button", { name: "Agregar movimiento" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ahorro demo" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "AHORRO" } });
    fireEvent.change(screen.getByLabelText("Saldo inicial"), { target: { value: "150000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cuenta" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accounts",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Ahorro demo", type: "AHORRO", balance: 150000 }),
        }),
      );
    });
    expect(await screen.findByText("Ahorro demo")).toBeInTheDocument();
    expect(screen.getByText("Cuenta creada correctamente.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar cuenta" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar movimiento" })).toBeInTheDocument();
  });

  it("disables the account creation form while saving", async () => {
    const saveRequest = createDeferredResponse();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts" && init?.method === "POST") {
        return saveRequest.promise;
      }

      return Promise.resolve(jsonResponse(accountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Crear cuenta" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ahorro demo" } });
    fireEvent.change(screen.getByLabelText("Saldo inicial"), { target: { value: "150000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cuenta" }));

    expect(await screen.findByRole("button", { name: "Guardando..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByLabelText("Nombre")).toBeDisabled();

    saveRequest.resolve(jsonResponse({ account: { id: "account-savings" } }, true, 201));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Guardando..." })).not.toBeInTheDocument());
  });

  it("opens account editing with initial values and reloads the list after saving", async () => {
    const updatedAccountsData: AccountsData = {
      ...accountsData,
      groups: accountsData.groups.map((group) =>
        group.type === "OPERATIVA"
          ? {
              ...group,
              accounts: [{ id: "account-primary", nombre: "Cuenta operativa principal", tipo: "OPERATIVA", saldo: 460_000, activa: true, notas: null, hasHistory: true }],
            }
          : group,
      ),
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-primary" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ account: { id: "account-primary" } }));
      }

      const getAccountsCalls = fetchMock.mock.calls.filter(([callInput, callInit]) => String(callInput) === "/api/accounts" && callInit?.method !== "POST").length;

      return Promise.resolve(jsonResponse(getAccountsCalls > 1 ? updatedAccountsData : accountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta operativa demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Editar" }));

    expect(screen.getByRole("heading", { name: "Editar cuenta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar movimiento" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir acciones de Cuenta operativa demo" })).toHaveAttribute("aria-expanded", "false");
    expect(within(actionsMenu).queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Cuenta operativa demo");
    expect(screen.getByLabelText("Tipo")).toHaveValue("OPERATIVA");
    expect(screen.getByLabelText("Saldo actual")).toHaveValue(450_200);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Cuenta operativa principal" } });
    fireEvent.change(screen.getByLabelText("Saldo actual"), { target: { value: "460000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accounts/account-primary",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Cuenta operativa principal", type: "OPERATIVA", balance: 460000 }),
        }),
      );
    });
    expect(await screen.findByText("Cuenta operativa principal")).toBeInTheDocument();
    expect(screen.getByText("Cuenta actualizada correctamente.")).toBeInTheDocument();
    expect(screen.getByText("$460.000")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar movimiento" })).toBeInTheDocument();
  });

  it("keeps the account editor usable when updating fails", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-primary" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ message: "Server error" }, false, 500));
      }

      return Promise.resolve(jsonResponse(accountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta operativa demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Cuenta operativa principal" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("No se pudo actualizar la cuenta.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Editar cuenta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Cuenta operativa principal");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([callInput]) => String(callInput) === "/api/accounts")).toHaveLength(1);
  });

  it("disables the account edit form while saving and prevents duplicate updates", async () => {
    const saveRequest = createDeferredResponse();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-primary" && init?.method === "PATCH") {
        return saveRequest.promise;
      }

      return Promise.resolve(jsonResponse(accountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta operativa demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Cuenta operativa principal" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    const savingButton = await screen.findByRole("button", { name: "Guardando..." });
    expect(savingButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByLabelText("Nombre")).toBeDisabled();

    fireEvent.click(savingButton);
    expect(fetchMock.mock.calls.filter(([callInput]) => String(callInput) === "/api/accounts/account-primary")).toHaveLength(1);

    saveRequest.resolve(jsonResponse({ account: { id: "account-primary" } }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Guardando..." })).not.toBeInTheDocument());
  });

  it("confirms deactivation, reloads the list, and shows a deactivation message", async () => {
    const deactivatedAccountsData: AccountsData = {
      ...accountsData,
      groups: accountsData.groups.map((group) =>
        group.type === "OPERATIVA"
          ? { ...group, accounts: [] }
          : group,
      ),
      inactive: [{ id: "account-primary", nombre: "Cuenta operativa demo", tipo: "OPERATIVA", saldo: 450_200, activa: false, notas: null, hasHistory: true }],
    };
    const confirmMock = vi.fn(() => true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-primary/deactivate" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ account: { id: "account-primary", activa: false } }));
      }

      const getAccountsCalls = fetchMock.mock.calls.filter(([callInput, callInit]) => String(callInput) === "/api/accounts" && callInit?.method === undefined).length;

      return Promise.resolve(jsonResponse(getAccountsCalls > 1 ? deactivatedAccountsData : accountsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    expect(await screen.findByText("Desactivar conserva la cuenta y su historial. Eliminar definitivamente solo está disponible para cuentas sin historial.")).toBeInTheDocument();
    const actionsMenu = await openAccountActions("Cuenta operativa demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Desactivar" }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        "¿Quieres desactivar la cuenta Cuenta operativa demo? La cuenta y su historial se conservarán en Inactivas.",
      );
      expect(fetchMock).toHaveBeenCalledWith("/api/accounts/account-primary/deactivate", { method: "PATCH" });
    });
    expect(await screen.findByText("Cuenta desactivada correctamente.")).toBeInTheDocument();
    expect(await screen.findByText("Inactivas")).toBeInTheDocument();
    expect(screen.getByText("Desactivada")).toBeInTheDocument();
  });

  it("allows deactivation from the actions popover for active accounts without history", async () => {
    const deactivatedAccountsData: AccountsData = {
      ...accountsData,
      groups: accountsData.groups.map((group) =>
        group.type === "AHORRO"
          ? { ...group, accounts: [] }
          : group,
      ),
      inactive: [{ id: "account-demo-savings", nombre: "Cuenta ahorro demo", tipo: "AHORRO", saldo: 225_000, activa: false, notas: null, hasHistory: false }],
    };
    const confirmMock = vi.fn(() => true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-demo-savings/deactivate" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ account: { id: "account-demo-savings", activa: false } }));
      }

      const getAccountsCalls = fetchMock.mock.calls.filter(([callInput, callInit]) => String(callInput) === "/api/accounts" && callInit?.method === undefined).length;

      return Promise.resolve(jsonResponse(getAccountsCalls > 1 ? deactivatedAccountsData : accountsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta ahorro demo");

    expect(within(actionsMenu).getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    expect(within(actionsMenu).getByRole("button", { name: "Eliminar" })).toBeInTheDocument();

    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Desactivar" }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        "¿Quieres desactivar la cuenta Cuenta ahorro demo? La cuenta y su historial se conservarán en Inactivas.",
      );
      expect(fetchMock).toHaveBeenCalledWith("/api/accounts/account-demo-savings/deactivate", { method: "PATCH" });
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/accounts/account-demo-savings", { method: "DELETE" });
    expect(await screen.findByText("Cuenta desactivada correctamente.")).toBeInTheDocument();
    expect(await screen.findByText("Inactivas")).toBeInTheDocument();
    expect(screen.getByText("Desactivada")).toBeInTheDocument();
  });

  it("shows a deactivation error without reloading when the request fails", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-primary/deactivate" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ error: "Internal server error" }, false, 500));
      }

      return Promise.resolve(jsonResponse(accountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta operativa demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Desactivar" }));

    expect(await screen.findByText("No se pudo desactivar la cuenta.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([callInput]) => String(callInput) === "/api/accounts")).toHaveLength(1);
  });

  it("closes the popover and marks only the selected row as pending during deactivation", async () => {
    const deactivationRequest = createDeferredResponse();
    vi.stubGlobal("confirm", vi.fn(() => true));
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-primary/deactivate" && init?.method === "PATCH") {
        return deactivationRequest.promise;
      }

      return Promise.resolve(jsonResponse(accountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta operativa demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Desactivar" }));

    expect(await screen.findByText("Desactivando...")).toBeInTheDocument();
    expect(within(actionsMenu).queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir acciones de Cuenta operativa demo" })).toBeDisabled();
    expect(screen.getByText("Cuenta ahorro demo")).toBeInTheDocument();
    expect(screen.queryByText("Cargando cuentas...")).not.toBeInTheDocument();

    deactivationRequest.resolve(jsonResponse({ account: { id: "account-primary", activa: false } }));
    await waitFor(() => expect(screen.getByText("Cuenta desactivada correctamente.")).toBeInTheDocument());
  });

  it("shows destructive action errors with error styling", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-primary/deactivate" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ error: "Internal server error" }, false, 500));
      }

      return Promise.resolve(jsonResponse(accountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta operativa demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Desactivar" }));

    expect((await screen.findByText("No se pudo desactivar la cuenta.")).closest(".movements-status")).toHaveClass("accounts-status--error");
  });

  it("confirms physical delete only for active accounts without history", async () => {
    const deletedAccountsData: AccountsData = {
      ...accountsData,
      groups: accountsData.groups.map((group) =>
        group.type === "AHORRO"
          ? { ...group, accounts: [] }
          : group,
      ),
    };
    const confirmMock = vi.fn(() => true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-demo-savings" && init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ status: "deleted" }));
      }

      const getAccountsCalls = fetchMock.mock.calls.filter(([callInput, callInit]) => String(callInput) === "/api/accounts" && callInit?.method === undefined).length;

      return Promise.resolve(jsonResponse(getAccountsCalls > 1 ? deletedAccountsData : accountsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    expect(await screen.findByText("Cuenta operativa demo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    const actionsMenu = await openAccountActions("Cuenta ahorro demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith("¿Quieres eliminar definitivamente la cuenta Cuenta ahorro demo? Esta acción solo está disponible para cuentas sin historial.");
      expect(fetchMock).toHaveBeenCalledWith("/api/accounts/account-demo-savings", { method: "DELETE" });
    });
    expect(await screen.findByText("Cuenta eliminada definitivamente.")).toBeInTheDocument();
  });

  it("marks the selected row as pending during delete and prevents duplicate deletion", async () => {
    const deletionRequest = createDeferredResponse();
    const confirmMock = vi.fn(() => true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-demo-savings" && init?.method === "DELETE") {
        return deletionRequest.promise;
      }

      return Promise.resolve(jsonResponse(accountsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta ahorro demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText("Eliminando...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir acciones de Cuenta ahorro demo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Abrir acciones de Cuenta ahorro demo" }));
    expect(fetchMock.mock.calls.filter(([callInput, callInit]) => String(callInput) === "/api/accounts/account-demo-savings" && callInit?.method === "DELETE")).toHaveLength(1);

    deletionRequest.resolve(jsonResponse({ status: "deleted" }));
    await waitFor(() => expect(screen.getByText("Cuenta eliminada definitivamente.")).toBeInTheDocument());
  });

  it("renders loading while accounts load", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<AccountsPage />);

    expect(screen.getByText("Cargando cuentas...")).toBeInTheDocument();
  });

  it("renders an error when the accounts request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ message: "Server error" }, false, 500))));

    render(<AccountsPage />);

    expect(await screen.findByText("No se pudieron cargar las cuentas. Revisa tu conexión e inténtalo nuevamente.")).toBeInTheDocument();
  });

  it("renders inactive accounts in a separate section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            ...accountsData,
            inactive: [{ id: "account-demo-debt", nombre: "Cuenta deuda demo", tipo: "DEUDA", saldo: 0, activa: false, notas: null, hasHistory: true }],
          }),
        ),
      ),
    );

    render(<AccountsPage />);

    expect(await screen.findByText("Inactivas")).toBeInTheDocument();
    expect(screen.getByText("Las cuentas inactivas aparecen aquí y puedes reactivarlas cuando vuelvan a usarse.")).toBeInTheDocument();
    expect(screen.getByText("Cuenta deuda demo")).toBeInTheDocument();
    expect(screen.getByText("Desactivada")).toBeInTheDocument();
    const actionsMenu = await openAccountActions("Cuenta deuda demo");
    expect(within(actionsMenu).getByRole("button", { name: "Reactivar" })).toBeInTheDocument();
    expect(within(actionsMenu).queryByRole("button", { name: "Eliminar definitivamente" })).not.toBeInTheDocument();
  });

  it("reactivates an inactive account, reloads the list, and shows feedback", async () => {
    const inactiveAccountsData: AccountsData = {
      ...accountsData,
      inactive: [{ id: "account-demo-debt", nombre: "Cuenta deuda demo", tipo: "DEUDA", saldo: 0, activa: false, notas: null, hasHistory: true }],
    };
    const reactivatedAccountsData: AccountsData = {
      ...accountsData,
      groups: accountsData.groups.map((group) =>
        group.type === "DEUDA"
          ? { ...group, accounts: [{ id: "account-demo-debt", nombre: "Cuenta deuda demo", tipo: "DEUDA", saldo: 0, activa: true, notas: null, hasHistory: true }] }
          : group,
      ),
      inactive: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-demo-debt/reactivate" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ account: { id: "account-demo-debt", activa: true } }));
      }

      const getAccountsCalls = fetchMock.mock.calls.filter(([callInput, callInit]) => String(callInput) === "/api/accounts" && callInit?.method === undefined).length;

      return Promise.resolve(jsonResponse(getAccountsCalls > 1 ? reactivatedAccountsData : inactiveAccountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta deuda demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Reactivar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/accounts/account-demo-debt/reactivate", { method: "PATCH" });
    });
    expect(await screen.findByText("Cuenta reactivada correctamente.")).toBeInTheDocument();
    expect(await screen.findByText("Deuda")).toBeInTheDocument();
    expect(screen.getByText("Cuenta deuda demo")).toBeInTheDocument();
    expect(screen.queryByText("Desactivada")).not.toBeInTheDocument();
  });

  it("marks the selected row as pending during reactivation and prevents duplicate reactivation", async () => {
    const inactiveAccountsData: AccountsData = {
      ...accountsData,
      inactive: [{ id: "account-demo-debt", nombre: "Cuenta deuda demo", tipo: "DEUDA", saldo: 0, activa: false, notas: null, hasHistory: true }],
    };
    const reactivationRequest = createDeferredResponse();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-demo-debt/reactivate" && init?.method === "PATCH") {
        return reactivationRequest.promise;
      }

      return Promise.resolve(jsonResponse(inactiveAccountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta deuda demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Reactivar" }));

    expect(await screen.findByText("Reactivando...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir acciones de Cuenta deuda demo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Abrir acciones de Cuenta deuda demo" }));
    expect(fetchMock.mock.calls.filter(([callInput, callInit]) => String(callInput) === "/api/accounts/account-demo-debt/reactivate" && callInit?.method === "PATCH")).toHaveLength(1);

    reactivationRequest.resolve(jsonResponse({ account: { id: "account-demo-debt", activa: true } }));
    await waitFor(() => expect(screen.getByText("Cuenta reactivada correctamente.")).toBeInTheDocument());
  });

  it("allows definitive deletion for inactive accounts without history", async () => {
    const inactiveAccountsData: AccountsData = {
      ...accountsData,
      inactive: [{ id: "account-old", nombre: "Cuenta antigua", tipo: "RESERVA", saldo: 0, activa: false, notas: null, hasHistory: false }],
    };
    const deletedAccountsData: AccountsData = {
      ...accountsData,
      inactive: [],
    };
    const confirmMock = vi.fn(() => true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-old" && init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ status: "deleted" }));
      }

      const getAccountsCalls = fetchMock.mock.calls.filter(([callInput, callInit]) => String(callInput) === "/api/accounts" && callInit?.method === undefined).length;

      return Promise.resolve(jsonResponse(getAccountsCalls > 1 ? deletedAccountsData : inactiveAccountsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta antigua");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Eliminar definitivamente" }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith("¿Quieres eliminar definitivamente la cuenta Cuenta antigua? Esta acción solo está disponible para cuentas sin historial.");
      expect(fetchMock).toHaveBeenCalledWith("/api/accounts/account-old", { method: "DELETE" });
    });
    expect(await screen.findByText("Cuenta eliminada definitivamente.")).toBeInTheDocument();
  });

  it("shows a reactivation error without reloading when the request fails", async () => {
    const inactiveAccountsData: AccountsData = {
      ...accountsData,
      inactive: [{ id: "account-demo-debt", nombre: "Cuenta deuda demo", tipo: "DEUDA", saldo: 0, activa: false, notas: null, hasHistory: true }],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/accounts/account-demo-debt/reactivate" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ error: "Internal server error" }, false, 500));
      }

      return Promise.resolve(jsonResponse(inactiveAccountsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountsPage />);

    const actionsMenu = await openAccountActions("Cuenta deuda demo");
    fireEvent.click(within(actionsMenu).getByRole("button", { name: "Reactivar" }));

    expect(await screen.findByText("No se pudo reactivar la cuenta.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([callInput]) => String(callInput) === "/api/accounts")).toHaveLength(1);
    expect(screen.getByText("Cuenta deuda demo")).toBeInTheDocument();
    expect(screen.getByText("Desactivada")).toBeInTheDocument();
  });
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function createDeferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

async function openAccountActions(accountName: string) {
  const trigger = await screen.findByRole("button", { name: `Abrir acciones de ${accountName}` });

  fireEvent.click(trigger);

  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(trigger).not.toHaveAttribute("aria-haspopup");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();

  return trigger.closest(".accounts-actions-menu") as HTMLElement;
}
