import React from "react";
import {
  Home,
  Receipt,
  Wallet,
  Target,
  CalendarClock,
  Plus,
  TrendingUp,
  UtensilsCrossed,
  Car,
} from "lucide-react";

// ─────────────────────────────────────────────
// DATOS HARDCODEADOS (mock) — se reemplazan por
// llamadas reales a la API en la siguiente fase.
// Estructura pensada para calzar 1:1 con el
// resultado que va a devolver el backend.
// ─────────────────────────────────────────────

const mockData = {
  mesActual: "Julio 2026",
  disponibleParaGastar: 123450,
  patrimonioLiquido: 456780,
  patrimonioVariacion: 12300,
  ingresosDelMes: 300000,
  gastosDelMes: 176550,
  metas: [
    { id: "1", nombre: "Meta demo viaje", montoActual: 80000, montoObjetivo: 200000, emoji: "🏖️" },
    { id: "2", nombre: "Meta demo equipo", montoActual: 60000, montoObjetivo: 150000, emoji: "💻" },
  ],
  movimientos: [
    { id: "1", descripcion: "Pedido demo", monto: -8500, fecha: "Hoy", cuenta: "Demo Cuenta Principal", icono: "delivery" },
    { id: "2", descripcion: "Ingreso demo", monto: 300000, fecha: "01 jul", cuenta: "Demo Cuenta Principal", icono: "sueldo" },
    { id: "3", descripcion: "Transporte demo", monto: -25000, fecha: "30 jun", cuenta: "Demo Cuenta Principal", icono: "auto" },
  ],
};

const formatCLP = (monto) => {
  const signo = monto < 0 ? "-" : "";
  const abs = Math.abs(monto);
  return `${signo}$${abs.toLocaleString("es-CL")}`;
};

const iconoPorTipo = {
  delivery: <UtensilsCrossed size={18} />,
  sueldo: <Wallet size={18} />,
  auto: <Car size={18} />,
};

const NAV_ITEMS = [
  { key: "dashboard", label: "Dash", icon: Home },
  { key: "movimientos", label: "Mov", icon: Receipt },
  { key: "cuentas", label: "Cta", icon: Wallet },
  { key: "metas", label: "Meta", icon: Target },
  { key: "compromisos", label: "Compr", icon: CalendarClock },
];

// Paleta funcional: verde profundo para "disponible" y señales positivas
// (evoca liquidez / control), grafito para texto, ámbar reservado
// exclusivamente para variación negativa de patrimonio o alertas.
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

function Dashboard() {
  const disponible = mockData.disponibleParaGastar;
  const variacionPositiva = mockData.patrimonioVariacion >= 0;

  return (
    <div
      className="min-h-screen flex justify-center"
      style={{ background: COLORS.bg, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {/* Contenedor ancho de teléfono para simular el uso real (Android, PWA) */}
      <div className="w-full max-w-sm relative pb-24" style={{ color: COLORS.ink }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-6 pb-2">
          <h1 className="text-lg font-semibold tracking-tight">Finanzas</h1>
          <span className="text-sm" style={{ color: COLORS.inkMuted }}>
            {mockData.mesActual}
          </span>
        </div>

        {/* Disponible para gastar — el número que más importa, arriba de todo */}
        <div className="mx-4 mt-3 rounded-2xl p-5" style={{ background: COLORS.accentSoft }}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: COLORS.accent }}>
            Disponible para gastar
          </p>
          <p
            className="mt-1 text-4xl font-bold tabular-nums"
            style={{ color: COLORS.accent, letterSpacing: "-0.02em" }}
          >
            {formatCLP(disponible)}
          </p>
        </div>

        {/* Patrimonio líquido */}
        <div
          className="mx-4 mt-3 rounded-2xl p-4 flex items-center justify-between"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <div>
            <p className="text-xs" style={{ color: COLORS.inkMuted }}>
              Patrimonio líquido
            </p>
            <p className="text-xl font-semibold tabular-nums mt-0.5">
              {formatCLP(mockData.patrimonioLiquido)}
            </p>
          </div>
          <div
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full"
            style={{
              color: variacionPositiva ? COLORS.accent : COLORS.negative,
              background: variacionPositiva ? COLORS.accentSoft : "#F7E9E7",
            }}
          >
            <TrendingUp size={12} />
            {variacionPositiva ? "+" : ""}
            {formatCLP(mockData.patrimonioVariacion)}
          </div>
        </div>

        {/* Ingresos / Gastos del mes */}
        <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <p className="text-xs" style={{ color: COLORS.inkMuted }}>
              Ingresos
            </p>
            <p className="text-base font-semibold tabular-nums mt-0.5">
              {formatCLP(mockData.ingresosDelMes)}
            </p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            <p className="text-xs" style={{ color: COLORS.inkMuted }}>
              Gastos
            </p>
            <p className="text-base font-semibold tabular-nums mt-0.5">
              {formatCLP(mockData.gastosDelMes)}
            </p>
          </div>
        </div>

        {/* Metas */}
        <div className="mx-4 mt-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold" style={{ color: COLORS.ink }}>
              Metas
            </h2>
            <button className="text-xs font-medium" style={{ color: COLORS.accent }}>
              Ver todas →
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {mockData.metas.map((meta) => {
              const pct = Math.min(100, Math.round((meta.montoActual / meta.montoObjetivo) * 100));
              return (
                <div
                  key={meta.id}
                  className="rounded-2xl p-4"
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
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: COLORS.border }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: COLORS.accent }}
                    />
                  </div>
                  <p className="text-xs mt-1.5 tabular-nums" style={{ color: COLORS.inkMuted }}>
                    {formatCLP(meta.montoActual)} / {formatCLP(meta.montoObjetivo)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Últimos movimientos */}
        <div className="mx-4 mt-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold" style={{ color: COLORS.ink }}>
              Últimos movimientos
            </h2>
            <button className="text-xs font-medium" style={{ color: COLORS.accent }}>
              Ver todos →
            </button>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
            {mockData.movimientos.map((mov, i) => (
              <div
                key={mov.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}` }}
              >
                <div
                  className="flex items-center justify-center rounded-full shrink-0"
                  style={{ width: 34, height: 34, background: COLORS.accentSoft, color: COLORS.accent }}
                >
                  {iconoPorTipo[mov.icono]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mov.descripcion}</p>
                  <p className="text-xs" style={{ color: COLORS.inkMuted }}>
                    {mov.fecha} · {mov.cuenta}
                  </p>
                </div>
                <p
                  className="text-sm font-semibold tabular-nums shrink-0"
                  style={{ color: mov.monto < 0 ? COLORS.ink : COLORS.accent }}
                >
                  {formatCLP(mov.monto)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* FAB — ingreso rápido, siempre visible */}
        <button
          className="fixed rounded-full flex items-center justify-center shadow-lg"
          style={{
            width: 56,
            height: 56,
            background: COLORS.accent,
            color: "#fff",
            bottom: 88,
            left: "50%",
            transform: "translateX(-50%)",
          }}
          aria-label="Agregar movimiento"
        >
          <Plus size={26} />
        </button>

        {/* Bottom navigation */}
        <div
          className="fixed bottom-0 left-1/2 w-full max-w-sm"
          style={{ transform: "translateX(-50%)", background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}
        >
          <div className="flex justify-around py-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.key === "dashboard";
              return (
                <button
                  key={item.key}
                  className="flex flex-col items-center gap-0.5 px-2 py-1"
                  style={{ color: active ? COLORS.accent : COLORS.inkMuted }}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-medium">{item.label}</span>
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
