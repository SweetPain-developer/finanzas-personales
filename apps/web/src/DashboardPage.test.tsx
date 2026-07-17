import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dashboard } from "./Dashboard";
import { DashboardPage } from "./DashboardPage";
import type { DashboardData } from "./dashboardTypes";

const dashboardData: DashboardData = {
  currentMonthLabel: "Julio 2026",
  availableToSpend: 345000,
  operativeBalance: 500000,
  pendingCommitmentsTotal: 155000,
  liquidNetWorth: 1250000,
  liquidNetWorthVariation: 50000,
  monthlyIncome: 1200000,
  monthlyExpenses: 855000,
  goals: [
    {
      id: "goal-1",
      nombre: "Emergency fund",
      montoObjetivo: 1000000,
      estado: "ACTIVA",
      accountId: "account-10",
      emoji: "🛟",
      account: {
        id: "account-10",
        nombre: "Savings",
        saldo: 250000,
      },
    },
  ],
  recentTransactions: [
    {
      id: "transaction-20",
      tipo: "INGRESO",
      monto: 1200000,
      descripcion: "Salary",
      fecha: "2026-07-01T00:00:00.000Z",
      displayDate: "01 jul",
      accountId: "account-1",
      categoryId: "category-2",
      transferId: null,
      account: {
        id: "account-1",
        nombre: "Checking",
      },
      category: {
        id: "category-2",
        nombre: "Salary",
        icono: "salary",
      },
    },
  ],
  pendingLoansTotal: 90000,
  pendingLoansCount: 2,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DashboardPage", () => {
  it("renders loading initially", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<DashboardPage />);

    expect(screen.getByText("Cargando dashboard...")).toBeInTheDocument();
  });

  it("fetches the July 2026 dashboard API endpoint", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(dashboardData)));
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/dashboard?month=2026-07", expect.objectContaining({ credentials: "include" })));
  });

  it("renders an error when the dashboard request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ message: "Server error" }, false, 500))));

    render(<DashboardPage />);

    expect(await screen.findByText("No se pudo cargar el dashboard. Código 500.")).toBeInTheDocument();
  });

  it("renders API dashboard data through Dashboard after a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(dashboardData))));

    render(<DashboardPage />);

    expect(await screen.findByText("Julio 2026")).toBeInTheDocument();
    expect(screen.getByText("$345.000")).toBeInTheDocument();
    expect(screen.getByText("🛟 Emergency fund")).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("01 jul · Checking")).toBeInTheDocument();
  });

  it("renders the Por cobrar card with count and total and navigates to Loans without changing other metrics", () => {
    const onNavigateLoans = vi.fn();
    render(<Dashboard data={dashboardData} onNavigateLoans={onNavigateLoans} />);

    const loansCard = screen.getByRole("button", { name: /Por cobrar/ });
    expect(within(loansCard).getByText("$90.000 por cobrar")).toBeInTheDocument();
    expect(within(loansCard).getByText("2 préstamos pendientes")).toBeInTheDocument();
    expect(screen.getByText("$345.000")).toBeInTheDocument();
    expect(screen.getByText("$500.000")).toBeInTheDocument();
    expect(screen.getByText("$1.250.000")).toBeInTheDocument();
    fireEvent.click(loansCard);
    expect(onNavigateLoans).toHaveBeenCalledTimes(1);
  });

  it("renders $0 and the empty loan state while preserving the other dashboard metrics", () => {
    render(<Dashboard data={{ ...dashboardData, pendingLoansTotal: 0, pendingLoansCount: 0 }} />);

    const loansCard = screen.getByRole("button", { name: /Por cobrar/ });
    expect(within(loansCard).getByText("$0 por cobrar")).toBeInTheDocument();
    expect(within(loansCard).getByText("Sin préstamos pendientes")).toBeInTheDocument();
    expect(screen.getByText("$855.000")).toBeInTheDocument();
    expect(screen.getByText("$1.200.000")).toBeInTheDocument();
    expect(screen.getByText("$1.250.000")).toBeInTheDocument();
  });

  it("renders the operational estimate breakdown and keeps the final calculation consistent", () => {
    render(<Dashboard data={dashboardData} />);

    const estimateCard = screen.getByText("Disponible operativo estimado").closest<HTMLElement>(".dashboard-card")!;

    expect(within(estimateCard).getByText("Después de reservar compromisos pendientes")).toBeInTheDocument();
    expect(within(estimateCard).getByText("Saldo operativo − compromisos pendientes = disponible operativo estimado")).toBeInTheDocument();
    expect(within(estimateCard).getByText("Saldo operativo")).toBeInTheDocument();
    expect(within(estimateCard).getByText("$500.000")).toBeInTheDocument();
    expect(within(estimateCard).getByText("Compromisos pendientes")).toBeInTheDocument();
    expect(within(estimateCard).getByText("$155.000")).toBeInTheDocument();
    expect(within(estimateCard).getByText("$345.000")).toBeInTheDocument();
  });

  it("renders zero net worth variation without a plus sign", () => {
    render(<Dashboard data={{ ...dashboardData, liquidNetWorthVariation: 0 }} />);

    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.queryByText("+$0")).not.toBeInTheDocument();
  });

  it("marks the Dashboard bottom navigation item as the current page", () => {
    render(<Dashboard data={dashboardData} />);

    expect(screen.getByRole("button", { name: "Dash" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Mov" })).not.toHaveAttribute("aria-current");
  });

  it("renders a transfer recent movement without income or expense sign", () => {
    render(
      <Dashboard
        data={{
          ...dashboardData,
          recentTransactions: [
            {
              id: "transfer-1",
              tipo: "TRANSFERENCIA",
              monto: 50_000,
              descripcion: "Transferencia",
              fecha: "2026-07-05T12:00:00.000Z",
              displayDate: "05 jul",
              accountId: "account-1",
              categoryId: null,
              transferId: "transfer-1",
              account: { id: "account-1", nombre: "Checking → Savings" },
              category: null,
            },
          ],
        }}
      />,
    );

    const recentMovements = screen.getByRole("heading", { name: "Últimos movimientos" }).closest("section")!;

    expect(within(recentMovements).getByText("Transferencia")).toBeInTheDocument();
    expect(within(recentMovements).getByText("05 jul · Checking → Savings")).toBeInTheDocument();
    expect(within(recentMovements).getByText("$50.000")).toBeInTheDocument();
    expect(within(recentMovements).queryByText("-$50.000")).not.toBeInTheDocument();
    expect(within(recentMovements).queryByText("+$50.000")).not.toBeInTheDocument();
  });

  it("navigates to goals from the goals see-all control", () => {
    const onNavigateGoals = vi.fn();

    render(<Dashboard data={dashboardData} onNavigateGoals={onNavigateGoals} />);

    fireEvent.click(
      within(screen.getByRole("heading", { name: "Metas" }).closest("section")!).getByRole("button", {
        name: "Ver todas →",
      }),
    );

    expect(onNavigateGoals).toHaveBeenCalledTimes(1);
  });

  it("navigates to movements from the recent movements see-all control", () => {
    const onNavigateMovements = vi.fn();

    render(<Dashboard data={dashboardData} onNavigateMovements={onNavigateMovements} />);

    fireEvent.click(
      within(screen.getByRole("heading", { name: "Últimos movimientos" }).closest("section")!).getByRole("button", {
        name: "Ver todos →",
      }),
    );

    expect(onNavigateMovements).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}
