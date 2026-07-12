import React, { useState, useEffect } from "react";
import { Plus, Check, Zap, Home, CreditCard, Repeat, CircleDot } from "lucide-react";

// ─────────────────────────────────────────────
// MOCKUP — Compromisos mensuales
// Simula: orden por urgencia, total pendiente,
// y el flujo de "marcar pagado" que genera
// automáticamente el Transaction asociado
// (decisión cerrada #3 del diseño de UI).
// ─────────────────────────────────────────────

const COMPROMISOS_INICIALES = [
  {
    id: "1",
    nombre: "Servicio mensual demo",
    tipo: "RECURRENTE",
    monto: 120000,
    estado: "PENDIENTE",
    diaVencimiento: 5,
    icon: Home,
  },
  {
    id: "2",
    nombre: "Luz",
    tipo: "VARIABLE",
    monto: 45000,
    estado: "PENDIENTE",
    diaVencimiento: 15,
    icon: Zap,
  },
  {
    id: "3",
    nombre: "Cuota demo",
    tipo: "DEUDA",
    monto: 25000,
    estado: "PENDIENTE",
    diaVencimiento: 20,
    icon: CreditCard,
  },
  {
    id: "4",
    nombre: "Plan celular",
    tipo: "RECURRENTE",
    monto: 15000,
    estado: "PAGADO",
    diaVencimiento: 3,
    icon: Repeat,
  },
  {
    id: "5",
    nombre: "Suscripción demo",
    tipo: "RECURRENTE",
    monto: 8000,
    estado: "PAGADO",
    diaVencimiento: 8,
    icon: Repeat,
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
  warn: "#B4483A",
  warnSoft: "#F7E9E7",
};

const formatCLP = (monto) => `$${monto.toLocaleString("es-CL")}`;

const TIPO_LABEL = {
  RECURRENTE: "Recurrente",
  VARIABLE: "Variable",
  DEUDA: "Deuda",
};

function CompromisoCard({ compromiso, onMarcarPagado }) {
  const Icon = compromiso.icon;
  const pendiente = compromiso.estado === "PENDIENTE";

  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
    >
      <div
        className="flex items-center justify-center rounded-full shrink-0"
        style={{
          width: 38,
          height: 38,
          background: pendiente ? COLORS.accentSoft : COLORS.border,
          color: pendiente ? COLORS.accent : COLORS.inkMuted,
        }}
      >
        <Icon size={18} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{compromiso.nombre}</p>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: COLORS.border, color: COLORS.inkMuted }}
          >
            {TIPO_LABEL[compromiso.tipo]}
          </span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: COLORS.inkMuted }}>
          {pendiente ? `Vence día ${compromiso.diaVencimiento}` : "Pagado"}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span className="text-sm font-semibold tabular-nums">{formatCLP(compromiso.monto)}</span>
        {pendiente ? (
          <button
            onClick={() => onMarcarPagado(compromiso.id)}
            className="text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ background: COLORS.accent, color: "#fff" }}
          >
            Marcar pagado
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: COLORS.accent }}>
            <Check size={12} /> Pagado
          </span>
        )}
      </div>
    </div>
  );
}

function Toast({ mensaje }) {
  if (!mensaje) return null;
  return (
    <div
      className="fixed left-1/2 bottom-24 px-4 py-2 rounded-full text-sm font-medium shadow-lg"
      style={{ transform: "translateX(-50%)", background: COLORS.ink, color: "#fff" }}
    >
      {mensaje}
    </div>
  );
}

function Compromisos() {
  const [compromisos, setCompromisos] = useState(COMPROMISOS_INICIALES);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const marcarPagado = (id) => {
    const compromiso = compromisos.find((c) => c.id === id);
    setCompromisos((prev) => prev.map((c) => (c.id === id ? { ...c, estado: "PAGADO" } : c)));
    // Simula la creación automática del Transaction asociado (decisión #3)
    setToast(`Gasto de ${formatCLP(compromiso.monto)} registrado en Movimientos ✓`);
  };

  const pendientes = compromisos
    .filter((c) => c.estado === "PENDIENTE")
    .sort((a, b) => a.diaVencimiento - b.diaVencimiento);
  const pagados = compromisos.filter((c) => c.estado === "PAGADO");
  const totalPendiente = pendientes.reduce((acc, c) => acc + c.monto, 0);

  return (
    <div
      className="min-h-screen flex justify-center"
      style={{ background: COLORS.bg, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-6 pb-3">
          <h1 className="text-lg font-semibold tracking-tight">Compromisos</h1>
          <span className="text-sm" style={{ color: COLORS.inkMuted }}>
            Julio 2026
          </span>
        </div>

        {/* Total pendiente — alimenta el cálculo de "disponible" del dashboard */}
        <div className="mx-4 rounded-2xl p-4" style={{ background: pendientes.length ? COLORS.warnSoft : COLORS.accentSoft }}>
          <p
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: pendientes.length ? COLORS.warn : COLORS.accent }}
          >
            {pendientes.length > 0 ? `${pendientes.length} pendientes` : "Mes al día"}
          </p>
          <p
            className="text-2xl font-bold tabular-nums mt-0.5"
            style={{ color: pendientes.length ? COLORS.warn : COLORS.accent }}
          >
            {pendientes.length > 0 ? formatCLP(totalPendiente) : "✓"}
          </p>
        </div>

        {/* Pendientes */}
        {pendientes.length > 0 && (
          <div className="mx-4 mt-5 flex flex-col gap-2.5">
            <p className="text-xs font-medium" style={{ color: COLORS.inkMuted }}>
              PENDIENTES
            </p>
            {pendientes.map((c) => (
              <CompromisoCard key={c.id} compromiso={c} onMarcarPagado={marcarPagado} />
            ))}
          </div>
        )}

        {/* Pagados */}
        {pagados.length > 0 && (
          <div className="mx-4 mt-5 flex flex-col gap-2.5">
            <p className="text-xs font-medium" style={{ color: COLORS.inkMuted }}>
              PAGADOS
            </p>
            {pagados.map((c) => (
              <CompromisoCard key={c.id} compromiso={c} onMarcarPagado={marcarPagado} />
            ))}
          </div>
        )}

        {/* Nota sobre recurrentes con plantilla — referencia a la decisión #4 */}
        <div className="mx-4 mt-5 flex items-start gap-2 text-xs" style={{ color: COLORS.inkMuted }}>
          <CircleDot size={13} className="mt-0.5 shrink-0" />
          <p>
            Los compromisos "Recurrente" se generan automáticamente cada mes desde su plantilla,
            salvo que la hayas pausado (ej. una suscripción que este mes no vas a usar).
          </p>
        </div>

        {/* FAB agregar */}
        <button
          className="fixed rounded-full flex items-center justify-center gap-1.5 shadow-lg text-sm font-semibold"
          style={{
            padding: "12px 20px",
            background: COLORS.accent,
            color: "#fff",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <Plus size={18} />
          Agregar compromiso
        </button>

        <Toast mensaje={toast} />
      </div>
    </div>
  );
}

export default Compromisos;
