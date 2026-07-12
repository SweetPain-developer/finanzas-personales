import { useEffect, useState } from "react";

import { Dashboard } from "./Dashboard";
import type { DashboardData } from "./dashboardTypes";

type DashboardPageState =
  | { status: "loading" }
  | { status: "success"; data: DashboardData }
  | { status: "error"; message: string };

const DASHBOARD_ENDPOINT = "/api/dashboard?month=2026-07";

type DashboardPageProps = {
  onQuickEntry?: () => void;
  onNavigateMovements?: () => void;
  onNavigateAccounts?: () => void;
  onNavigateGoals?: () => void;
  onNavigateCommitments?: () => void;
  refreshKey?: number;
};

export function DashboardPage({ onQuickEntry, onNavigateMovements, onNavigateAccounts, onNavigateGoals, onNavigateCommitments, refreshKey = 0 }: DashboardPageProps) {
  const [state, setState] = useState<DashboardPageState>({ status: "loading" });

  useEffect(() => {
    const abortController = new AbortController();

    async function loadDashboardData() {
      try {
        const response = await fetch(DASHBOARD_ENDPOINT, { signal: abortController.signal });

        if (!response.ok) {
          throw new Error(`No se pudo cargar el dashboard. Código ${response.status}.`);
        }

        const data = (await response.json()) as DashboardData;
        setState({ status: "success", data });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "No se pudo cargar el dashboard.",
        });
      }
    }

    void loadDashboardData();

    return () => abortController.abort();
  }, [refreshKey]);

  if (state.status === "loading") {
    return <DashboardPageStatus message="Cargando dashboard..." />;
  }

  if (state.status === "error") {
    return <DashboardPageStatus message={state.message} />;
  }

  return (
    <Dashboard
      data={state.data}
      onQuickEntry={onQuickEntry}
      onNavigateMovements={onNavigateMovements}
      onNavigateAccounts={onNavigateAccounts}
      onNavigateGoals={onNavigateGoals}
      onNavigateCommitments={onNavigateCommitments}
    />
  );
}

function DashboardPageStatus({ message }: { message: string }) {
  return (
    <div className="dashboard-status">
      <p>{message}</p>
    </div>
  );
}

export default DashboardPage;
