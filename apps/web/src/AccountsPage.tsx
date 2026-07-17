import { CalendarClock, CreditCard, Home, Landmark, MoreVertical, PiggyBank, Plus, Receipt, Shield, Target, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AccountGroup, AccountListItem, AccountType, AccountsData } from "./accountTypes";
import { AccountEditor, type AccountEditorValues } from "./components/AccountEditor";
import { authenticatedFetch } from "./authClient";

type AccountsPageState =
  | { status: "loading" }
  | { status: "success"; data: AccountsData }
  | { status: "error"; message: string };

type AccountAction = "deactivate" | "reactivate" | "delete";

type PendingAccountAction = {
  accountId: string;
  action: AccountAction;
} | null;

type AccountActionOptions = {
  account: AccountListItem;
  action: AccountAction;
  prepare?: () => boolean;
  request: () => Promise<Response>;
  successMessage: string;
  getErrorMessage: (response: Response) => string;
};

type AccountActionHandlers = {
  onEditAccount: (account: AccountListItem) => void;
  onDeactivateAccount: (account: AccountListItem) => void;
  onDeleteAccount: (account: AccountListItem) => void;
  onReactivateAccount: (account: AccountListItem) => void;
};

type AccountsContentProps = {
  data: AccountsData;
  pendingAccountAction: PendingAccountAction;
  actions: AccountActionHandlers;
};

type AccountGroupSectionProps = {
  group: AccountGroup;
  pendingAccountAction: PendingAccountAction;
  actions: AccountActionHandlers;
};

type AccountRowProps = {
  account: AccountListItem;
  isFirst: boolean;
  inactive?: boolean;
  pendingAccountAction: PendingAccountAction;
  actions: AccountActionHandlers;
};

type AccountsPageProps = {
  onQuickEntry?: () => void;
  onNavigateDashboard?: () => void;
  onNavigateMovements?: () => void;
  onNavigateGoals?: () => void;
  onNavigateCommitments?: () => void;
};

const ACCOUNTS_ENDPOINT = "/api/accounts";
const ACCOUNTS_LOAD_ERROR_MESSAGE = "No se pudieron cargar las cuentas. Revisa tu conexión e inténtalo nuevamente.";

export function AccountsPage({ onQuickEntry, onNavigateDashboard, onNavigateMovements, onNavigateGoals, onNavigateCommitments }: AccountsPageProps) {
  const [state, setState] = useState<AccountsPageState>({ status: "loading" });
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountListItem | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [removalMessage, setRemovalMessage] = useState<string | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [pendingAccountAction, setPendingAccountAction] = useState<PendingAccountAction>(null);
  const isAccountActionRunningRef = useRef(false);

  const loadAccounts = useCallback(async (signal?: AbortSignal, options: { preserveData?: boolean } = {}) => {
    if (!options.preserveData) {
      setState({ status: "loading" });
    }

    try {
      const response = await authenticatedFetch(ACCOUNTS_ENDPOINT, { signal });

      if (!response.ok) {
        throw new Error(`Accounts request failed with status ${response.status}.`);
      }

      setState({ status: "success", data: (await response.json()) as AccountsData });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return false;
      }

      if (options.preserveData) {
        setFeedbackError("No se pudo actualizar la lista de cuentas.");
        return false;
      }

      setState({ status: "error", message: ACCOUNTS_LOAD_ERROR_MESSAGE });
      return false;
    }
  }, []);

  const isAccountFormActive = isCreatingAccount || editingAccount !== null;

  useEffect(() => {
    const abortController = new AbortController();

    void loadAccounts(abortController.signal);

    return () => abortController.abort();
  }, [loadAccounts]);

  async function handleAccountSaved(successMessage: string) {
    setIsCreatingAccount(false);
    setEditingAccount(null);
    setFeedbackError(null);
    setRemovalError(null);
    setRemovalMessage(null);
    setFeedbackMessage(successMessage);
    await loadAccounts(undefined, { preserveData: true });
  }

  async function handleCreateAccount(values: AccountEditorValues) {
    const response = await authenticatedFetch(ACCOUNTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      throw new Error("No se pudo crear la cuenta.");
    }
  }

  async function handleUpdateAccount(accountId: string, values: AccountEditorValues) {
    const response = await authenticatedFetch(`${ACCOUNTS_ENDPOINT}/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      throw new Error("No se pudo actualizar la cuenta.");
    }
  }

  function clearAccountActionFeedback() {
    setFeedbackMessage(null);
    setFeedbackError(null);
    setRemovalError(null);
    setRemovalMessage(null);
  }

  async function runAccountAction({ account, action, prepare, request, successMessage, getErrorMessage }: AccountActionOptions) {
    if (isAccountActionRunningRef.current) {
      return;
    }

    isAccountActionRunningRef.current = true;
    clearAccountActionFeedback();

    if (prepare && !prepare()) {
      isAccountActionRunningRef.current = false;
      return;
    }

    setPendingAccountAction({ accountId: account.id, action });

    try {
      const response = await request();

      if (!response.ok) {
        setRemovalError(getErrorMessage(response));
        return;
      }

      setRemovalMessage(successMessage);
      await loadAccounts(undefined, { preserveData: true });
    } finally {
      isAccountActionRunningRef.current = false;
      setPendingAccountAction(null);
    }
  }

  async function handleDeactivateAccount(account: AccountListItem) {
    await runAccountAction({
      account,
      action: "deactivate",
      prepare: () => window.confirm(`¿Quieres desactivar la cuenta ${account.nombre}? La cuenta y su historial se conservarán en Inactivas.`),
      request: () => authenticatedFetch(`${ACCOUNTS_ENDPOINT}/${account.id}/deactivate`, { method: "PATCH" }),
      successMessage: "Cuenta desactivada correctamente.",
      getErrorMessage: () => "No se pudo desactivar la cuenta.",
    });
  }

  async function handleDeleteAccount(account: AccountListItem) {
    await runAccountAction({
      account,
      action: "delete",
      prepare: () => {
        if (account.hasHistory) {
          setRemovalError("Esta cuenta tiene historial. Desactívala para conservar sus movimientos.");
          return false;
        }

        return window.confirm(`¿Quieres eliminar definitivamente la cuenta ${account.nombre}? Esta acción solo está disponible para cuentas sin historial.`);
      },
      request: () => authenticatedFetch(`${ACCOUNTS_ENDPOINT}/${account.id}`, { method: "DELETE" }),
      successMessage: "Cuenta eliminada definitivamente.",
      getErrorMessage: (response) => response.status === 409 ? "Esta cuenta tiene historial. Desactívala para conservar sus movimientos." : "No se pudo eliminar la cuenta.",
    });
  }

  async function handleReactivateAccount(account: AccountListItem) {
    await runAccountAction({
      account,
      action: "reactivate",
      request: () => authenticatedFetch(`${ACCOUNTS_ENDPOINT}/${account.id}/reactivate`, { method: "PATCH" }),
      successMessage: "Cuenta reactivada correctamente.",
      getErrorMessage: () => "No se pudo reactivar la cuenta.",
    });
  }

  const accountActions: AccountActionHandlers = {
    onEditAccount: (account) => {
      clearAccountActionFeedback();
      setIsCreatingAccount(false);
      setEditingAccount(account);
    },
    onDeactivateAccount: handleDeactivateAccount,
    onDeleteAccount: handleDeleteAccount,
    onReactivateAccount: handleReactivateAccount,
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-phone accounts-phone">
        <div className="accounts-header">
          <h1 className="dashboard-title">Cuentas</h1>
          <button className="accounts-create-button" type="button" onClick={() => { setEditingAccount(null); setIsCreatingAccount(true); }}>
            Crear cuenta
          </button>
        </div>

        {isCreatingAccount ? <AccountEditor onCancel={() => setIsCreatingAccount(false)} onSubmit={handleCreateAccount} onSaved={() => handleAccountSaved("Cuenta creada correctamente.")} /> : null}
        {editingAccount ? (
          <AccountEditor
            key={editingAccount.id}
            mode="edit"
            initialValues={{ name: editingAccount.nombre, type: editingAccount.tipo, balance: editingAccount.saldo }}
            onCancel={() => setEditingAccount(null)}
            onSubmit={(values) => handleUpdateAccount(editingAccount.id, values)}
            onSaved={() => handleAccountSaved("Cuenta actualizada correctamente.")}
          />
        ) : null}

        {state.status === "loading" ? <AccountsStatus message="Cargando cuentas..." /> : null}
        {state.status === "error" ? <AccountsStatus message={state.message} /> : null}
        {feedbackMessage ? <AccountsStatus message={feedbackMessage} compact /> : null}
        {feedbackError ? <AccountsStatus message={feedbackError} compact tone="error" /> : null}
        {removalMessage ? <AccountsStatus message={removalMessage} /> : null}
        {removalError ? <AccountsStatus message={removalError} tone="error" /> : null}
        {state.status === "success" ? <AccountsContent data={state.data} pendingAccountAction={pendingAccountAction} actions={accountActions} /> : null}

        {!isAccountFormActive ? (
          <button className="dashboard-fab" aria-label="Agregar movimiento" onClick={onQuickEntry}>
            <Plus size={26} />
          </button>
        ) : null}

        <BottomNav onNavigateDashboard={onNavigateDashboard} onNavigateMovements={onNavigateMovements} onNavigateGoals={onNavigateGoals} onNavigateCommitments={onNavigateCommitments} />
      </div>
    </div>
  );
}

function AccountsContent({ data, pendingAccountAction, actions }: AccountsContentProps) {
  const visibleGroups = data.groups.filter((group) => group.accounts.length > 0);

  if (visibleGroups.length === 0 && data.inactive.length === 0) {
    return <AccountsStatus message="No hay cuentas registradas." />;
  }

  return (
    <div className="accounts-content">
      <div className="accounts-policy-notice" role="note">
        <div className="accounts-policy-icon" aria-hidden="true">
          <Shield size={18} />
        </div>
        <div>
          <p className="accounts-policy-title">Protección del historial financiero</p>
          <p className="accounts-policy-text">Desactivar conserva la cuenta y su historial. Eliminar definitivamente solo está disponible para cuentas sin historial.</p>
        </div>
      </div>
      {visibleGroups.map((group) => (
          <AccountGroupSection key={group.type} group={group} pendingAccountAction={pendingAccountAction} actions={actions} />
      ))}

      {data.inactive.length > 0 ? (
        <section className="accounts-group">
          <h2 className="accounts-group-label">Inactivas</h2>
          <p className="accounts-policy-text">Las cuentas inactivas aparecen aquí y puedes reactivarlas cuando vuelvan a usarse.</p>
          <div className="dashboard-card dashboard-movement-list accounts-list">
            {data.inactive.map((account, index) => (
              <AccountRow key={account.id} account={account} isFirst={index === 0} inactive pendingAccountAction={pendingAccountAction} actions={actions} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AccountGroupSection({ group, pendingAccountAction, actions }: AccountGroupSectionProps) {
  return (
    <section className="accounts-group">
      <h2 className="accounts-group-label">{group.label}</h2>
      <div className="dashboard-card dashboard-movement-list accounts-list">
        {group.accounts.map((account, index) => (
          <AccountRow key={account.id} account={account} isFirst={index === 0} pendingAccountAction={pendingAccountAction} actions={actions} />
        ))}
      </div>
    </section>
  );
}

function AccountRow({ account, isFirst, inactive = false, pendingAccountAction, actions }: AccountRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pendingAction = pendingAccountAction?.accountId === account.id ? pendingAccountAction.action : null;
  const isAnyActionPending = pendingAccountAction !== null;

  function handleMenuAction(action: () => void) {
    setIsMenuOpen(false);
    action();
  }

  return (
    <div className={`dashboard-movement-row${isFirst ? " dashboard-movement-row--first" : ""}${inactive ? " accounts-row--inactive" : ""}`}>
      <div className="dashboard-movement-icon">{getAccountIcon(account.tipo)}</div>
      <div className="dashboard-movement-copy">
        <p className="dashboard-movement-title">{account.nombre}</p>
        {pendingAction ? <p className="dashboard-movement-meta">{getPendingActionLabel(pendingAction)}</p> : inactive ? <p className="dashboard-movement-meta">Desactivada</p> : null}
      </div>
      <p className="dashboard-movement-amount">{formatCLP(account.saldo)}</p>
      <div className="accounts-actions-menu">
        <button className="accounts-actions-trigger" type="button" aria-label={`Abrir acciones de ${account.nombre}`} aria-expanded={isMenuOpen} disabled={isAnyActionPending} onClick={() => setIsMenuOpen((current) => !current)}>
          <MoreVertical size={18} aria-hidden="true" />
        </button>
        {isMenuOpen ? (
          <div className="accounts-actions-panel">
            <button className="accounts-actions-item accounts-actions-item--neutral" type="button" disabled={isAnyActionPending} onClick={() => handleMenuAction(() => actions.onEditAccount(account))}>
              Editar
            </button>
            {inactive ? (
              <>
                <button className="accounts-actions-item accounts-actions-item--success" type="button" disabled={isAnyActionPending} onClick={() => handleMenuAction(() => actions.onReactivateAccount(account))}>
                  Reactivar
                </button>
                {!account.hasHistory ? (
                  <button className="accounts-actions-item accounts-actions-item--danger" type="button" disabled={isAnyActionPending} onClick={() => handleMenuAction(() => actions.onDeleteAccount(account))}>
                    Eliminar definitivamente
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button className="accounts-actions-item accounts-actions-item--warning" type="button" disabled={isAnyActionPending} onClick={() => handleMenuAction(() => actions.onDeactivateAccount(account))}>
                  Desactivar
                </button>
                {!account.hasHistory ? (
                  <button className="accounts-actions-item accounts-actions-item--danger" type="button" disabled={isAnyActionPending} onClick={() => handleMenuAction(() => actions.onDeleteAccount(account))}>
                    Eliminar
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AccountsStatus({ message, compact = false, tone = "neutral" }: { message: string; compact?: boolean; tone?: "neutral" | "error" }) {
  return (
    <div className={`movements-status${compact ? " accounts-status--compact" : ""}${tone === "error" ? " accounts-status--error" : ""}`} role="status">
      <p>{message}</p>
    </div>
  );
}

function getPendingActionLabel(action: AccountAction) {
  if (action === "deactivate") {
    return "Desactivando...";
  }

  if (action === "reactivate") {
    return "Reactivando...";
  }

  return "Eliminando...";
}

function BottomNav({
  onNavigateDashboard,
  onNavigateMovements,
  onNavigateGoals,
  onNavigateCommitments,
}: {
  onNavigateDashboard?: () => void;
  onNavigateMovements?: () => void;
  onNavigateGoals?: () => void;
  onNavigateCommitments?: () => void;
}) {
  const navItems = useMemo(
    () => [
      { key: "dashboard", label: "Dash", icon: Home, onClick: onNavigateDashboard },
      { key: "movements", label: "Mov", icon: Receipt, onClick: onNavigateMovements },
      { key: "accounts", label: "Cta", icon: Wallet, onClick: undefined },
      { key: "goals", label: "Meta", icon: Target, onClick: onNavigateGoals },
      { key: "commitments", label: "Compr", icon: CalendarClock, onClick: onNavigateCommitments },
    ],
    [onNavigateDashboard, onNavigateMovements, onNavigateGoals, onNavigateCommitments],
  );

  return (
    <div className="dashboard-bottom-nav">
      <div className="dashboard-bottom-nav-inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={`dashboard-nav-item${item.key === "accounts" ? " dashboard-nav-item--active" : ""}`}
              onClick={item.onClick}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getAccountIcon(type: AccountType) {
  if (type === "AHORRO") {
    return <PiggyBank size={16} />;
  }

  if (type === "DEUDA") {
    return <CreditCard size={16} />;
  }

  if (type === "RESERVA") {
    return <Shield size={16} />;
  }

  return <Landmark size={16} />;
}

function formatCLP(amount: number) {
  return `$${amount.toLocaleString("es-CL")}`;
}

export default AccountsPage;
