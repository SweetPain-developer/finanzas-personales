import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { GoalsPage } from "./GoalsPage";
import type { AccountsData } from "./accountTypes";
import type { DashboardData } from "./dashboardTypes";
import type { GoalsData } from "./goalTypes";
import type { QuickEntryOptions } from "./QuickEntry";

const dashboardData: DashboardData = {
  currentMonthLabel: "Julio 2026",
  availableToSpend: 345000,
  operativeBalance: 500000,
  pendingCommitmentsTotal: 155000,
  liquidNetWorth: 1250000,
  liquidNetWorthVariation: 50000,
  monthlyIncome: 1200000,
  monthlyExpenses: 855000,
  goals: [],
  recentTransactions: [],
};

const goalsData: GoalsData = {
  groups: [
    {
      status: "ACTIVA",
      label: "Activas",
      goals: [
        {
          id: "goal-vacations",
          nombre: "Vacaciones",
          montoObjetivo: 654_321,
          estado: "ACTIVA",
          notas: null,
          account: { id: "account-demo-wallet", nombre: "Billetera Demo", saldo: 225_000 },
          progressPercent: 45,
        },
      ],
    },
    { status: "PAUSADA", label: "Pausadas", goals: [] },
    { status: "COMPLETADA", label: "Completadas", goals: [] },
  ],
};

const accountsData: AccountsData = {
  groups: [
    { type: "OPERATIVA", label: "Operativa", accounts: [] },
    { type: "AHORRO", label: "Ahorro", accounts: [{ id: "account-demo-wallet", nombre: "Billetera Demo", tipo: "AHORRO", saldo: 225_000, activa: true, notas: null, hasHistory: true }] },
    { type: "DEUDA", label: "Deuda", accounts: [] },
    { type: "RESERVA", label: "Reserva", accounts: [{ id: "account-demo-reserve", nombre: "Reserva Demo", tipo: "RESERVA", saldo: 350_000, activa: true, notas: null, hasHistory: true }] },
  ],
  inactive: [],
};

const quickEntryOptions: QuickEntryOptions = {
  accounts: [{ id: "account-demo-primary", nombre: "Cuenta Demo Principal", tipo: "OPERATIVA" }],
  categories: {
    GASTO: [{ id: "category-delivery", nombre: "Delivery", icono: "bike" }],
    INGRESO: [{ id: "category-salary", nombre: "Sueldo", icono: "salary" }],
  },
  lastUsedAccountId: "account-demo-primary",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GoalsPage", () => {
  it("opens from the dashboard bottom nav Meta item and renders goals", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user: { id: "user-1", email: "user@example.com" } }));

      if (url.includes("goals")) {
        return Promise.resolve(jsonResponse(goalsData));
      }

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      return Promise.resolve(jsonResponse(dashboardData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Meta/ }));

    expect(await screen.findByRole("heading", { name: "Metas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Meta/ })).toHaveClass("dashboard-nav-item--active");
    expect(screen.getByText("Vacaciones")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Cuenta: Billetera Demo")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("$225.000 / $654.321")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/goals", expect.objectContaining({ credentials: "include" }));
  });

  it("renders loading while goals load", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<GoalsPage />);

    expect(screen.getByText("Cargando metas...")).toBeInTheDocument();
  });

  it("renders an error when the goals request fails", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => String(input).includes("accounts") ? Promise.resolve(jsonResponse(accountsData)) : Promise.resolve(jsonResponse({ message: "Server error" }, false, 500))));

    render(<GoalsPage />);

    expect(await screen.findByText("No se pudieron cargar las metas y sus cuentas asociadas. Revisa tu conexión e inténtalo nuevamente.")).toBeInTheDocument();
  });

  it("renders an empty state when every goal group is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes("accounts")) {
          return Promise.resolve(jsonResponse(accountsData));
        }

        return Promise.resolve(
          jsonResponse({
            groups: [
              { status: "ACTIVA", label: "Activas", goals: [] },
              { status: "PAUSADA", label: "Pausadas", goals: [] },
              { status: "COMPLETADA", label: "Completadas", goals: [] },
            ],
          } satisfies GoalsData),
        );
      }),
    );

    render(<GoalsPage />);

    expect(await screen.findByText("No hay metas registradas.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Activas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pausadas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Completadas" })).not.toBeInTheDocument();
  });

  it("opens quick entry from the goals FAB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/session") return Promise.resolve(jsonResponse({ user: { id: "user-1", email: "user@example.com" } }));

        if (url.includes("goals")) {
          return Promise.resolve(jsonResponse(goalsData));
        }

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

    fireEvent.click(await screen.findByRole("button", { name: /Meta/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar movimiento" }));

    expect(await screen.findByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monto")).toBeInTheDocument();
  });

  it("creates a goal, reloads the list, and shows feedback", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("goals") && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ goal: goalsData.groups[0].goals[0] }, true, 201));
      }

      return Promise.resolve(jsonResponse(goalsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Crear meta" }));
    expect(screen.queryByRole("button", { name: "Agregar movimiento" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Auto" } });
    fireEvent.change(screen.getByLabelText("Monto objetivo"), { target: { value: "1000000" } });
    fireEvent.change(screen.getByLabelText("Cuenta asociada"), { target: { value: "account-demo-reserve" } });
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Ahorro inicial" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar meta" }));

    expect(await screen.findByText("Meta creada correctamente.")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/goals", expect.objectContaining({ method: "POST" })));
    expect(getJsonBody(fetchMock, "/api/goals", "POST")).toEqual({ name: "Auto", targetAmount: 1_000_000, accountId: "account-demo-reserve", notes: "Ahorro inicial" });
    expect(fetchMock).toHaveBeenCalledWith("/api/goals", expect.any(Object));
  });

  it("previews account-funded progress and warns when the selected account already completes the goal", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      return Promise.resolve(jsonResponse(goalsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Crear meta" }));
    expect(screen.getByText("Define el monto objetivo y asocia una cuenta de ahorro o reserva para medir el avance.")).toBeInTheDocument();
    expect(screen.getByText("Cómo se calcula el avance")).toBeInTheDocument();
    expect(screen.getByText("El monto objetivo es el total que quieres alcanzar.")).toBeInTheDocument();
    expect(screen.getByText("El avance actual se calcula automáticamente con el saldo actual de la cuenta asociada.")).toBeInTheDocument();
    expect(screen.getByText("Solo se muestran cuentas activas de ahorro o reserva.")).toBeInTheDocument();
    expect(screen.getByText("Para aumentar el avance, transfiere dinero a esa cuenta.")).toBeInTheDocument();
    expect(screen.getByText("Es el total que quieres alcanzar, no el monto ya ahorrado.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Monto objetivo"), { target: { value: "225000" } });

    expect(screen.getByText("Saldo actual de la cuenta: $225.000")).toBeInTheDocument();
    expect(screen.getByText("$225.000 / $225.000 · 100%")).toBeInTheDocument();
    expect(screen.getByText("Esta meta aparecerá completa porque la cuenta asociada ya tiene un saldo igual o mayor al monto objetivo.")).toBeInTheDocument();
  });

  it("edits a goal, reloads the list, and shows feedback", async () => {
    const goalsWithNotes: GoalsData = {
      groups: [
        {
          ...goalsData.groups[0],
          goals: [{ ...goalsData.groups[0].goals[0], notas: "Viaje demo" }],
        },
        ...goalsData.groups.slice(1),
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("/api/goals/goal-vacations") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ goal: { ...goalsWithNotes.groups[0].goals[0], nombre: "Vacaciones 2027" } }));
      }

      return Promise.resolve(jsonResponse(goalsWithNotes));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByText("Actualiza el monto objetivo. El avance actual se calcula con el saldo de la cuenta asociada.")).toBeInTheDocument();
    expect(screen.getByText("Para aumentar el avance, transfiere dinero a esa cuenta.")).toBeInTheDocument();
    expect(screen.getByLabelText("Notas")).toHaveValue("Viaje demo");
    expect(screen.getByText("Saldo actual de la cuenta: $225.000")).toBeInTheDocument();
    expect(screen.getByText("$225.000 / $654.321 · 34%")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Monto objetivo"), { target: { value: "200000" } });
    expect(screen.getByText("$225.000 / $200.000 · 100%")).toBeInTheDocument();
    expect(screen.getByText("Esta meta aparecerá completa porque la cuenta asociada ya tiene un saldo igual o mayor al monto objetivo.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Monto objetivo"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Vacaciones 2027" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Meta actualizada correctamente.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/goals/goal-vacations", expect.objectContaining({ method: "PATCH" }));
    expect(getJsonBody(fetchMock, "/api/goals/goal-vacations", "PATCH")).toEqual({ name: "Vacaciones 2027", targetAmount: 123_456, accountId: "account-demo-wallet", notes: "Viaje demo" });
  });

  it("clears goal notes when the notes field is emptied", async () => {
    const goalsWithNotes: GoalsData = {
      groups: [
        {
          ...goalsData.groups[0],
          goals: [{ ...goalsData.groups[0].goals[0], notas: "Viaje demo" }],
        },
        ...goalsData.groups.slice(1),
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("/api/goals/goal-vacations") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ goal: { ...goalsWithNotes.groups[0].goals[0], notas: null } }));
      }

      return Promise.resolve(jsonResponse(goalsWithNotes));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Meta actualizada correctamente.")).toBeInTheDocument();
    expect(getJsonBody(fetchMock, "/api/goals/goal-vacations", "PATCH")).toEqual({ name: "Vacaciones", targetAmount: 654_321, accountId: "account-demo-wallet", notes: null });
  });

  it("does not delete a goal when confirmation is cancelled", async () => {
    const confirmMock = vi.fn(() => false);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      return Promise.resolve(jsonResponse(goalsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Vacaciones" }));

    expect(confirmMock).toHaveBeenCalledWith("¿Eliminar la meta Vacaciones? Esta acción elimina solo la meta: no mueve ni elimina dinero de la cuenta Billetera Demo.");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/goals/goal-vacations", expect.objectContaining({ method: "DELETE" }));
  });

  it("deletes a goal, reloads the list, and shows feedback", async () => {
    const deletedGoalsData: GoalsData = {
      groups: [
        { status: "ACTIVA", label: "Activas", goals: [] },
        { status: "PAUSADA", label: "Pausadas", goals: [] },
        { status: "COMPLETADA", label: "Completadas", goals: [] },
      ],
    };
    let getGoalsCalls = 0;
    const confirmMock = vi.fn(() => true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("/api/goals/goal-vacations") && init?.method === "DELETE") {
        return Promise.resolve(noContentResponse());
      }

      getGoalsCalls += 1;
      return Promise.resolve(jsonResponse(getGoalsCalls > 1 ? deletedGoalsData : goalsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Vacaciones" }));

    expect(await screen.findByText("Meta eliminada correctamente. El dinero permanece en la cuenta asociada.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/goals/goal-vacations", expect.objectContaining({ method: "DELETE" }));
    expect(await screen.findByText("No hay metas registradas.")).toBeInTheDocument();
  });

  it("pauses an active goal, reloads the list, and shows feedback", async () => {
    const pausedGoalsData = goalsWithStatus("PAUSADA");
    let getGoalsCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("/api/goals/goal-vacations/status") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ goal: pausedGoalsData.groups[1].goals[0] }));
      }

      getGoalsCalls += 1;
      return Promise.resolve(jsonResponse(getGoalsCalls > 1 ? pausedGoalsData : goalsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Pausar" }));

    expect(await screen.findByText("Meta pausada correctamente.")).toBeInTheDocument();
    expect(getJsonBody(fetchMock, "/api/goals/goal-vacations/status", "PATCH")).toEqual({ status: "PAUSADA" });
    expect(await screen.findByRole("button", { name: "Reactivar" })).toBeInTheDocument();
  });

  it("shows Spanish error feedback and keeps the active goal visible when pausing fails", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("/api/goals/goal-vacations/status") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ error: "Meta no encontrada." }, false, 404));
      }

      return Promise.resolve(jsonResponse(goalsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Pausar" }));

    expect(await screen.findByText("No se pudo actualizar el estado de la meta. Actualiza la información e inténtalo nuevamente.")).toBeInTheDocument();
    expect(getJsonBody(fetchMock, "/api/goals/goal-vacations/status", "PATCH")).toEqual({ status: "PAUSADA" });
    expect(screen.getByText("Vacaciones")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Meta pausada correctamente.")).not.toBeInTheDocument();
  });

  it("reactivates a paused goal, reloads the list, and shows feedback", async () => {
    const pausedGoalsData = goalsWithStatus("PAUSADA");
    let getGoalsCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("/api/goals/goal-vacations/status") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ goal: goalsData.groups[0].goals[0] }));
      }

      getGoalsCalls += 1;
      return Promise.resolve(jsonResponse(getGoalsCalls > 1 ? goalsData : pausedGoalsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Reactivar" }));

    expect(await screen.findByText("Meta reactivada correctamente.")).toBeInTheDocument();
    expect(getJsonBody(fetchMock, "/api/goals/goal-vacations/status", "PATCH")).toEqual({ status: "ACTIVA" });
    expect(await screen.findByRole("button", { name: "Pausar" })).toBeInTheDocument();
  });

  it("completes an active goal after confirmation, reloads the list, and shows feedback", async () => {
    const completedGoalsData = goalsWithStatus("COMPLETADA");
    let getGoalsCalls = 0;
    const confirmMock = vi.fn(() => true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("/api/goals/goal-vacations/status") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ goal: completedGoalsData.groups[2].goals[0] }));
      }

      getGoalsCalls += 1;
      return Promise.resolve(jsonResponse(getGoalsCalls > 1 ? completedGoalsData : goalsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Completar" }));

    expect(confirmMock).toHaveBeenCalledWith("¿Completar la meta Vacaciones? El dinero permanece en la cuenta Billetera Demo; esta acción solo marca el objetivo como completado.");
    expect(await screen.findByText("Meta completada correctamente. El dinero permanece en la cuenta asociada.")).toBeInTheDocument();
    expect(getJsonBody(fetchMock, "/api/goals/goal-vacations/status", "PATCH")).toEqual({ status: "COMPLETADA" });
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivar" })).not.toBeInTheDocument();
  });

  it("does not complete an active goal when confirmation is cancelled", async () => {
    const confirmMock = vi.fn(() => false);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      return Promise.resolve(jsonResponse(goalsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Completar" }));

    expect(fetchMock).not.toHaveBeenCalledWith("/api/goals/goal-vacations/status", expect.objectContaining({ method: "PATCH" }));
  });

  it("does not show pause, reactivate, or complete actions for completed goals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes("accounts")) {
          return Promise.resolve(jsonResponse(accountsData));
        }

        return Promise.resolve(jsonResponse(goalsWithStatus("COMPLETADA")));
      }),
    );

    render(<GoalsPage />);

    expect(await screen.findByText("Completada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completar" })).not.toBeInTheDocument();
  });

  it("shows Spanish error feedback when deleting a goal fails", async () => {
    const confirmMock = vi.fn(() => true);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("/api/goals/goal-vacations") && init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ error: "Meta no encontrada." }, false, 404));
      }

      return Promise.resolve(jsonResponse(goalsData));
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Vacaciones" }));

    expect(await screen.findByText("No se pudo eliminar la meta. Actualiza la información e inténtalo nuevamente.")).toBeInTheDocument();
  });

  it("validates the goal form and shows API errors", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("accounts")) {
        return Promise.resolve(jsonResponse(accountsData));
      }

      if (url.includes("goals") && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ error: "Invalid account" }, false, 400));
      }

      return Promise.resolve(jsonResponse(goalsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<GoalsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Crear meta" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar meta" }));

    expect(screen.getByText("Ingresa un nombre para la meta.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Auto" } });
    fireEvent.change(screen.getByLabelText("Monto objetivo"), { target: { value: "1000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar meta" }));

    expect(await screen.findByText("No se pudo crear la meta.")).toBeInTheDocument();
  });
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    json: () => Promise.resolve(undefined),
  } as Response;
}

function getJsonBody(fetchMock: ReturnType<typeof vi.fn>, url: string, method: string) {
  const call = fetchMock.mock.calls.find(([input, init]) => String(input) === url && init?.method === method);

  if (!call) {
    throw new Error(`No ${method} request found for ${url}`);
  }

  return JSON.parse(call[1]?.body as string);
}

function goalsWithStatus(status: "ACTIVA" | "PAUSADA" | "COMPLETADA"): GoalsData {
  return {
    groups: goalsData.groups.map((group) => ({
      ...group,
      goals: group.status === status ? [{ ...goalsData.groups[0].goals[0], estado: status }] : [],
    })),
  };
}
