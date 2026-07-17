import {
  ArrowLeftRight,
  CalendarClock,
  Bus,
  Car,
  Home,
  Plus,
  Receipt,
  ShoppingCart,
  Target,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";

import type { DashboardData, DashboardTransaction } from "./dashboardTypes";

type DashboardProps = {
  data: DashboardData;
  onQuickEntry?: () => void;
  onNavigateMovements?: () => void;
  onNavigateAccounts?: () => void;
  onNavigateGoals?: () => void;
  onNavigateCommitments?: () => void;
  onNavigateLoans?: () => void;
};

const NAV_ITEMS = [
  { key: "dashboard", label: "Dash", icon: Home },
  { key: "movements", label: "Mov", icon: Receipt },
  { key: "accounts", label: "Cta", icon: Wallet },
  { key: "goals", label: "Meta", icon: Target },
  { key: "commitments", label: "Compr", icon: CalendarClock },
];

const ICON_BY_CATEGORY: Record<string, JSX.Element> = {
  delivery: <UtensilsCrossed size={18} />,
  salary: <Wallet size={18} />,
  car: <Car size={18} />,
  home: <Home size={18} />,
  "shopping-cart": <ShoppingCart size={18} />,
  bus: <Bus size={18} />,
};

function formatCLP(amount: number, sign: "positive" | "negative" | "none" = "none") {
  const prefix = sign === "positive" ? "+" : sign === "negative" ? "-" : "";
  return `${prefix}$${Math.abs(amount).toLocaleString("es-CL")}`;
}

function getTransactionSign(transaction: DashboardTransaction) {
  if (transaction.tipo === "INGRESO") {
    return "positive" as const;
  }

  if (transaction.tipo === "GASTO") {
    return "negative" as const;
  }

  return "none" as const;
}

function getTransactionIcon(transaction: DashboardTransaction) {
  if (transaction.tipo === "TRANSFERENCIA") {
    return <ArrowLeftRight size={18} />;
  }

  const iconKey = transaction.category?.icono;
  return iconKey ? ICON_BY_CATEGORY[iconKey] ?? <Receipt size={18} /> : <Receipt size={18} />;
}

function formatVariation(amount: number) {
  if (amount === 0) {
    return formatCLP(amount);
  }

  return formatCLP(amount, amount > 0 ? "positive" : "negative");
}

export function Dashboard({ data, onQuickEntry, onNavigateMovements, onNavigateAccounts, onNavigateGoals, onNavigateCommitments, onNavigateLoans }: DashboardProps) {
  const netWorthVariationTone = data.liquidNetWorthVariation < 0 ? "negative" : "positive";

  return (
    <div className="dashboard-shell">
      <div className="dashboard-phone">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Finanzas</h1>
          <span className="dashboard-month">{data.currentMonthLabel}</span>
        </div>

        <div className="dashboard-card dashboard-card--hero">
          <p className="dashboard-eyebrow">Disponible operativo estimado</p>
          <p className="dashboard-hero-supporting-text">Después de reservar compromisos pendientes</p>
          <p className="dashboard-hero-amount">{formatCLP(data.availableToSpend)}</p>
          <p className="dashboard-hero-formula">Saldo operativo − compromisos pendientes = disponible operativo estimado</p>
          <dl className="dashboard-hero-breakdown">
            <div className="dashboard-hero-breakdown-row">
              <dt>Saldo operativo</dt>
              <dd>{formatCLP(data.operativeBalance)}</dd>
            </div>
            <div className="dashboard-hero-breakdown-row">
              <dt>Compromisos pendientes</dt>
              <dd>{formatCLP(data.pendingCommitmentsTotal)}</dd>
            </div>
          </dl>
        </div>

        <div className="dashboard-card dashboard-card--row">
          <div>
            <p className="dashboard-label">Patrimonio líquido</p>
            <p className="dashboard-net-worth">{formatCLP(data.liquidNetWorth)}</p>
          </div>
          <div className={`dashboard-pill dashboard-pill--${netWorthVariationTone}`}>
            <TrendingUp size={12} />
            {formatVariation(data.liquidNetWorthVariation)}
          </div>
        </div>

        <div className="dashboard-summary-grid">
          <div className="dashboard-card dashboard-card--summary">
            <p className="dashboard-label">Ingresos</p>
            <p className="dashboard-summary-amount">{formatCLP(data.monthlyIncome)}</p>
          </div>
          <div className="dashboard-card dashboard-card--summary">
            <p className="dashboard-label">Gastos</p>
            <p className="dashboard-summary-amount">{formatCLP(data.monthlyExpenses)}</p>
          </div>
        </div>

        <button type="button" className="dashboard-card dashboard-loans-card" onClick={onNavigateLoans}>
          <div><p className="dashboard-label">Por cobrar</p><p className="dashboard-loans-amount">{formatCLP(data.pendingLoansTotal ?? 0)} por cobrar</p><p className="dashboard-loans-support">{data.pendingLoansCount ? `${data.pendingLoansCount} préstamo${data.pendingLoansCount === 1 ? "" : "s"} pendiente${data.pendingLoansCount === 1 ? "" : "s"}` : "Sin préstamos pendientes"}</p></div>
          <span className="dashboard-link-button">Ver préstamos →</span>
        </button>

        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">Metas</h2>
            <button type="button" className="dashboard-link-button" onClick={onNavigateGoals}>
              Ver todas →
            </button>
          </div>
          <div className="dashboard-goal-list">
            {data.goals.map((goal) => {
              const progress =
                goal.montoObjetivo > 0 ? Math.min(100, Math.round((goal.account.saldo / goal.montoObjetivo) * 100)) : 0;

              return (
                <div key={goal.id} className="dashboard-card dashboard-goal-card">
                  <div className="dashboard-goal-header">
                    <span className="dashboard-goal-name">
                      {goal.emoji} {goal.nombre}
                    </span>
                    <span className="dashboard-goal-progress-label">{progress}%</span>
                  </div>
                  <div className="dashboard-progress-track" aria-hidden="true">
                    <div className="dashboard-progress-bar" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="dashboard-goal-amounts">
                    {formatCLP(goal.account.saldo)} / {formatCLP(goal.montoObjetivo)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <h2 className="dashboard-section-title">Últimos movimientos</h2>
            <button type="button" className="dashboard-link-button" onClick={onNavigateMovements}>
              Ver todos →
            </button>
          </div>
          <div className="dashboard-card dashboard-movement-list">
            {data.recentTransactions.map((transaction, index) => {
              const transactionSign = getTransactionSign(transaction);

              return (
                <div
                  key={transaction.id}
                  className={`dashboard-movement-row${index === 0 ? " dashboard-movement-row--first" : ""}`}
                >
                  <div className="dashboard-movement-icon">{getTransactionIcon(transaction)}</div>
                  <div className="dashboard-movement-copy">
                    <p className="dashboard-movement-title">{transaction.descripcion}</p>
                    <p className="dashboard-movement-meta">
                      {transaction.displayDate} · {transaction.account.nombre}
                    </p>
                  </div>
                  <p
                    className={`dashboard-movement-amount${transactionSign === "positive" ? " dashboard-movement-amount--positive" : ""}`}
                  >
                    {formatCLP(transaction.monto, transactionSign)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <button className="dashboard-fab" aria-label="Agregar movimiento" onClick={onQuickEntry}>
          <Plus size={26} />
        </button>

        <div className="dashboard-bottom-nav">
          <div className="dashboard-bottom-nav-inner">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === "dashboard";

              return (
                <button
                  key={item.key}
                  className={`dashboard-nav-item${isActive ? " dashboard-nav-item--active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={
                    item.key === "movements"
                      ? onNavigateMovements
                      : item.key === "accounts"
                        ? onNavigateAccounts
                        : item.key === "goals"
                          ? onNavigateGoals
                          : item.key === "commitments"
                            ? onNavigateCommitments
                            : undefined
                  }
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
