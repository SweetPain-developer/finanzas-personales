import {
  ArrowLeft,
  ArrowLeftRight,
  Bus,
  CalendarClock,
  Car,
  Edit3,
  Home,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Target,
  Trash2,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { Movement, MovementsData } from "./movementTypes";
import { authenticatedFetch } from "./authClient";

type MovementsPageState =
  | { status: "loading" }
  | { status: "success"; data: MovementsData }
  | { status: "error"; message: string };

type MovementFilters = {
  month: string;
  accountId: string;
  categoryId: string;
  type: Movement["tipo"] | "";
  search: string;
};

type MovementsPageProps = {
  onQuickEntry?: () => void;
  onNavigateDashboard?: () => void;
  onNavigateAccounts?: () => void;
  onNavigateGoals?: () => void;
  onNavigateCommitments?: () => void;
};

const DEFAULT_FILTERS: MovementFilters = {
  month: "2026-07",
  accountId: "",
  categoryId: "",
  type: "",
  search: "",
};

const MONTH_OPTIONS = [
  { value: "2026-07", label: "Este mes" },
  { value: "2026-06", label: "Mes anterior" },
];

const ICON_BY_CATEGORY: Record<string, JSX.Element> = {
  delivery: <UtensilsCrossed size={16} />,
  salary: <Wallet size={16} />,
  car: <Car size={16} />,
  home: <Home size={16} />,
  "shopping-cart": <ShoppingCart size={16} />,
  bus: <Bus size={16} />,
};

export function MovementsPage({ onQuickEntry, onNavigateDashboard, onNavigateAccounts, onNavigateGoals, onNavigateCommitments }: MovementsPageProps) {
  const [filters, setFilters] = useState<MovementFilters>(DEFAULT_FILTERS);
  const [state, setState] = useState<MovementsPageState>({ status: "loading" });
  const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null);
  const selectedMovementRef = useRef<Movement | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    selectedMovementRef.current = selectedMovement;
  }, [selectedMovement]);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadMovements() {
      setState({ status: "loading" });

      try {
        const response = await authenticatedFetch(buildMovementsEndpoint(filters), { signal: abortController.signal });

        if (!response.ok) {
          throw new Error(`Movements request failed with status ${response.status}.`);
        }

        const nextData = (await response.json()) as MovementsData;
        setState({ status: "success", data: nextData });
        const currentMovement = selectedMovementRef.current;

        if (!currentMovement) {
          setSelectedMovement(null);
          return;
        }

        const updatedMovement = findMovement(nextData, currentMovement.id);

        if (!updatedMovement || !matchesVisibleFilters(updatedMovement, filters)) {
          setFeedback("Movimiento actualizado, pero ya no coincide con los filtros actuales.");
          setSelectedMovement(null);
          return;
        }

        setSelectedMovement(updatedMovement);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({ status: "error", message: "No pudimos cargar tus movimientos. Inténtalo nuevamente en unos minutos." });
      }
    }

    void loadMovements();

    return () => abortController.abort();
  }, [filters.month, filters.accountId, filters.categoryId, reloadKey]);

  const data = state.status === "success" ? state.data : null;
  const filteredData = useMemo(() => (data ? filterMovementsData(data, filters) : null), [data, filters]);
  const hasActiveFilters = Object.entries(filters).some(([filterName, value]) => value !== DEFAULT_FILTERS[filterName as keyof MovementFilters]);

  function updateFilter<K extends keyof MovementFilters>(filterName: K, value: MovementFilters[K]) {
    setSelectedMovement(null);
    setFeedback(null);
    setFilters((currentFilters) => ({ ...currentFilters, [filterName]: value }));
  }

  function reloadMovements(message?: string) {
    if (message) {
      setFeedback(message);
    }
    setReloadKey((currentKey) => currentKey + 1);
  }

  function handleMovementDeleted(message: string) {
    selectedMovementRef.current = null;
    setSelectedMovement(null);
    reloadMovements(message);
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-phone movements-phone">
        <div className="movements-header">
          <h1 className="dashboard-title">Movimientos</h1>
        </div>

        <label className="movements-search-label">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Buscar movimiento"
            aria-label="Buscar movimiento"
          />
        </label>

        <div className="movements-filters" aria-label="Filtros de movimientos">
          <label className="movements-filter-label">
            <span>Cuenta</span>
            <select value={filters.accountId} onChange={(event) => updateFilter("accountId", event.target.value)}>
              <option value="">Todas</option>
              {data?.filters.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="movements-filter-label">
            <span>Período</span>
            <select value={filters.month} onChange={(event) => updateFilter("month", event.target.value)}>
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>

          <label className="movements-filter-label">
            <span>Categoría</span>
            <select value={filters.categoryId} onChange={(event) => updateFilter("categoryId", event.target.value)}>
              <option value="">Todas</option>
              {data?.filters.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="movements-filter-label">
            <span>Tipo</span>
            <select value={filters.type} onChange={(event) => updateFilter("type", event.target.value as MovementFilters["type"])}>
              <option value="">Todos</option>
              <option value="INGRESO">Ingreso</option>
              <option value="GASTO">Gasto</option>
              <option value="TRANSFERENCIA">Transferencia</option>
            </select>
          </label>
        </div>

        {hasActiveFilters ? (
          <div className="movements-clear-row">
            <button
              className="app-action-button app-action-button--neutral"
              onClick={() => {
                setSelectedMovement(null);
                setFilters(DEFAULT_FILTERS);
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : null}

        {feedback ? <div className="movements-inline-status" role="status">{feedback}</div> : null}

        {selectedMovement && data ? (
          <MovementDetail movement={selectedMovement} data={data} onClose={() => setSelectedMovement(null)} onSaved={() => reloadMovements("Movimiento actualizado correctamente.")} onDeleted={handleMovementDeleted} />
        ) : (
          <>
            {state.status === "loading" ? <MovementsStatus message="Cargando movimientos..." /> : null}
            {state.status === "error" ? <MovementsStatus message={state.message} /> : null}
            {state.status === "success" && filteredData ? <MovementGroups data={filteredData} onSelectMovement={setSelectedMovement} /> : null}
          </>
        )}

        {!selectedMovement ? (
          <button className="dashboard-fab" aria-label="Agregar movimiento" onClick={onQuickEntry}>
            <Plus size={26} />
          </button>
        ) : null}

        <BottomNav onNavigateDashboard={onNavigateDashboard} onNavigateAccounts={onNavigateAccounts} onNavigateGoals={onNavigateGoals} onNavigateCommitments={onNavigateCommitments} />
      </div>
    </div>
  );
}

function MovementGroups({ data, onSelectMovement }: { data: MovementsData; onSelectMovement: (movement: Movement) => void }) {
  if (data.groups.length === 0) {
    return (
      <div className="movements-empty">
        <p>No hay movimientos con estos filtros.</p>
      </div>
    );
  }

  return (
    <div className="movements-group-list">
      {data.groups.map((group) => (
        <section key={group.date} className="movements-group">
          <h2 className="movements-group-label">{group.label}</h2>
          <div className="dashboard-card dashboard-movement-list">
            {group.movements.map((movement, index) => (
              <MovementRow key={movement.id} movement={movement} isFirst={index === 0} onSelect={() => onSelectMovement(movement)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MovementRow({ movement, isFirst, onSelect }: { movement: Movement; isFirst: boolean; onSelect: () => void }) {
  const isTransfer = movement.tipo === "TRANSFERENCIA";
  const title = isTransfer ? `${movement.fromAccount.nombre} → ${movement.toAccount.nombre}` : movement.descripcion;
  const meta = isTransfer ? "Transferencia" : movement.account.nombre;
  const sign = movement.tipo === "INGRESO" ? "positive" : "negative";

  return (
    <button className={`dashboard-movement-row${isFirst ? " dashboard-movement-row--first" : ""}`} onClick={onSelect} aria-label={`Ver detalle de ${title}`}>
      <span className="dashboard-movement-icon">{isTransfer ? <ArrowLeftRight size={16} /> : getMovementIcon(movement)}</span>
      <span className="dashboard-movement-copy">
        <span className="dashboard-movement-title">{title}</span>
        <span className="dashboard-movement-meta">{meta}</span>
      </span>
      <span className={`dashboard-movement-amount${sign === "positive" ? " dashboard-movement-amount--positive" : ""}`}>
        {formatCLP(movement.monto, sign)}
      </span>
    </button>
  );
}

function MovementDetail({ movement, data, onClose, onSaved, onDeleted }: { movement: Movement; data: MovementsData; onClose: () => void; onSaved: () => void; onDeleted: (message: string) => void }) {
  const isTransfer = movement.tipo === "TRANSFERENCIA";
  const sign = movement.tipo === "INGRESO" ? "positive" : "negative";
  const [isEditing, setIsEditing] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<{ tone: "info" | "error"; message: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(getDeleteConfirmationMessage(movement));

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setDeleteStatus({ tone: "info", message: "Eliminando movimiento..." });

    try {
      const response = await authenticatedFetch(`/api/movements/${movement.id}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(`Movement delete failed with status ${response.status}.`);
      }

      onDeleted(isTransfer ? "Transferencia eliminada correctamente." : "Movimiento eliminado correctamente.");
    } catch (_error) {
      setDeleteStatus({ tone: "error", message: "No pudimos eliminar el movimiento. Actualiza la información e inténtalo nuevamente." });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="movement-detail" aria-labelledby="movement-detail-title">
      <button className="movement-detail-back" onClick={onClose}>
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a movimientos
      </button>

      <div className="dashboard-card movement-detail-card">
        <p className="dashboard-eyebrow">Detalle del movimiento</p>
        <h2 id="movement-detail-title" className="movement-detail-title">
          {isTransfer ? `${movement.fromAccount.nombre} → ${movement.toAccount.nombre}` : movement.descripcion}
        </h2>
        <p className={`movement-detail-amount${sign === "positive" ? " movement-detail-amount--positive" : ""}`}>
          {formatCLP(movement.monto, sign)}
        </p>

        <dl className="movement-detail-list">
          <MovementDetailItem label="Tipo" value={formatMovementType(movement.tipo)} />
          <MovementDetailItem label="Fecha" value={formatMovementDate(movement.fecha)} />
          <MovementDetailItem label="Descripción" value={movement.descripcion} />
          {isTransfer ? (
            <>
              <MovementDetailItem label="Cuenta origen" value={movement.fromAccount.nombre} />
              <MovementDetailItem label="Cuenta destino" value={movement.toAccount.nombre} />
            </>
          ) : (
            <>
              <MovementDetailItem label="Cuenta" value={movement.account.nombre} />
              {movement.category ? <MovementDetailItem label="Categoría" value={movement.category.nombre} /> : null}
            </>
          )}
        </dl>

        <div className="movement-edit-actions">
          <button className="app-action-button app-action-button--neutral" onClick={() => setIsEditing(true)} disabled={isDeleting}>
            <Edit3 size={14} aria-hidden="true" />
            Editar
          </button>
          <button className="app-action-button app-action-button--danger" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 size={14} aria-hidden="true" />
            {isDeleting ? "Eliminando..." : "Eliminar"}
          </button>
        </div>

        {deleteStatus ? <p className={`movement-edit-status${deleteStatus.tone === "error" ? " movement-edit-status--error" : ""}`} role="status">{deleteStatus.message}</p> : null}
      </div>

      {isEditing && !isTransfer ? <MovementEditForm movement={movement} data={data} onCancel={() => setIsEditing(false)} onSaved={onSaved} /> : null}
      {isEditing && isTransfer ? <TransferEditForm movement={movement} data={data} onCancel={() => setIsEditing(false)} onSaved={onSaved} /> : null}
    </section>
  );
}

function getDeleteConfirmationMessage(movement: Movement) {
  if (movement.tipo === "TRANSFERENCIA") {
    return `¿Quieres eliminar esta transferencia entre ${movement.fromAccount.nombre} y ${movement.toAccount.nombre}? Se revertirá el saldo: se devolverá el monto a ${movement.fromAccount.nombre} y se descontará de ${movement.toAccount.nombre}.`;
  }

  return "¿Quieres eliminar este movimiento? Esta acción ajustará el saldo de la cuenta.";
}

function MovementEditForm({ movement, data, onCancel, onSaved }: { movement: Exclude<Movement, { tipo: "TRANSFERENCIA" }>; data: MovementsData; onCancel: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<"GASTO" | "INGRESO">(movement.tipo);
  const [monto, setMonto] = useState(String(movement.monto));
  const [fecha, setFecha] = useState(movement.fecha);
  const [descripcion, setDescripcion] = useState(movement.descripcion);
  const [accountId, setAccountId] = useState(movement.account.id);
  const [categoryId, setCategoryId] = useState(movement.category?.id ?? firstCategoryId(data, movement.tipo));
  const [status, setStatus] = useState<{ tone: "info" | "error"; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const categories = data.filters.categories.filter((category) => category.tipo === tipo);

  function updateType(nextType: "GASTO" | "INGRESO") {
    setTipo(nextType);
    setCategoryId(firstCategoryId(data, nextType));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus({ tone: "info", message: "Guardando movimiento..." });

    try {
      const response = await authenticatedFetch(`/api/movements/${movement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, monto: Number(monto), fecha, descripcion, accountId, categoryId }),
      });

      if (!response.ok) {
        throw new Error(`Movement update failed with status ${response.status}.`);
      }

      onSaved();
      onCancel();
    } catch (_error) {
      setStatus({ tone: "error", message: "No pudimos guardar el movimiento. Revisa los datos e inténtalo nuevamente." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="dashboard-card movement-edit-form" onSubmit={handleSubmit} aria-label="Editar movimiento">
      <label>
        <span>Tipo</span>
        <select value={tipo} onChange={(event) => updateType(event.target.value as "GASTO" | "INGRESO")}>
          <option value="GASTO">Gasto</option>
          <option value="INGRESO">Ingreso</option>
        </select>
      </label>

      <label>
        <span>Monto</span>
        <input type="number" min="1" step="1" value={monto} onChange={(event) => setMonto(event.target.value)} required />
      </label>

      <label>
        <span>Fecha</span>
        <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} required />
      </label>

      <label>
        <span>Descripción</span>
        <input value={descripcion} onChange={(event) => setDescripcion(event.target.value)} />
      </label>

      <label>
        <span>Cuenta</span>
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {data.filters.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.nombre}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Categoría</span>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.nombre}</option>
          ))}
        </select>
      </label>

      {status ? <p className={`movement-edit-status${status.tone === "error" ? " movement-edit-status--error" : ""}`} role="status">{status.message}</p> : null}

      <div className="movement-edit-actions">
        <button type="button" className="app-action-button app-action-button--neutral" onClick={onCancel} disabled={isSaving}>Cancelar</button>
        <button type="submit" className="movement-detail-edit-button" disabled={isSaving}>{isSaving ? "Guardando..." : "Guardar cambios"}</button>
      </div>
    </form>
  );
}

function TransferEditForm({ movement, data, onCancel, onSaved }: { movement: Extract<Movement, { tipo: "TRANSFERENCIA" }>; data: MovementsData; onCancel: () => void; onSaved: () => void }) {
  const [monto, setMonto] = useState(String(movement.monto));
  const [fecha, setFecha] = useState(movement.fecha);
  const [descripcion, setDescripcion] = useState(movement.descripcion);
  const [fromAccountId, setFromAccountId] = useState(movement.fromAccount.id);
  const [toAccountId, setToAccountId] = useState(movement.toAccount.id);
  const [status, setStatus] = useState<{ tone: "info" | "error"; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (fromAccountId === toAccountId) {
      setStatus({ tone: "error", message: "La cuenta origen y destino deben ser diferentes." });
      return;
    }

    setIsSaving(true);
    setStatus({ tone: "info", message: "Guardando transferencia..." });

    try {
      const response = await authenticatedFetch(`/api/movements/${movement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "TRANSFERENCIA", monto: Number(monto), fecha, descripcion, fromAccountId, toAccountId }),
      });

      if (!response.ok) {
        throw new Error(`Transfer update failed with status ${response.status}.`);
      }

      onSaved();
      onCancel();
    } catch (_error) {
      setStatus({ tone: "error", message: "No pudimos guardar la transferencia. Revisa los datos e inténtalo nuevamente." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="dashboard-card movement-edit-form" onSubmit={handleSubmit} aria-label="Editar transferencia">
      <label>
        <span>Monto</span>
        <input type="number" min="1" step="1" value={monto} onChange={(event) => setMonto(event.target.value)} required />
      </label>

      <label>
        <span>Fecha</span>
        <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} required />
      </label>

      <label>
        <span>Descripción</span>
        <input value={descripcion} onChange={(event) => setDescripcion(event.target.value)} />
      </label>

      <label>
        <span>Cuenta origen</span>
        <select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>
          {data.filters.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.nombre}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Cuenta destino</span>
        <select value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>
          {data.filters.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.nombre}</option>
          ))}
        </select>
      </label>

      {status ? <p className={`movement-edit-status${status.tone === "error" ? " movement-edit-status--error" : ""}`} role="status">{status.message}</p> : null}

      <div className="movement-edit-actions">
        <button type="button" className="app-action-button app-action-button--neutral" onClick={onCancel} disabled={isSaving}>Cancelar</button>
        <button type="submit" className="movement-detail-edit-button" disabled={isSaving}>{isSaving ? "Guardando..." : "Guardar cambios"}</button>
      </div>
    </form>
  );
}

function MovementDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="movement-detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MovementsStatus({ message }: { message: string }) {
  return (
    <div className="movements-status" role="status">
      <p>{message}</p>
    </div>
  );
}

function BottomNav({
  onNavigateDashboard,
  onNavigateAccounts,
  onNavigateGoals,
  onNavigateCommitments,
}: {
  onNavigateDashboard?: () => void;
  onNavigateAccounts?: () => void;
  onNavigateGoals?: () => void;
  onNavigateCommitments?: () => void;
}) {
  const navItems = useMemo(
    () => [
      { key: "dashboard", label: "Dash", icon: Home, onClick: onNavigateDashboard },
      { key: "movements", label: "Mov", icon: Receipt, onClick: undefined },
      { key: "accounts", label: "Cta", icon: Wallet, onClick: onNavigateAccounts },
      { key: "goals", label: "Meta", icon: Target, onClick: onNavigateGoals },
      { key: "commitments", label: "Compr", icon: CalendarClock, onClick: onNavigateCommitments },
    ],
    [onNavigateDashboard, onNavigateAccounts, onNavigateGoals, onNavigateCommitments],
  );

  return (
    <div className="dashboard-bottom-nav">
      <div className="dashboard-bottom-nav-inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={`dashboard-nav-item${item.key === "movements" ? " dashboard-nav-item--active" : ""}`}
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

function getMovementIcon(movement: Movement) {
  if (movement.tipo === "TRANSFERENCIA") {
    return <ArrowLeftRight size={16} />;
  }

  const iconKey = movement.category?.icono;
  return iconKey ? ICON_BY_CATEGORY[iconKey] ?? <Receipt size={16} /> : <Receipt size={16} />;
}

function buildMovementsEndpoint(filters: MovementFilters) {
  const query = new URLSearchParams({ month: filters.month });

  if (filters.accountId) {
    query.set("accountId", filters.accountId);
  }

  if (filters.categoryId) {
    query.set("categoryId", filters.categoryId);
  }

  return `/api/movements?${query.toString()}`;
}

function filterMovementsData(data: MovementsData, filters: MovementFilters): MovementsData {
  const searchTerm = normalizeSearch(filters.search);

  return {
    ...data,
    groups: data.groups
      .map((group) => ({
        ...group,
        movements: group.movements.filter((movement) => matchesType(movement, filters.type) && matchesSearch(movement, searchTerm)),
      }))
      .filter((group) => group.movements.length > 0),
  };
}

function findMovement(data: MovementsData, movementId: string) {
  return data.groups.flatMap((group) => group.movements).find((movement) => movement.id === movementId) ?? null;
}

function firstCategoryId(data: MovementsData, type: "GASTO" | "INGRESO") {
  return data.filters.categories.find((category) => category.tipo === type)?.id ?? "";
}

function matchesType(movement: Movement, type: MovementFilters["type"]) {
  return type === "" || movement.tipo === type;
}

function matchesSearch(movement: Movement, searchTerm: string) {
  if (searchTerm === "") {
    return true;
  }

  return getMovementSearchText(movement).includes(searchTerm);
}

function matchesVisibleFilters(movement: Movement, filters: MovementFilters) {
  return matchesType(movement, filters.type) && matchesSearch(movement, normalizeSearch(filters.search));
}

function getMovementSearchText(movement: Movement) {
  if (movement.tipo === "TRANSFERENCIA") {
    return normalizeSearch(`${movement.descripcion} ${movement.fromAccount.nombre} ${movement.toAccount.nombre}`);
  }

  return normalizeSearch(`${movement.descripcion} ${movement.account.nombre} ${movement.category?.nombre ?? ""}`);
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatMovementType(type: Movement["tipo"]) {
  const labels: Record<Movement["tipo"], string> = {
    INGRESO: "Ingreso",
    GASTO: "Gasto",
    TRANSFERENCIA: "Transferencia",
  };

  return labels[type];
}

function formatMovementDate(date: string) {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00.000Z`))
    .replace(".", "");
}

function formatCLP(amount: number, sign: "positive" | "negative") {
  const prefix = sign === "positive" ? "+" : "-";
  return `${prefix}$${Math.abs(amount).toLocaleString("es-CL")}`;
}

export default MovementsPage;
