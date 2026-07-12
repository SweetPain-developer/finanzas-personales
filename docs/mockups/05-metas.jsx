import React, { useState } from "react";
import {
  Plus,
  ChevronLeft,
  Wallet,
  Pause,
  Check,
  ArrowRight,
  PlusCircle,
} from "lucide-react";

// ─────────────────────────────────────────────
// MOCKUP — Seguimiento de metas
// Refleja: progreso calculado desde account.saldo,
// atajo "Agregar a esta meta" (decisión #5) que
// evita buscar la cuenta destino entre todas las
// demás, y creación de cuenta dedicada al vuelo.
// ─────────────────────────────────────────────

const CUENTAS_AHORRO_EXISTENTES = [
  { id: "4", nombre: "Demo - Viaje", saldo: 80000 },
  { id: "5", nombre: "Demo - Equipo", saldo: 60000 },
];

const CUENTAS_ORIGEN = [
  { id: "1", nombre: "Demo Cuenta Principal" },
  { id: "2", nombre: "Demo Cuenta Secundaria" },
];

const METAS_INICIALES = [
  {
    id: "g1",
    nombre: "Meta demo viaje",
    emoji: "🏖️",
    montoObjetivo: 200000,
    cuentaId: "4",
    cuentaNombre: "Demo - Viaje",
    saldo: 80000,
    estado: "ACTIVA",
  },
  {
    id: "g2",
    nombre: "Meta demo equipo",
    emoji: "💻",
    montoObjetivo: 150000,
    cuentaId: "5",
    cuentaNombre: "Demo - Equipo",
    saldo: 60000,
    estado: "ACTIVA",
  },
  {
    id: "g3",
    nombre: "Meta demo transporte",
    emoji: "🚗",
    montoObjetivo: 300000,
    cuentaId: null,
    cuentaNombre: null,
    saldo: 0,
    estado: "PAUSADA",
  },
  {
    id: "g4",
    nombre: "Meta demo equipo",
    emoji: "💻",
    montoObjetivo: 180000,
    cuentaId: null,
    cuentaNombre: null,
    saldo: 180000,
    estado: "COMPLETADA",
  },
];

const COLORS = {
  bg: "#F5F6F5",
  surface: "#FFFFFF",
  ink: "#1C231F",
  inkMuted: "#6B756E",
  accent: "#0F6B4F",
  accentSoft: "#E6F2ED",
  border: "#E4E7E3",
};

const formatCLP = (monto) => `$${monto.toLocaleString("es-CL")}`;
const pctDe = (meta) => Math.min(100, Math.round((meta.saldo / meta.montoObjetivo) * 100));

function BarraProgreso({ pct }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: COLORS.border }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS.accent }} />
    </div>
  );
}

function TarjetaMeta({ meta, onSelect }) {
  const pct = pctDe(meta);
  return (
    <button
      onClick={() => onSelect(meta.id)}
      className="w-full text-left rounded-2xl p-4"
      style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          {meta.emoji} {meta.nombre}
        </span>
        <span className="text-xs font-medium" style={{ color: COLORS.inkMuted }}>
          {pct}%
        </span>
      </div>
      <BarraProgreso pct={pct} />
      <p className="text-xs mt-1.5 tabular-nums" style={{ color: COLORS.inkMuted }}>
        {formatCLP(meta.saldo)} / {formatCLP(meta.montoObjetivo)}
      </p>
    </button>
  );
}

function ListaMetas({ metas, onSelect, onNueva }) {
  const activas = metas.filter((m) => m.estado === "ACTIVA");
  const pausadas = metas.filter((m) => m.estado === "PAUSADA");
  const completadas = metas.filter((m) => m.estado === "COMPLETADA");

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <div className="flex items-center justify-between px-5 pt-6 pb-1">
        <h1 className="text-lg font-semibold tracking-tight">Metas</h1>
        <button onClick={onNueva} className="p-1.5 rounded-full" style={{ background: COLORS.accentSoft, color: COLORS.accent }}>
          <Plus size={18} />
        </button>
      </div>

      <div className="px-4 flex flex-col gap-2.5 mt-3">
        {activas.map((m) => (
          <TarjetaMeta key={m.id} meta={m} onSelect={onSelect} />
        ))}
      </div>

      {pausadas.length > 0 && (
        <div className="px-4 mt-5">
          <p className="text-xs font-semibold mb-2" style={{ color: COLORS.inkMuted }}>
            PAUSADAS
          </p>
          <div className="flex flex-col gap-2.5">
            {pausadas.map((m) => (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                className="w-full flex items-center gap-2 rounded-2xl p-4 text-left"
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, opacity: 0.75 }}
              >
                <Pause size={14} style={{ color: COLORS.inkMuted }} />
                <span className="text-sm font-medium">
                  {m.emoji} {m.nombre}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {completadas.length > 0 && (
        <div className="px-4 mt-5">
          <p className="text-xs font-semibold mb-2" style={{ color: COLORS.inkMuted }}>
            COMPLETADAS
          </p>
          <div className="flex flex-col gap-2.5">
            {completadas.map((m) => (
              <div
                key={m.id}
                className="w-full flex items-center gap-2 rounded-2xl p-4"
                style={{ background: COLORS.accentSoft }}
              >
                <Check size={14} style={{ color: COLORS.accent }} />
                <span className="text-sm font-medium" style={{ color: COLORS.accent }}>
                  {m.emoji} {m.nombre}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetalleMeta({ meta, onVolver, onAgregarFondos, onEditar }) {
  const pct = pctDe(meta);
  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <div className="flex items-center px-4 pt-5 pb-2">
        <button onClick={onVolver} className="flex items-center gap-1 text-sm" style={{ color: COLORS.inkMuted }}>
          <ChevronLeft size={18} /> Metas
        </button>
      </div>

      <div className="px-4 mt-2">
        <p className="text-2xl">{meta.emoji}</p>
        <h2 className="text-xl font-semibold mt-1">{meta.nombre}</h2>

        <div className="mt-4 rounded-2xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold tabular-nums">{formatCLP(meta.saldo)}</span>
            <span className="text-sm font-medium" style={{ color: COLORS.inkMuted }}>
              {pct}%
            </span>
          </div>
          <BarraProgreso pct={pct} />
          <p className="text-xs mt-1.5" style={{ color: COLORS.inkMuted }}>
            Meta: {formatCLP(meta.montoObjetivo)}
          </p>
        </div>

        {meta.cuentaNombre && (
          <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: COLORS.inkMuted }}>
            <Wallet size={13} />
            Cuenta dedicada: <strong style={{ color: COLORS.ink }}>{meta.cuentaNombre}</strong>
          </div>
        )}

        {meta.estado === "ACTIVA" && (
          <button
            onClick={onAgregarFondos}
            className="w-full flex items-center justify-center gap-2 mt-5 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: COLORS.accent, color: "#fff" }}
          >
            <PlusCircle size={16} />
            Agregar a esta meta
          </button>
        )}

        <button
          onClick={onEditar}
          className="w-full py-2.5 mt-2 rounded-2xl text-sm font-medium"
          style={{ border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted }}
        >
          Editar meta
        </button>
      </div>
    </div>
  );
}

// Atajo de transferencia con destino ya fijo — versión reducida del
// formulario de Ingreso rápido en modo Transferencia, sin el paso de
// buscar la cuenta destino entre todas las demás (decisión #5).
function AgregarFondos({ meta, onVolver, onConfirmar }) {
  const [cuentaOrigenId, setCuentaOrigenId] = useState(CUENTAS_ORIGEN[0].id);
  const [montoRaw, setMontoRaw] = useState("");

  const formatMonto = (raw) => {
    const digitos = raw.replace(/\D/g, "");
    return digitos ? Number(digitos).toLocaleString("es-CL") : "";
  };

  const puedeConfirmar = montoRaw.length > 0 && Number(montoRaw) > 0;

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <div className="flex items-center px-4 pt-5 pb-2">
        <button onClick={onVolver} className="flex items-center gap-1 text-sm" style={{ color: COLORS.inkMuted }}>
          <ChevronLeft size={18} /> {meta.nombre}
        </button>
      </div>

      <div className="px-4 mt-4 text-center">
        <p className="text-xs font-medium mb-1" style={{ color: COLORS.inkMuted }}>
          Agregar a "{meta.nombre}"
        </p>
        <div className="flex items-center justify-center gap-1 mt-2">
          <span className="text-3xl font-semibold" style={{ color: COLORS.inkMuted }}>
            $
          </span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatMonto(montoRaw)}
            onChange={(e) => setMontoRaw(e.target.value.replace(/\D/g, ""))}
            className="text-5xl font-bold text-center bg-transparent outline-none tabular-nums"
            style={{ width: "220px" }}
            autoFocus
          />
        </div>
      </div>

      <div className="px-4 mt-6">
        <p className="text-xs font-medium mb-2" style={{ color: COLORS.inkMuted }}>
          Desde
        </p>
        <div className="flex flex-wrap gap-2">
          {CUENTAS_ORIGEN.map((c) => {
            const active = c.id === cuentaOrigenId;
            return (
              <button
                key={c.id}
                onClick={() => setCuentaOrigenId(c.id)}
                className="px-3.5 py-1.5 rounded-full text-sm font-medium"
                style={{
                  background: active ? COLORS.accentSoft : COLORS.surface,
                  color: active ? COLORS.accent : COLORS.inkMuted,
                  border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                }}
              >
                {c.nombre}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-4 text-xs px-3.5 py-2.5 rounded-xl" style={{ background: COLORS.accentSoft, color: COLORS.accent }}>
          <ArrowRight size={13} />
          Hacia <strong>{meta.cuentaNombre}</strong> (fijo, es la cuenta de esta meta)
        </div>

        <button
          disabled={!puedeConfirmar}
          onClick={() => onConfirmar(Number(montoRaw))}
          className="w-full py-3 rounded-2xl text-sm font-semibold mt-6"
          style={{
            background: puedeConfirmar ? COLORS.accent : COLORS.border,
            color: puedeConfirmar ? "#fff" : COLORS.inkMuted,
          }}
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

function EditorMeta({ meta, onVolver, onGuardar }) {
  const [form, setForm] = useState(
    meta || { nombre: "", montoObjetivo: "", cuentaId: "", notas: "" }
  );
  const [creandoCuenta, setCreandoCuenta] = useState(false);
  const [nombreCuentaNueva, setNombreCuentaNueva] = useState("");

  const inputStyle = { background: COLORS.surface, border: `1px solid ${COLORS.border}` };

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <button onClick={onVolver} className="flex items-center gap-1 text-sm" style={{ color: COLORS.inkMuted }}>
          <ChevronLeft size={18} /> Volver
        </button>
        <button
          onClick={() => onGuardar(form, creandoCuenta ? nombreCuentaNueva : null)}
          className="px-4 py-1.5 rounded-full text-sm font-semibold"
          style={{ background: COLORS.accent, color: "#fff" }}
        >
          Guardar
        </button>
      </div>

      <div className="px-4 flex flex-col gap-4 mt-2">
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: COLORS.inkMuted }}>
            Nombre
          </p>
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Ej: Meta demo viaje"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: COLORS.inkMuted }}>
            Monto objetivo
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={form.montoObjetivo}
            onChange={(e) => setForm({ ...form, montoObjetivo: e.target.value.replace(/\D/g, "") })}
            placeholder="200000"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none tabular-nums"
            style={inputStyle}
          />
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: COLORS.inkMuted }}>
            Cuenta dedicada
          </p>
          {!creandoCuenta ? (
            <>
              <div className="flex flex-wrap gap-2">
                {CUENTAS_AHORRO_EXISTENTES.map((c) => {
                  const active = form.cuentaId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setForm({ ...form, cuentaId: c.id })}
                      className="px-3.5 py-1.5 rounded-full text-sm font-medium"
                      style={{
                        background: active ? COLORS.accentSoft : COLORS.surface,
                        color: active ? COLORS.accent : COLORS.inkMuted,
                        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                      }}
                    >
                      {c.nombre}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCreandoCuenta(true)}
                className="flex items-center gap-1.5 text-xs font-medium mt-2.5"
                style={{ color: COLORS.accent }}
              >
                <Plus size={13} /> Crear cuenta nueva para esta meta
              </button>
            </>
          ) : (
            <div className="rounded-xl p-3" style={{ background: COLORS.accentSoft }}>
              <p className="text-xs mb-2" style={{ color: COLORS.accent }}>
                Se creará una cuenta tipo Ahorro con saldo inicial $0
              </p>
              <input
                value={nombreCuentaNueva}
                onChange={(e) => setNombreCuentaNueva(e.target.value)}
                placeholder="Ej: Demo - Equipo"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: "#fff", border: `1px solid ${COLORS.border}` }}
                autoFocus
              />
              <button
                onClick={() => setCreandoCuenta(false)}
                className="text-xs font-medium mt-2"
                style={{ color: COLORS.inkMuted }}
              >
                Cancelar, elegir una existente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metas() {
  const [metas, setMetas] = useState(METAS_INICIALES);
  const [vista, setVista] = useState({ tipo: "lista" }); // lista | detalle | fondos | editor

  const metaActual = metas.find((m) => m.id === vista.metaId);

  const confirmarFondos = (monto) => {
    setMetas((prev) =>
      prev.map((m) => (m.id === metaActual.id ? { ...m, saldo: m.saldo + monto } : m))
    );
    setVista({ tipo: "detalle", metaId: metaActual.id });
  };

  const guardarMeta = (form, nombreCuentaNueva) => {
    if (form.id) {
      setMetas((prev) => prev.map((m) => (m.id === form.id ? { ...m, ...form, montoObjetivo: Number(form.montoObjetivo) } : m)));
    } else {
      const nuevaMeta = {
        ...form,
        id: String(Date.now()),
        emoji: "🎯",
        montoObjetivo: Number(form.montoObjetivo),
        saldo: 0,
        estado: "ACTIVA",
        cuentaNombre: nombreCuentaNueva || CUENTAS_AHORRO_EXISTENTES.find((c) => c.id === form.cuentaId)?.nombre || null,
      };
      setMetas((prev) => [...prev, nuevaMeta]);
    }
    setVista({ tipo: "lista" });
  };

  return (
    <div className="min-h-screen flex justify-center" style={{ background: COLORS.bg, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      {vista.tipo === "lista" && (
        <ListaMetas
          metas={metas}
          onSelect={(id) => setVista({ tipo: "detalle", metaId: id })}
          onNueva={() => setVista({ tipo: "editor" })}
        />
      )}
      {vista.tipo === "detalle" && metaActual && (
        <DetalleMeta
          meta={metaActual}
          onVolver={() => setVista({ tipo: "lista" })}
          onAgregarFondos={() => setVista({ tipo: "fondos", metaId: metaActual.id })}
          onEditar={() => setVista({ tipo: "editor", metaId: metaActual.id })}
        />
      )}
      {vista.tipo === "fondos" && metaActual && (
        <AgregarFondos
          meta={metaActual}
          onVolver={() => setVista({ tipo: "detalle", metaId: metaActual.id })}
          onConfirmar={confirmarFondos}
        />
      )}
      {vista.tipo === "editor" && (
        <EditorMeta
          meta={metaActual}
          onVolver={() => setVista(metaActual ? { tipo: "detalle", metaId: metaActual.id } : { tipo: "lista" })}
          onGuardar={guardarMeta}
        />
      )}
    </div>
  );
}

export default Metas;
