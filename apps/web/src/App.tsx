import { useState } from "react";

import { AccountsPage } from "./AccountsPage";
import { CommitmentsPage } from "./CommitmentsPage";
import { DashboardPage } from "./DashboardPage";
import { GoalsPage } from "./GoalsPage";
import { MovementsPage } from "./MovementsPage";
import { QuickEntryPage } from "./QuickEntry";

export function App() {
  const [screen, setScreen] = useState<"dashboard" | "quick-entry" | "movements" | "accounts" | "goals" | "commitments">("dashboard");
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  function returnToDashboard() {
    setDashboardRefreshKey((currentKey) => currentKey + 1);
    setScreen("dashboard");
  }

  if (screen === "quick-entry") {
    return <QuickEntryPage onClose={() => setScreen("dashboard")} onSaved={returnToDashboard} />;
  }

  if (screen === "movements") {
    return (
      <MovementsPage
        onQuickEntry={() => setScreen("quick-entry")}
        onNavigateDashboard={() => setScreen("dashboard")}
        onNavigateAccounts={() => setScreen("accounts")}
        onNavigateGoals={() => setScreen("goals")}
        onNavigateCommitments={() => setScreen("commitments")}
      />
    );
  }

  if (screen === "accounts") {
    return (
      <AccountsPage
        onQuickEntry={() => setScreen("quick-entry")}
        onNavigateDashboard={() => setScreen("dashboard")}
        onNavigateMovements={() => setScreen("movements")}
        onNavigateGoals={() => setScreen("goals")}
        onNavigateCommitments={() => setScreen("commitments")}
      />
    );
  }

  if (screen === "goals") {
    return (
      <GoalsPage
        onQuickEntry={() => setScreen("quick-entry")}
        onNavigateDashboard={() => setScreen("dashboard")}
        onNavigateMovements={() => setScreen("movements")}
        onNavigateAccounts={() => setScreen("accounts")}
        onNavigateCommitments={() => setScreen("commitments")}
      />
    );
  }

  if (screen === "commitments") {
    return (
      <CommitmentsPage
        onQuickEntry={() => setScreen("quick-entry")}
        onNavigateDashboard={() => setScreen("dashboard")}
        onNavigateMovements={() => setScreen("movements")}
        onNavigateAccounts={() => setScreen("accounts")}
        onNavigateGoals={() => setScreen("goals")}
      />
    );
  }

  return (
    <DashboardPage
      onQuickEntry={() => setScreen("quick-entry")}
      onNavigateMovements={() => setScreen("movements")}
      onNavigateAccounts={() => setScreen("accounts")}
      onNavigateGoals={() => setScreen("goals")}
      onNavigateCommitments={() => setScreen("commitments")}
      refreshKey={dashboardRefreshKey}
    />
  );
}

export default App;
