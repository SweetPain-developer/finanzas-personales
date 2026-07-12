import { FormEvent, useRef, useState } from "react";

import type { AccountType } from "../accountTypes";

const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; label: string }> = [
  { value: "OPERATIVA", label: "Operativa" },
  { value: "AHORRO", label: "Ahorro" },
  { value: "DEUDA", label: "Deuda" },
  { value: "RESERVA", label: "Reserva" },
];

type AccountEditorProps = {
  initialValues?: AccountEditorValues;
  mode?: "create" | "edit";
  onCancel: () => void;
  onSubmit: (values: AccountEditorValues) => Promise<void>;
  onSaved: () => void | Promise<void>;
};

export type AccountEditorValues = {
  name: string;
  type: AccountType;
  balance: number;
};

export function AccountEditor({ initialValues, mode = "create", onCancel, onSubmit, onSaved }: AccountEditorProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [type, setType] = useState<AccountType>(initialValues?.type ?? "OPERATIVA");
  const [balance, setBalance] = useState(String(initialValues?.balance ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const copy = mode === "edit"
    ? {
        title: "Editar cuenta",
        description: "Actualiza los datos principales de la cuenta.",
        balanceLabel: "Saldo actual",
        submit: "Guardar cambios",
        saving: "Guardando...",
        submitError: "No se pudo actualizar la cuenta.",
      }
    : {
        title: "Nueva cuenta",
        description: "Registra una cuenta para verla en el resumen.",
        balanceLabel: "Saldo inicial",
        submit: "Guardar cuenta",
        saving: "Guardando...",
        submitError: "No se pudo crear la cuenta.",
      };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingRef.current) {
      return;
    }

    const trimmedName = name.trim();
    const numericBalance = Number(balance);

    if (!trimmedName) {
      setError("Ingresa un nombre para la cuenta.");
      return;
    }

    if (!Number.isInteger(numericBalance)) {
      setError("Ingresa un saldo válido.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      await onSubmit({ name: trimmedName, type, balance: numericBalance });
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
        <input
          className="quick-entry-text-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          placeholder="Cuenta corriente"
        />
      </label>

      <label className="account-editor-field">
        Tipo
        <select className="quick-entry-text-input" value={type} onChange={(event) => setType(event.target.value as AccountType)} disabled={saving}>
          {ACCOUNT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="account-editor-field">
        {copy.balanceLabel}
        <input
          className="quick-entry-text-input"
          type="number"
          step="1"
          value={balance}
          onChange={(event) => setBalance(event.target.value)}
          disabled={saving}
          inputMode="numeric"
        />
      </label>

      <button className="commitments-confirm-button" type="submit" disabled={saving}>
        {saving ? copy.saving : copy.submit}
      </button>
    </form>
  );
}
