import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Bike,
  Car,
  Check,
  Gamepad2,
  HeartPulse,
  MoreHorizontal,
  Repeat,
  Users,
  Utensils,
  Wallet,
  X,
  Zap,
} from "lucide-react";

type MovementType = "GASTO" | "INGRESO" | "TRANSFERENCIA";

type Account = {
  id: string;
  nombre: string;
  tipo: string;
};

type Category = {
  id: string;
  nombre: string;
  icono: string;
};

export type QuickEntryOptions = {
  accounts: Account[];
  categories: {
    GASTO: Category[];
    INGRESO: Category[];
  };
  lastUsedAccountId: string | null;
};

type QuickEntryPageState =
  | { status: "loading" }
  | { status: "success"; options: QuickEntryOptions }
  | { status: "error"; message: string };

type QuickEntryPageProps = {
  onClose: () => void;
  onSaved?: () => void;
};

const QUICK_ENTRY_OPTIONS_ENDPOINT = "/api/quick-entry/options";
const TRANSACTIONS_ENDPOINT = "/api/transactions";
const QUICK_ENTRY_OPTIONS_ERROR_MESSAGE = "No se pudieron cargar las opciones para registrar el movimiento. Revisa tu conexión e inténtalo nuevamente.";

const ICONS: Record<string, typeof Car> = {
  arrowDownLeft: ArrowDownLeft,
  arrowUpRight: ArrowUpRight,
  banknote: Banknote,
  bike: Bike,
  car: Car,
  gamepad: Gamepad2,
  heartPulse: HeartPulse,
  more: MoreHorizontal,
  repeat: Repeat,
  salary: Wallet,
  send: ArrowUpRight,
  services: Zap,
  transferIn: ArrowDownLeft,
  users: Users,
  utensils: Utensils,
  wallet: Wallet,
};

function formatAmount(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return Number(digits).toLocaleString("es-CL");
}

function formatToday() {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" }).format(new Date());
}

function formatISODateToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

type CreateTransactionPayload =
  | {
      tipo: "GASTO" | "INGRESO";
      monto: number;
      accountId: string;
      categoryId: string;
      descripcion?: string;
      fecha: string;
    }
  | {
      tipo: "TRANSFERENCIA";
      monto: number;
      fromAccountId: string;
      toAccountId: string;
      descripcion?: string;
      fecha: string;
    };

export function QuickEntryPage({ onClose, onSaved }: QuickEntryPageProps) {
  const [state, setState] = useState<QuickEntryPageState>({ status: "loading" });

  useEffect(() => {
    const abortController = new AbortController();

    async function loadOptions() {
      try {
        const response = await fetch(QUICK_ENTRY_OPTIONS_ENDPOINT, { signal: abortController.signal });

        if (!response.ok) {
          throw new Error(`Quick-entry options request failed with status ${response.status}.`);
        }

        const options = (await response.json()) as QuickEntryOptions;
        setState({ status: "success", options });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({
          status: "error",
          message: QUICK_ENTRY_OPTIONS_ERROR_MESSAGE,
        });
      }
    }

    void loadOptions();

    return () => abortController.abort();
  }, []);

  if (state.status === "loading") {
    return <QuickEntryStatus message="Cargando opciones para registrar el movimiento..." />;
  }

  if (state.status === "error") {
    return <QuickEntryStatus message={state.message} />;
  }

  return <QuickEntry options={state.options} onClose={onClose} onSaved={onSaved} />;
}

export function QuickEntry({ options, onClose, onSaved }: QuickEntryPageProps & { options: QuickEntryOptions }) {
  const [type, setType] = useState<MovementType>("GASTO");
  const [amountRaw, setAmountRaw] = useState("");
  const [originAccountId, setOriginAccountId] = useState(() => options.lastUsedAccountId ?? options.accounts[0]?.id ?? "");
  const [destinationAccountId, setDestinationAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dateLabel] = useState(() => `Hoy · ${formatToday()}`);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const isSavingRef = useRef(false);

  const categories = type === "INGRESO" ? options.categories.INGRESO : options.categories.GASTO;

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  const canSave = useMemo(() => {
    const hasValidAmount = amountRaw.length > 0 && Number(amountRaw) > 0;

    if (!hasValidAmount || !originAccountId) {
      return false;
    }

    if (type === "TRANSFERENCIA") {
      return Boolean(destinationAccountId && destinationAccountId !== originAccountId);
    }

    return Boolean(categoryId);
  }, [amountRaw, categoryId, destinationAccountId, originAccountId, type]);

  function changeType(nextType: MovementType) {
    setType(nextType);
    setCategoryId(null);
    setDestinationAccountId(null);
  }

  function changeOriginAccount(nextAccountId: string) {
    setOriginAccountId(nextAccountId);

    if (destinationAccountId === nextAccountId) {
      setDestinationAccountId(null);
    }
  }

  async function handleSave() {
    if (!canSave || isSavingRef.current) {
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(TRANSACTIONS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateTransactionPayload()),
      });

      if (!response.ok) {
        throw new Error(`No se pudo guardar el movimiento. Inténtalo nuevamente.`);
      }

      onSaved?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el movimiento. Inténtalo nuevamente.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  function buildCreateTransactionPayload(): CreateTransactionPayload {
    const monto = Number(amountRaw);
    const trimmedDescription = description.trim();
    const sharedPayload = {
      monto,
      fecha: formatISODateToday(),
      ...(trimmedDescription ? { descripcion: trimmedDescription } : {}),
    };

    if (type === "TRANSFERENCIA") {
      return {
        ...sharedPayload,
        tipo: "TRANSFERENCIA",
        fromAccountId: originAccountId,
        toAccountId: destinationAccountId ?? "",
      };
    }

    return {
      ...sharedPayload,
      tipo: type,
      accountId: originAccountId,
      categoryId: categoryId ?? "",
    };
  }

  return (
    <div className="quick-entry-shell">
      <div className="quick-entry-phone">
        <div className="quick-entry-topbar">
          <button className="quick-entry-icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={22} />
          </button>
          <button className="quick-entry-save" disabled={!canSave || isSaving} onClick={handleSave}>
            <Check size={15} />
            {isSaving ? "Guardando..." : "Guardar"}
          </button>
        </div>

        <div className="quick-entry-type-selector" aria-label="Tipo de movimiento">
          <TypeButton label="Gasto" type="GASTO" activeType={type} onSelect={changeType} />
          <TypeButton label="Ingreso" type="INGRESO" activeType={type} onSelect={changeType} />
          <TypeButton iconOnlyLabel="Transferencia" type="TRANSFERENCIA" activeType={type} onSelect={changeType} />
        </div>

        <div className="quick-entry-amount-block">
          <span className="quick-entry-currency">$</span>
              <input
            ref={amountInputRef}
            className="quick-entry-amount-input"
            aria-label="Monto"
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatAmount(amountRaw)}
            onChange={(event) => setAmountRaw(event.target.value.replace(/\D/g, ""))}
          />
        </div>

        <div className="quick-entry-content">
          {saveError ? (
            <p className="quick-entry-error" role="alert">
              {saveError}
            </p>
          ) : null}

          {type === "TRANSFERENCIA" ? (
            <>
              <FieldGroup label="Desde">
                <AccountChips accounts={options.accounts} selectedId={originAccountId} onSelect={changeOriginAccount} />
              </FieldGroup>
              <FieldGroup label="Hacia">
                <AccountChips
                  accounts={options.accounts}
                  selectedId={destinationAccountId}
                  onSelect={setDestinationAccountId}
                  excludeId={originAccountId}
                />
              </FieldGroup>
            </>
          ) : (
            <>
              <FieldGroup label="Cuenta">
                <AccountChips accounts={options.accounts} selectedId={originAccountId} onSelect={setOriginAccountId} />
              </FieldGroup>
              <FieldGroup label="Clasificación del gasto/ingreso">
                <CategoryGrid categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
              </FieldGroup>
            </>
          )}

          <FieldGroup label="Descripción (opcional)">
            <input
              className="quick-entry-text-input"
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ej: almuerzo con..."
            />
          </FieldGroup>

          <div className="quick-entry-date-row" aria-label="Fecha">
            <span>Fecha</span>
            <span>{dateLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickEntryStatus({ message }: { message: string }) {
  return (
    <div className="quick-entry-shell">
      <div className="quick-entry-phone">
        <div className="dashboard-status">
          <p>{message}</p>
        </div>
      </div>
    </div>
  );
}

function TypeButton({
  label,
  iconOnlyLabel,
  type,
  activeType,
  onSelect,
}: {
  label?: string;
  iconOnlyLabel?: string;
  type: MovementType;
  activeType: MovementType;
  onSelect: (type: MovementType) => void;
}) {
  const isActive = activeType === type;

  return (
    <button
      className={`quick-entry-type-button${isActive ? " quick-entry-type-button--active" : ""}`}
      aria-label={iconOnlyLabel ?? label}
      aria-pressed={isActive}
      onClick={() => onSelect(type)}
    >
      {type === "TRANSFERENCIA" ? <ArrowLeftRight size={16} /> : null}
      {label}
    </button>
  );
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  const labelId = useId();

  return (
    <div className="quick-entry-field-group" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="quick-entry-field-label">
        {label}
      </p>
      {children}
    </div>
  );
}

function AccountChips({
  accounts,
  selectedId,
  excludeId,
  onSelect,
}: {
  accounts: Account[];
  selectedId: string | null;
  excludeId?: string;
  onSelect: (accountId: string) => void;
}) {
  return (
    <div className="quick-entry-chip-list">
      {accounts
        .filter((account) => account.id !== excludeId)
        .map((account) => {
          const isActive = account.id === selectedId;

          return (
            <button
              key={account.id}
              className={`quick-entry-chip${isActive ? " quick-entry-chip--active" : ""}`}
              aria-pressed={isActive}
              onClick={() => onSelect(account.id)}
            >
              {account.nombre}
            </button>
          );
        })}
    </div>
  );
}

function CategoryGrid({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
}) {
  return (
    <div className="quick-entry-category-grid">
      {categories.map((category) => {
        const Icon = ICONS[category.icono] ?? MoreHorizontal;
        const isActive = category.id === selectedId;

        return (
          <button
            key={category.id}
            className={`quick-entry-category${isActive ? " quick-entry-category--active" : ""}`}
            aria-pressed={isActive}
            onClick={() => onSelect(category.id)}
          >
            <span className="quick-entry-category-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <span className="quick-entry-category-name">{category.nombre}</span>
          </button>
        );
      })}
    </div>
  );
}

export default QuickEntryPage;
