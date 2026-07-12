import { CalendarClock, Home, Plus, Receipt, Target, Wallet } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AccountListItem, AccountsData } from "./accountTypes";
import type { GoalEditorValues, GoalGroup, GoalListItem, GoalsData, GoalStatus } from "./goalTypes";

type GoalsPageState =
  | { status: "loading" }
  | { status: "success"; data: GoalsData; accountOptions: AccountListItem[] }
  | { status: "error"; message: string };

type GoalsPageProps = {
  onQuickEntry?: () => void;
  onNavigateDashboard?: () => void;
  onNavigateMovements?: () => void;
  onNavigateAccounts?: () => void;
  onNavigateCommitments?: () => void;
};

const GOALS_ENDPOINT = "/api/goals";
const ACCOUNTS_ENDPOINT = "/api/accounts";
const GOALS_LOAD_ERROR_MESSAGE = "No se pudieron cargar las metas y sus cuentas asociadas. Revisa tu conexión e inténtalo nuevamente.";

export function GoalsPage({ onQuickEntry, onNavigateDashboard, onNavigateMovements, onNavigateAccounts, onNavigateCommitments }: GoalsPageProps) {
  const [state, setState] = useState<GoalsPageState>({ status: "loading" });
  const [isCreatingGoal, setIsCreatingGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalListItem | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [updatingStatusGoalId, setUpdatingStatusGoalId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const loadGoals = useCallback(async (signal?: AbortSignal, options: { preserveData?: boolean } = {}) => {
    if (!options.preserveData) {
      setState({ status: "loading" });
    }

    try {
      const [goalsResponse, accountsResponse] = await Promise.all([
        fetch(GOALS_ENDPOINT, { signal }),
        fetch(ACCOUNTS_ENDPOINT, { signal }),
      ]);

      if (!goalsResponse.ok) {
        throw new Error(`Goals request failed with status ${goalsResponse.status}.`);
      }

      if (!accountsResponse.ok) {
        throw new Error(`Accounts request failed with status ${accountsResponse.status}.`);
      }

      const accountsData = (await accountsResponse.json()) as AccountsData;
      setState({
        status: "success",
        data: (await goalsResponse.json()) as GoalsData,
        accountOptions: getGoalAccountOptions(accountsData),
      });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return false;
      }

      if (options.preserveData) {
        setFeedbackError("No se pudo actualizar la lista de metas.");
        return false;
      }

      setState({ status: "error", message: GOALS_LOAD_ERROR_MESSAGE });
      return false;
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    void loadGoals(abortController.signal);

    return () => abortController.abort();
  }, [loadGoals]);

  async function handleCreateGoal(values: GoalEditorValues) {
    const response = await fetch(GOALS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      throw new Error("No se pudo crear la meta.");
    }
  }

  async function handleUpdateGoal(goalId: string, values: GoalEditorValues) {
    const response = await fetch(`${GOALS_ENDPOINT}/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      throw new Error("No se pudo actualizar la meta.");
    }
  }

  async function handleGoalSaved(successMessage: string) {
    setIsCreatingGoal(false);
    setEditingGoal(null);
    setFeedbackError(null);
    setFeedbackMessage(successMessage);
    await loadGoals(undefined, { preserveData: true });
  }

  async function handleDeleteGoal(goal: GoalListItem) {
    const confirmed = window.confirm(`¿Eliminar la meta ${goal.nombre}? Esta acción elimina solo la meta: no mueve ni elimina dinero de la cuenta ${goal.account.nombre}.`);

    if (!confirmed) {
      return;
    }

    setDeletingGoalId(goal.id);
    setFeedbackMessage(null);
    setFeedbackError(null);

    try {
      const response = await fetch(`${GOALS_ENDPOINT}/${goal.id}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(`Goal delete failed with status ${response.status}.`);
      }

      setIsCreatingGoal(false);
      setEditingGoal(null);
      setFeedbackMessage("Meta eliminada correctamente. El dinero permanece en la cuenta asociada.");
      await loadGoals(undefined, { preserveData: true });
    } catch (_error) {
      setFeedbackError("No se pudo eliminar la meta. Actualiza la información e inténtalo nuevamente.");
    } finally {
      setDeletingGoalId(null);
    }
  }

  async function handleUpdateGoalStatus(goal: GoalListItem, status: GoalStatus) {
    if (status === "COMPLETADA") {
      const confirmed = window.confirm(`¿Completar la meta ${goal.nombre}? El dinero permanece en la cuenta ${goal.account.nombre}; esta acción solo marca el objetivo como completado.`);

      if (!confirmed) {
        return;
      }
    }

    setUpdatingStatusGoalId(goal.id);
    setFeedbackMessage(null);
    setFeedbackError(null);

    try {
      const response = await fetch(`${GOALS_ENDPOINT}/${goal.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error(`Goal status update failed with status ${response.status}.`);
      }

      setIsCreatingGoal(false);
      setEditingGoal(null);
      setFeedbackMessage(getStatusSuccessMessage(status));
      await loadGoals(undefined, { preserveData: true });
    } catch (_error) {
      setFeedbackError("No se pudo actualizar el estado de la meta. Actualiza la información e inténtalo nuevamente.");
    } finally {
      setUpdatingStatusGoalId(null);
    }
  }

  const accountOptions = state.status === "success" ? state.accountOptions : [];
  const isGoalFormActive = isCreatingGoal || editingGoal !== null;

  return (
    <div className="dashboard-shell">
      <div className="dashboard-phone goals-phone">
        <div className="accounts-header">
          <h1 className="dashboard-title">Metas</h1>
          <button className="accounts-create-button" type="button" onClick={() => { setEditingGoal(null); setIsCreatingGoal(true); setFeedbackMessage(null); setFeedbackError(null); }}>
            Crear meta
          </button>
        </div>

        {isCreatingGoal ? <GoalEditor accountOptions={accountOptions} onCancel={() => setIsCreatingGoal(false)} onSubmit={handleCreateGoal} onSaved={() => handleGoalSaved("Meta creada correctamente.")} /> : null}
        {editingGoal ? (
          <GoalEditor
            key={editingGoal.id}
            mode="edit"
            accountOptions={accountOptions}
            initialValues={{ name: editingGoal.nombre, targetAmount: editingGoal.montoObjetivo, accountId: editingGoal.account.id, notes: editingGoal.notas }}
            onCancel={() => setEditingGoal(null)}
            onSubmit={(values) => handleUpdateGoal(editingGoal.id, values)}
            onSaved={() => handleGoalSaved("Meta actualizada correctamente.")}
          />
        ) : null}

        {state.status === "loading" ? <GoalsStatus message="Cargando metas..." /> : null}
        {state.status === "error" ? <GoalsStatus message={state.message} /> : null}
        {feedbackMessage ? <GoalsStatus message={feedbackMessage} compact /> : null}
        {feedbackError ? <GoalsStatus message={feedbackError} compact tone="error" /> : null}
        {state.status === "success" ? <GoalsContent data={state.data} deletingGoalId={deletingGoalId} updatingStatusGoalId={updatingStatusGoalId} onEditGoal={(goal) => { setIsCreatingGoal(false); setFeedbackMessage(null); setFeedbackError(null); setEditingGoal(goal); }} onDeleteGoal={handleDeleteGoal} onUpdateGoalStatus={handleUpdateGoalStatus} /> : null}

        {!isGoalFormActive ? (
          <button className="dashboard-fab" aria-label="Agregar movimiento" onClick={onQuickEntry}>
            <Plus size={26} />
          </button>
        ) : null}

        <BottomNav
          onNavigateDashboard={onNavigateDashboard}
          onNavigateMovements={onNavigateMovements}
          onNavigateAccounts={onNavigateAccounts}
          onNavigateCommitments={onNavigateCommitments}
        />
      </div>
    </div>
  );
}

function GoalsContent({ data, deletingGoalId, updatingStatusGoalId, onEditGoal, onDeleteGoal, onUpdateGoalStatus }: { data: GoalsData; deletingGoalId: string | null; updatingStatusGoalId: string | null; onEditGoal: (goal: GoalListItem) => void; onDeleteGoal: (goal: GoalListItem) => void; onUpdateGoalStatus: (goal: GoalListItem, status: GoalStatus) => void }) {
  const visibleGroups = data.groups.filter((group) => group.goals.length > 0);

  if (visibleGroups.length === 0) {
    return <GoalsStatus message="No hay metas registradas." />;
  }

  return (
    <div className="goals-content">
      {visibleGroups.map((group) => (
          <GoalGroupSection key={group.status} group={group} deletingGoalId={deletingGoalId} updatingStatusGoalId={updatingStatusGoalId} onEditGoal={onEditGoal} onDeleteGoal={onDeleteGoal} onUpdateGoalStatus={onUpdateGoalStatus} />
      ))}
    </div>
  );
}

function GoalGroupSection({ group, deletingGoalId, updatingStatusGoalId, onEditGoal, onDeleteGoal, onUpdateGoalStatus }: { group: GoalGroup; deletingGoalId: string | null; updatingStatusGoalId: string | null; onEditGoal: (goal: GoalListItem) => void; onDeleteGoal: (goal: GoalListItem) => void; onUpdateGoalStatus: (goal: GoalListItem, status: GoalStatus) => void }) {
  return (
    <section className="accounts-group">
      <h2 className="accounts-group-label">{group.label}</h2>
      <div className="goals-list">
        {group.goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} isDeleting={deletingGoalId === goal.id} isUpdatingStatus={updatingStatusGoalId === goal.id} onEditGoal={onEditGoal} onDeleteGoal={onDeleteGoal} onUpdateGoalStatus={onUpdateGoalStatus} />
        ))}
      </div>
    </section>
  );
}

function GoalCard({ goal, isDeleting, isUpdatingStatus, onEditGoal, onDeleteGoal, onUpdateGoalStatus }: { goal: GoalListItem; isDeleting: boolean; isUpdatingStatus: boolean; onEditGoal: (goal: GoalListItem) => void; onDeleteGoal: (goal: GoalListItem) => void; onUpdateGoalStatus: (goal: GoalListItem, status: GoalStatus) => void }) {
  const isBusy = isDeleting || isUpdatingStatus;

  return (
    <article className="dashboard-card dashboard-goal-card goals-card">
      <div className="dashboard-goal-header">
        <span className="dashboard-goal-name">{goal.nombre}</span>
        <span className="dashboard-goal-progress-label">{goal.progressPercent}%</span>
      </div>
      <p className="goals-status-label">{getStatusLabel(goal.estado)}</p>
      <div className="dashboard-progress-track" aria-label={`Progreso ${goal.progressPercent}%`}>
        <div className="dashboard-progress-bar" style={{ width: `${goal.progressPercent}%` }} />
      </div>
      <p className="dashboard-goal-amounts">
        {formatCLP(goal.account.saldo)} / {formatCLP(goal.montoObjetivo)}
      </p>
      <p className="goals-account">Cuenta: {goal.account.nombre}</p>
      <div className="goals-card-actions">
        {goal.estado === "ACTIVA" ? (
          <>
            <button className="app-action-button app-action-button--warning" type="button" onClick={() => onUpdateGoalStatus(goal, "PAUSADA")} disabled={isBusy}>
              {isUpdatingStatus ? "Actualizando..." : "Pausar"}
            </button>
            <button className="app-action-button app-action-button--success" type="button" onClick={() => onUpdateGoalStatus(goal, "COMPLETADA")} disabled={isBusy}>
              Completar
            </button>
          </>
        ) : null}
        {goal.estado === "PAUSADA" ? (
          <button className="app-action-button app-action-button--success" type="button" onClick={() => onUpdateGoalStatus(goal, "ACTIVA")} disabled={isBusy}>
            {isUpdatingStatus ? "Actualizando..." : "Reactivar"}
          </button>
        ) : null}
        <button className="app-action-button app-action-button--neutral goals-edit-button" type="button" onClick={() => onEditGoal(goal)} disabled={isBusy}>
          Editar
        </button>
        <button className="app-action-button app-action-button--danger" type="button" onClick={() => onDeleteGoal(goal)} disabled={isBusy} aria-label={`Eliminar ${goal.nombre}`}>
          {isDeleting ? "Eliminando..." : "Eliminar"}
        </button>
      </div>
    </article>
  );
}

function GoalEditor({ initialValues, mode = "create", accountOptions, onCancel, onSubmit, onSaved }: {
  initialValues?: GoalEditorValues;
  mode?: "create" | "edit";
  accountOptions: AccountListItem[];
  onCancel: () => void;
  onSubmit: (values: GoalEditorValues) => Promise<void>;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(String(initialValues?.targetAmount ?? ""));
  const [accountId, setAccountId] = useState(initialValues?.accountId ?? accountOptions[0]?.id ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const selectedAccount = accountOptions.find((account) => account.id === accountId);
  const numericTargetAmount = Number(targetAmount);
  const hasValidPreviewTarget = Number.isInteger(numericTargetAmount) && numericTargetAmount > 0;
  const progressPreviewPercent = selectedAccount && hasValidPreviewTarget ? calculateProgressPercent(selectedAccount.saldo, numericTargetAmount) : null;
  const willAppearComplete = selectedAccount && hasValidPreviewTarget && selectedAccount.saldo >= numericTargetAmount;
  const copy = mode === "edit"
    ? { title: "Editar meta", description: "Actualiza el monto objetivo. El avance actual se calcula con el saldo de la cuenta asociada.", submit: "Guardar cambios", submitError: "No se pudo actualizar la meta." }
    : { title: "Nueva meta", description: "Define el monto objetivo y asocia una cuenta de ahorro o reserva para medir el avance.", submit: "Guardar meta", submitError: "No se pudo crear la meta." };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingRef.current) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Ingresa un nombre para la meta.");
      return;
    }

    if (!Number.isInteger(numericTargetAmount) || numericTargetAmount <= 0) {
      setError("Ingresa un monto objetivo válido.");
      return;
    }

    if (!accountId) {
      setError("Selecciona una cuenta asociada.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      await onSubmit({ name: trimmedName, targetAmount: numericTargetAmount, accountId, notes: notes.trim() || null });
      await onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : copy.submitError);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form className="account-editor dashboard-card" onSubmit={handleSubmit}>
      <div className="account-editor-header">
        <div>
          <h2 className="account-editor-title">{copy.title}</h2>
          <p className="account-editor-description">{copy.description}</p>
        </div>
        <button className="commitments-secondary-button" type="button" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>

      {error ? <p className="quick-entry-error">{error}</p> : null}

      <label className="account-editor-field">
        Nombre
        <input className="quick-entry-text-input" value={name} onChange={(event) => setName(event.target.value)} disabled={saving} placeholder="Vacaciones" />
      </label>

      <label className="account-editor-field">
        Monto objetivo
        <input className="quick-entry-text-input" type="number" step="1" inputMode="numeric" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} disabled={saving} aria-label="Monto objetivo" aria-describedby="goal-target-help" />
        <span id="goal-target-help" className="account-editor-help">Es el total que quieres alcanzar, no el monto ya ahorrado.</span>
      </label>

      <label className="account-editor-field">
        Cuenta asociada
        <select className="quick-entry-text-input" value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={saving || accountOptions.length === 0}>
          <option value="">Selecciona una cuenta</option>
          {accountOptions.map((account) => (
            <option key={account.id} value={account.id}>
              {account.nombre} · saldo {formatCLP(account.saldo)}
            </option>
          ))}
        </select>
      </label>

      <div className="goal-progress-info">
        <p className="goal-progress-preview-title">Cómo se calcula el avance</p>
        <p>El monto objetivo es el total que quieres alcanzar.</p>
        <p>El avance actual se calcula automáticamente con el saldo actual de la cuenta asociada.</p>
        <p>Solo se muestran cuentas activas de ahorro o reserva.</p>
        <p>Para aumentar el avance, transfiere dinero a esa cuenta.</p>
      </div>

      {selectedAccount ? (
        <div className="goal-progress-preview" role="status" aria-live="polite">
          <p className="goal-progress-preview-title">Vista previa del avance</p>
          <p>Saldo actual de la cuenta: {formatCLP(selectedAccount.saldo)}</p>
          {progressPreviewPercent !== null ? (
            <>
              <div className="dashboard-progress-track" aria-label={`Avance estimado ${progressPreviewPercent}%`}>
                <div className="dashboard-progress-bar" style={{ width: `${progressPreviewPercent}%` }} />
              </div>
              <p>{formatCLP(selectedAccount.saldo)} / {formatCLP(numericTargetAmount)} · {progressPreviewPercent}%</p>
            </>
          ) : (
            <p>Ingresa un monto objetivo para calcular el avance.</p>
          )}
          {willAppearComplete ? (
            <p className="goal-progress-warning">Esta meta aparecerá completa porque la cuenta asociada ya tiene un saldo igual o mayor al monto objetivo.</p>
          ) : null}
        </div>
      ) : null}

      <label className="account-editor-field">
        Notas
        <textarea className="quick-entry-text-input" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={saving} placeholder="Opcional" />
      </label>

      {accountOptions.length === 0 ? <p className="account-editor-description">Crea o reactiva una cuenta de ahorro o reserva antes de registrar metas.</p> : null}

      <button className="commitments-confirm-button" type="submit" disabled={saving || accountOptions.length === 0}>
        {saving ? "Guardando..." : copy.submit}
      </button>
    </form>
  );
}

function GoalsStatus({ message, compact = false, tone = "neutral" }: { message: string; compact?: boolean; tone?: "neutral" | "error" }) {
  return (
    <div className={`movements-status${compact ? " accounts-status--compact" : ""}${tone === "error" ? " accounts-status--error" : ""}`} role="status">
      <p>{message}</p>
    </div>
  );
}

function getGoalAccountOptions(accountsData: AccountsData) {
  return accountsData.groups
    .flatMap((group) => group.accounts)
    .filter((account) => account.activa && (account.tipo === "AHORRO" || account.tipo === "RESERVA"));
}

function calculateProgressPercent(accountBalance: number, targetAmount: number) {
  if (targetAmount <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((accountBalance / targetAmount) * 100)));
}

function BottomNav({
  onNavigateDashboard,
  onNavigateMovements,
  onNavigateAccounts,
  onNavigateCommitments,
}: {
  onNavigateDashboard?: () => void;
  onNavigateMovements?: () => void;
  onNavigateAccounts?: () => void;
  onNavigateCommitments?: () => void;
}) {
  const navItems = useMemo(
    () => [
      { key: "dashboard", label: "Dash", icon: Home, onClick: onNavigateDashboard },
      { key: "movements", label: "Mov", icon: Receipt, onClick: onNavigateMovements },
      { key: "accounts", label: "Cta", icon: Wallet, onClick: onNavigateAccounts },
      { key: "goals", label: "Meta", icon: Target, onClick: undefined },
      { key: "commitments", label: "Compr", icon: CalendarClock, onClick: onNavigateCommitments },
    ],
    [onNavigateDashboard, onNavigateMovements, onNavigateAccounts, onNavigateCommitments],
  );

  return (
    <div className="dashboard-bottom-nav">
      <div className="dashboard-bottom-nav-inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.key} className={`dashboard-nav-item${item.key === "goals" ? " dashboard-nav-item--active" : ""}`} onClick={item.onClick}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getStatusLabel(status: GoalListItem["estado"]) {
  if (status === "PAUSADA") {
    return "Pausada";
  }

  if (status === "COMPLETADA") {
    return "Completada";
  }

  return "Activa";
}

function getStatusSuccessMessage(status: GoalStatus) {
  if (status === "PAUSADA") {
    return "Meta pausada correctamente.";
  }

  if (status === "COMPLETADA") {
    return "Meta completada correctamente. El dinero permanece en la cuenta asociada.";
  }

  return "Meta reactivada correctamente.";
}

function formatCLP(amount: number) {
  return `$${amount.toLocaleString("es-CL")}`;
}

export default GoalsPage;
