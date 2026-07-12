import React, { useState } from "react";
import { Plus, ChevronLeft, Landmark, PiggyBank, CreditCard, ShieldHalf, ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";

// ─────────────────────────────────────────────
// MOCKUP — Gestión de cuentas
// Refleja: agrupación por AccountType, cuentas
// inactivas colapsadas, y la convención "MP - X"
// para apartados demo (decisión #7.2
// del diseño de UI: Account = bolsillo controlable,
// no 1:1 con una cuenta bancaria física).
// ─────────────────────────────────────────────

const TIPOS = {
  OPERATIVA: { label: "Operativa", icon: Landmark },
  AHORRO: { label: "Ahorro", icon: PiggyBank },
  DEUDA: { label: "Deuda", icon: CreditCard },
  RESERVA: { label: "Reserva", icon: ShieldHalf },
};

const CUENTAS_INICIALES = [
  { id: "1", nombre: "Demo Cuenta Principal", tipo: "OPERATIVA", saldo: 123450, activa: true, notas: "Ingresos y gastos demo" },
  { id: "2", nombre: "Demo Cuenta Secundaria", tipo: "OPERATIVA", saldo: 12000, activa: true, notas: "" },
  { id: "3", nombre: "Demo Billetera", tipo: "OPERATIVA", saldo: 0, activa: true, notas: "Cuenta demo en evaluación" },
  { id: "4", nombre: "Demo - Viaje", tipo: "AHORRO", saldo: 80000, activa: true, notas: "Apartado demo" },
  { id: "5", nombre: "Demo - Equipo", tipo: "AHORRO", saldo: 60000, activa: true, notas: "Apartado demo" },
  { id: "6", nombre: "Demo Tarjeta", tipo: "DEUDA", saldo: -45000, activa: true, notas: "Cuota demo en curso" },
  { id: "7", nombre: "Demo Reserva", tipo: "RESERVA", saldo: 100000, activa: true, notas: "Reserva demo" },
  { id: "8", nombre: "Demo Inactiva", tipo: "OPERATIVA", saldo: 0, activa: false, notas: "Sin uso actual" },
];

// Metas activas y a qué cuenta apuntan — en la app real esto sale de
// una query a Goal (estado ACTIVA) filtrando por accountId. Se usa acá
// para bloquear/advertir al desactivar una cuenta que una meta necesita.
const METAS_ACTIVAS = [
  { id: "m1", nombre: "Meta demo viaje", cuentaId: "4" },
  { id: "m2", nombre: "Meta demo equipo", cuentaId: "5" },
];

const COLORS = {
  bg: "#F5F6F5",
  surface: "#FFFFFF",
  ink: "#1C231F",
  inkMuted: "#6B756E",
  accent: "#0F6B4F",
  accentSoft: "#E6F2ED",
  border: "#E4E7E3",
  negative: "#B4483A",
};

const formatCLP = (monto) => {
  const signo = monto < 0 ? "-" : "";
  return `${signo}$${Math.abs(monto).toLocaleString("es-CL")}`;
};

function GrupoCuentas({ tipo, cuentas, onSelect }) {
  const { label, icon: Icon } = TIPOS[tipo];
  return (
    <div className="mt-5">
      <div className="flex items-center gap-1.5 px-1 mb-2">
        <Icon size={13} style={{ color: COLORS.inkMuted }} />
        <p className="text-xs font-semibold tracking-wide" style={{ color: COLORS.inkMuted }}>
          {label.toUpperCase()}
        </p>
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
        {cuentas.map((c, i) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            style={{ borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}` }}
          >
            <span className="text-sm font-medium">{c.nombre}</span>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: c.saldo < 0 ? COLORS.negative : COLORS.ink }}
            >
              {formatCLP(c.saldo)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ListaCuentas({ cuentas, onSelect, onNuevo }) {
  const [inactivasAbiertas, setInactivasAbiertas] = useState(false);
  const activas = cuentas.filter((c) => c.activa);
  const inactivas = cuentas.filter((c) => !c.activa);
  const grupos = Object.keys(TIPOS).filter((tipo) => activas.some((c) => c.tipo === tipo));

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <div className="flex items-center justify-between px-5 pt-6 pb-1">
        <h1 className="text-lg font-semibold tracking-tight">Cuentas</h1>
        <button onClick={onNuevo} className="p-1.5 rounded-full" style={{ background: COLORS.accentSoft, color: COLORS.accent }}>
          <Plus size={18} />
        </button>
      </div>

      <div className="px-4">
        {grupos.map((tipo) => (
          <GrupoCuentas key={tipo} tipo={tipo} cuentas={activas.filter((c) => c.tipo === tipo)} onSelect={onSelect} />
        ))}

        {inactivas.length > 0 && (
          <div className="mt-5">
            <button
              onClick={() => setInactivasAbiertas((v) => !v)}
              className="w-full flex items-center justify-between px-1 mb-2"
            >
              <p className="text-xs font-semibold tracking-wide" style={{ color: COLORS.inkMuted }}>
                INACTIVAS ({inactivas.length})
              </p>
              {inactivasAbiertas ? (
                <ChevronDown size={14} style={{ color: COLORS.inkMuted }} />
              ) : (
                <ChevronRight size={14} style={{ color: COLORS.inkMuted }} />
              )}
            </button>
            {inactivasAbiertas && (
              <div className="rounded-2xl overflow-hidden" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, opacity: 0.6 }}>
                {inactivas.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    style={{ borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}` }}
                  >
                    <span className="text-sm font-medium">{c.nombre}</span>
                    <span className="text-xs" style={{ color: COLORS.inkMuted }}>
                      Desactivada
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditorCuenta({ cuenta, onVolver, onGuardar, onDesactivar }) {
  const [form, setForm] = useState(
    cuenta || { nombre: "", tipo: "OPERATIVA", saldo: 0, activa: true, notas: "" }
  );
  const esNueva = !cuenta;

  const campo = (label, children) => (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: COLORS.inkMuted }}>
        {label}
      </p>
      {children}
    </div>
  );

  const inputStyle = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
  };

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <button onClick={onVolver} className="flex items-center gap-1 text-sm" style={{ color: COLORS.inkMuted }}>
          <ChevronLeft size={18} /> Volver
        </button>
        <button
          onClick={() => onGuardar(form)}
          className="px-4 py-1.5 rounded-full text-sm font-semibold"
          style={{ background: COLORS.accent, color: "#fff" }}
        >
          Guardar
        </button>
      </div>

      <div className="px-4 flex flex-col gap-4 mt-2">
        {campo(
          "Nombre",
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Ej: Demo - Viaje"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={inputStyle}
          />
        )}

        {campo(
          "Tipo",
          <div className="flex gap-2 flex-wrap">
            {Object.entries(TIPOS).map(([key, { label }]) => {
              const active = form.tipo === key;
              return (
                <button
                  key={key}
                  onClick={() => setForm({ ...form, tipo: key })}
                  className="px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    background: active ? COLORS.accentSoft : COLORS.surface,
                    color: active ? COLORS.accent : COLORS.inkMuted,
                    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {campo(
          "Saldo actual",
          <input
            type="text"
            inputMode="numeric"
            value={form.saldo}
            onChange={(e) => setForm({ ...form, saldo: Number(e.target.value.replace(/\D/g, "")) || 0 })}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none tabular-nums"
            style={inputStyle}
          />
        )}

        {campo(
          "Notas",
          <textarea
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            rows={2}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none"
            style={inputStyle}
          />
        )}

        <div className="flex items-center justify-between py-1">
          <p className="text-sm font-medium">Cuenta activa</p>
          <button
            onClick={() => setForm({ ...form, activa: !form.activa })}
            className="rounded-full transition-colors"
            style={{ width: 44, height: 26, background: form.activa ? COLORS.accent : COLORS.border, position: "relative" }}
          >
            <span
              className="block rounded-full bg-white shadow"
              style={{
                width: 20,
                height: 20,
                position: "absolute",
                top: 3,
                left: form.activa ? 21 : 3,
                transition: "left 0.15s",
              }}
            />
          </button>
        </div>

        {!esNueva && (
          <button
            onClick={() => onDesactivar(form.id)}
            className="w-full text-center py-2.5 rounded-xl text-sm font-medium mt-2"
            style={{ color: COLORS.negative, border: `1px solid ${COLORS.border}` }}
          >
            Desactivar cuenta
          </button>
        )}
      </div>
    </div>
  );
}

function ModalAdvertenciaDesactivar({ cuenta, meta, onCancelar, onConfirmar }) {
  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-10"
      style={{ background: "rgba(28, 35, 31, 0.45)" }}
    >
      <div className="w-full max-w-sm rounded-t-3xl p-5" style={{ background: COLORS.surface }}>
        <div className="flex items-center gap-2 mb-2">
          <TriangleAlert size={18} style={{ color: COLORS.negative }} />
          <p className="text-sm font-semibold">Esta cuenta tiene una meta activa</p>
        </div>
        <p className="text-sm mb-4" style={{ color: COLORS.inkMuted }}>
          <strong>{cuenta.nombre}</strong> es la cuenta dedicada de la meta{" "}
          <strong>"{meta.nombre}"</strong>. Si la desactivás, esa meta va a quedar sin cuenta
          desde la cual calcular su progreso.
        </p>
        <p className="text-xs mb-4" style={{ color: COLORS.inkMuted }}>
          Recomendado: pausá o completá la meta primero, desde la pantalla de Metas.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onCancelar}
            className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: COLORS.accent, color: "#fff" }}
          >
            Cancelar, ir a revisar la meta
          </button>
          <button
            onClick={onConfirmar}
            className="w-full py-2.5 rounded-xl text-sm font-medium"
            style={{ color: COLORS.negative, border: `1px solid ${COLORS.border}` }}
          >
            Desactivar de todas formas
          </button>
        </div>
      </div>
    </div>
  );
}

function GestionCuentas() {
  const [cuentas, setCuentas] = useState(CUENTAS_INICIALES);
  const [seleccionId, setSeleccionId] = useState(null);
  const [creandoNueva, setCreandoNueva] = useState(false);
  const [advertencia, setAdvertencia] = useState(null); // { cuenta, meta } | null

  const cuentaSeleccionada = cuentas.find((c) => c.id === seleccionId);

  const guardar = (form) => {
    if (form.id) {
      setCuentas((prev) => prev.map((c) => (c.id === form.id ? { ...c, ...form } : c)));
    } else {
      setCuentas((prev) => [...prev, { ...form, id: String(Date.now()) }]);
    }
    setSeleccionId(null);
    setCreandoNueva(false);
  };

  const ejecutarDesactivacion = (id) => {
    setCuentas((prev) => prev.map((c) => (c.id === id ? { ...c, activa: false } : c)));
    setSeleccionId(null);
    setAdvertencia(null);
  };

  const desactivar = (id) => {
    const cuenta = cuentas.find((c) => c.id === id);
    const metaAsociada = METAS_ACTIVAS.find((m) => m.cuentaId === id);

    if (metaAsociada) {
      // Se advierte explícitamente en vez de bloquear por completo: el usuario
      // puede decidir desactivar igual, pero no sin ver antes la consecuencia.
      setAdvertencia({ cuenta, meta: metaAsociada });
      return;
    }
    ejecutarDesactivacion(id);
  };

  const mostrarEditor = seleccionId || creandoNueva;

  return (
    <div className="min-h-screen flex justify-center" style={{ background: COLORS.bg, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      {mostrarEditor ? (
        <EditorCuenta
          cuenta={cuentaSeleccionada}
          onVolver={() => {
            setSeleccionId(null);
            setCreandoNueva(false);
          }}
          onGuardar={guardar}
          onDesactivar={desactivar}
        />
      ) : (
        <ListaCuentas cuentas={cuentas} onSelect={setSeleccionId} onNuevo={() => setCreandoNueva(true)} />
      )}

      {advertencia && (
        <ModalAdvertenciaDesactivar
          cuenta={advertencia.cuenta}
          meta={advertencia.meta}
          onCancelar={() => setAdvertencia(null)}
          onConfirmar={() => ejecutarDesactivacion(advertencia.cuenta.id)}
        />
      )}
    </div>
  );
}

export default GestionCuentas;
