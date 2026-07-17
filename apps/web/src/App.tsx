import { useEffect, useState } from "react";

import { AccountsPage } from "./AccountsPage";
import { CommitmentsPage } from "./CommitmentsPage";
import { DashboardPage } from "./DashboardPage";
import { GoalsPage } from "./GoalsPage";
import { MovementsPage } from "./MovementsPage";
import { QuickEntryPage } from "./QuickEntry";
import { AUTH_SESSION_EXPIRED_EVENT, advanceSessionEpoch, getSession, getSessionEpoch, logout, type AuthUser } from "./authClient";
import { LoginPage } from "./LoginPage";
import { LoansPage } from "./LoansPage";

export function App() {
  const [authState, setAuthState] = useState<{ status: "loading" } | { status: "bootstrap-error"; message: string } | { status: "authenticated"; user: AuthUser; logoutError?: string } | { status: "unauthenticated"; message?: string }>({ status: "loading" });
  const [logoutPending, setLogoutPending] = useState(false);
  const [screen, setScreen] = useState<"dashboard" | "quick-entry" | "movements" | "accounts" | "goals" | "commitments" | "loans">("dashboard");
  const [loanEntryMode, setLoanEntryMode] = useState<"list" | "create" | "repay">("list");
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    void getSession().then((user) => {
      if (mounted) {
        if (user) advanceSessionEpoch();
        setAuthState(user ? { status: "authenticated", user } : { status: "unauthenticated" });
      }
    }).catch(() => {
      if (mounted) setAuthState({ status: "bootstrap-error", message: "No se pudo comprobar la sesión. Verifica tu conexión e inténtalo nuevamente." });
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    function handleExpiredSession(event: Event) {
      const epoch = (event as CustomEvent<{ epoch?: number }>).detail?.epoch;
      if (epoch !== getSessionEpoch()) return;
      advanceSessionEpoch();
      setAuthState({ status: "unauthenticated", message: "Tu sesión expiró. Inicia sesión nuevamente." });
    }
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  if (authState.status === "loading") {
    return <div className="dashboard-status" role="status" aria-live="polite">Comprobando sesión...</div>;
  }

  if (authState.status === "bootstrap-error") {
    return <main className="auth-shell"><section className="auth-card" aria-labelledby="session-error-title"><h1 id="session-error-title">No se pudo comprobar la sesión</h1><p className="auth-description">{authState.message}</p><button className="auth-submit" type="button" onClick={() => { setAuthState({ status: "loading" }); void getSession().then((user) => { if (user) advanceSessionEpoch(); setAuthState(user ? { status: "authenticated", user } : { status: "unauthenticated" }); }).catch(() => setAuthState({ status: "bootstrap-error", message: "No se pudo comprobar la sesión. Verifica tu conexión e inténtalo nuevamente." })); }}>Reintentar</button></section></main>;
  }

  if (authState.status === "unauthenticated") {
    return <LoginPage message={authState.message} onSuccess={(user) => { advanceSessionEpoch(); setAuthState({ status: "authenticated", user }); }} />;
  }

  function returnToDashboard() {
    setDashboardRefreshKey((currentKey) => currentKey + 1);
    setScreen("dashboard");
  }

  function openLoans(mode: "list" | "create" | "repay" = "list") {
    setLoanEntryMode(mode);
    setScreen("loans");
  }

  async function handleLogout() {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await logout();
      advanceSessionEpoch();
      setAuthState({ status: "unauthenticated" });
    } catch (error) {
      setAuthState((currentState) => currentState.status === "authenticated" ? { ...currentState, logoutError: error instanceof Error ? error.message : "No se pudo confirmar el cierre de sesión. Tu sesión sigue activa." } : currentState);
    } finally {
      setLogoutPending(false);
    }
  }

  let content;
  if (screen === "quick-entry") {
    content = <QuickEntryPage onClose={() => setScreen("dashboard")} onSaved={returnToDashboard} onLoanAction={openLoans} />;
  } else if (screen === "loans") {
    content = <LoansPage initialMode={loanEntryMode} onNavigateDashboard={returnToDashboard} onNavigateMovements={() => setScreen("movements")} onNavigateAccounts={() => setScreen("accounts")} onNavigateGoals={() => setScreen("goals")} onNavigateCommitments={() => setScreen("commitments")} />;
  } else if (screen === "movements") {
    content = <MovementsPage onQuickEntry={() => setScreen("quick-entry")} onNavigateDashboard={() => setScreen("dashboard")} onNavigateAccounts={() => setScreen("accounts")} onNavigateGoals={() => setScreen("goals")} onNavigateCommitments={() => setScreen("commitments")} />;
  } else if (screen === "accounts") {
    content = <AccountsPage onQuickEntry={() => setScreen("quick-entry")} onNavigateDashboard={() => setScreen("dashboard")} onNavigateMovements={() => setScreen("movements")} onNavigateGoals={() => setScreen("goals")} onNavigateCommitments={() => setScreen("commitments")} />;
  } else if (screen === "goals") {
    content = <GoalsPage onQuickEntry={() => setScreen("quick-entry")} onNavigateDashboard={() => setScreen("dashboard")} onNavigateMovements={() => setScreen("movements")} onNavigateAccounts={() => setScreen("accounts")} onNavigateCommitments={() => setScreen("commitments")} />;
  } else if (screen === "commitments") {
    content = <CommitmentsPage onQuickEntry={() => setScreen("quick-entry")} onNavigateDashboard={() => setScreen("dashboard")} onNavigateMovements={() => setScreen("movements")} onNavigateAccounts={() => setScreen("accounts")} onNavigateGoals={() => setScreen("goals")} />;
  } else {
    content = <DashboardPage onQuickEntry={() => setScreen("quick-entry")} onNavigateMovements={() => setScreen("movements")} onNavigateAccounts={() => setScreen("accounts")} onNavigateGoals={() => setScreen("goals")} onNavigateCommitments={() => setScreen("commitments")} onNavigateLoans={() => openLoans()} refreshKey={dashboardRefreshKey} />;
  }

  return <div className="app-authenticated"><div className="app-auth-bar"><span>{authState.user.displayName ?? authState.user.email}</span>{authState.logoutError ? <span className="auth-bar-error" role="alert">{authState.logoutError}</span> : null}<button type="button" disabled={logoutPending} onClick={() => void handleLogout()}>{logoutPending ? "Cerrando sesión..." : "Cerrar sesión"}</button></div>{content}</div>;
}

export default App;
