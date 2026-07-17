import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  Plus,
  Check,
  X,
  HandCoins,
  Undo2,
  Wallet,
  Calendar,
  Users,
  CircleDot,
  XCircle,
  TriangleAlert,
  Pencil,
  Ban,
  RotateCcw,
  ArrowRight,
  LayoutGrid,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// MOCKUP — Préstamos (dinero por cobrar) · slice aprobado #1
//
// Los préstamos NO son gasto, ingreso, transferencia ni una
// categoría de gasto. Son un tercer tipo de movimiento:
//   Entrega   → baja el saldo de una cuenta propia, sube el
//               derecho de cobro (crea un Préstamo PENDIENTE).
//   Devolución→ sube el saldo de una cuenta propia, baja el
//               derecho de cobro (Préstamo existente).
//
// Este archivo es autocontenido (sin router, sin state manager,
// sin API/Prisma). Para poder mostrar los 3 puntos de entrada
// que pide el diseño — Dashboard, Ingreso rápido y la pantalla
// de Préstamos — sin un router real, el componente raíz maneja
// un selector de "pantalla" simple. La franja superior gris
// ("Vista demo") NO es parte de la UI real: es un atajo de este
// mockup para saltar entre las pantallas que en la app real se
// alcanzan por navegación normal. El bottom navigation de la
// app NO suma un sexto ítem: Préstamos se alcanza únicamente
// desde la tarjeta "Por cobrar" del Dashboard o desde el tipo
// "Préstamo" de Ingreso rápido.
// ─────────────────────────────────────────────────────────────

// ---------- Cuentas demo ----------
// Solo OPERATIVA / AHORRO / RESERVA pueden usarse como origen o
// destino de un préstamo. Las cuentas DEUDA (incluida cualquier
// tarjeta tipo CMR) quedan excluidas: prestar plata "desde" una
// deuda o "hacia" una deuda no tiene sentido en este slice.
const CUENTAS_INICIALES = [
  { id: "c1", nombre: "Demo Cuenta Principal", tipo: "OPERATIVA", saldo: 350000, activa: true },
  { id: "c2", nombre: "Demo Billetera", tipo: "OPERATIVA", saldo: 45000, activa: true },
  { id: "c3", nombre: "Demo Ahorro Viaje", tipo: "AHORRO", saldo: 120000, activa: true },
  { id: "c4", nombre: "Demo Reserva Emergencia", tipo: "RESERVA", saldo: 500000, activa: true },
  { id: "c5", nombre: "Demo Tarjeta CMR", tipo: "DEUDA", saldo: -80000, activa: true },
];

// ---------- Préstamos demo ----------
// El "monto devuelto" y el "saldo pendiente" no se guardan como
// campo suelto: se derivan del historial de devoluciones, para
// que la tarjeta y el detalle nunca puedan desincronizarse.
const PRESTAMOS_INICIALES = [
  {
    id: "p1",
    persona: "Persona demo",
    montoOriginal: 250000,
    cuentaOrigenId: "c1",
    fechaEntrega: "10 may",
    notas: "",
    estado: "PENDIENTE",
    historial: [
      { id: "h1", fecha: "02 jun", monto: 50000, cuentaDestinoId: "c2" },
    ],
  },
  {
    id: "p2",
    persona: "Persona demo",
    montoOriginal: 80000,
    cuentaOrigenId: "c2",
    fechaEntrega: "20 jun",
    notas: "Para el arriendo del mes",
    estado: "PENDIENTE",
    historial: [],
  },
  {
    id: "p3",
    persona: "Otra persona demo",
    montoOriginal: 40000,
    cuentaOrigenId: "c1",
    fechaEntrega: "01 abr",
    notas: "",
    estado: "SALDADO",
    historial: [{ id: "h2", fecha: "15 abr", monto: 40000, cuentaDestinoId: "c1" }],
  },
  {
    id: "p4",
    persona: "Tercera persona demo",
    montoOriginal: 30000,
    cuentaOrigenId: "c4",
    fechaEntrega: "05 mar",
    notas: "Se perdió contacto, no se espera recuperar",
    estado: "INCOBRABLE",
    historial: [],
  },
];

// ---------- Estilo compartido ----------
const COLORS = {
  bg: "#F5F6F5",
  surface: "#FFFFFF",
  ink: "#1C231F",
  inkMuted: "#6B756E",
  accent: "#0F6B4F",
  accentSoft: "#E6F2ED",
  border: "#E4E7E3",
  amber: "#B8842E",
  amberSoft: "#F6EEDF",
  negative: "#B4483A",
  negativeSoft: "#F7E9E7",
  disabled: "#C7CCC8",
};

const ESTADO_UI = {
  PENDIENTE: { label: "Pendiente", color: COLORS.amber, soft: COLORS.amberSoft, icon: CircleDot },
  SALDADO: { label: "Saldado", color: COLORS.accent, soft: COLORS.accentSoft, icon: Check },
  INCOBRABLE: { label: "Incobrable", color: COLORS.negative, soft: COLORS.negativeSoft, icon: XCircle },
};

const formatCLP = (monto) => `$${Math.abs(Math.round(monto)).toLocaleString("es-CL")}`;
const formatMontoInput = (raw) => {
  const digitos = raw.replace(/\D/g, "");
  if (!digitos) return "";
  return Number(digitos).toLocaleString("es-CL");
};

// ---------- Derivaciones ----------
const montoDevuelto = (p) => p.historial.reduce((acc, h) => acc + h.monto, 0);
const saldoPendiente = (p) => p.montoOriginal - montoDevuelto(p);
const cuentaPorId = (cuentas, id) => cuentas.find((c) => c.id === id);
const cuentasSeleccionables = (cuentas) => cuentas.filter((c) => c.activa && c.tipo !== "DEUDA");

const inputStyle = { background: COLORS.surface, border: `1px solid ${COLORS.border}` };

// ─────────────────────────────────────────────
// Bloques compartidos de UI
// ─────────────────────────────────────────────

function TopBar({ titulo, onVolver, accionDerecha, volverLabel = "Volver" }) {
  return (
    <div className="flex items-center justify-between px-4 pt-5 pb-2">
      <button onClick={onVolver} className="flex items-center gap-1 text-sm" style={{ color: COLORS.inkMuted }}>
        <ChevronLeft size={18} /> {volverLabel}
      </button>
      <p className="text-sm font-semibold">{titulo}</p>
      {accionDerecha || <div style={{ width: 60 }} />}
    </div>
  );
}

function Campo({ label, children, error }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: COLORS.inkMuted }}>
        {label}
      </p>
      {children}
      {error && (
        <p className="text-xs mt-1.5" style={{ color: COLORS.negative }}>
          {error}
        </p>
      )}
    </div>
  );
}

function EstadoBadge({ estado, size = "sm" }) {
  const cfg = ESTADO_UI[estado];
  const Icon = cfg.icon;
  return (
    <span
      className={`flex items-center gap-1 font-medium rounded-full shrink-0 ${size === "sm" ? "text-[11px] px-2 py-1" : "text-xs px-2.5 py-1"}`}
      style={{ color: cfg.color, background: cfg.soft }}
    >
      <Icon size={size === "sm" ? 11 : 13} />
      {cfg.label}
    </span>
  );
}

// Selector de cuenta: solo OPERATIVA / AHORRO / RESERVA, y muestra
// el saldo disponible junto a cada opción para decidir con info real.
function CuentaSelector({ cuentas, seleccionadaId, onSelect, saldoExtra }) {
  const opciones = cuentasSeleccionables(cuentas);
  return (
    <div className="flex flex-col gap-2">
      {opciones.map((c) => {
        const active = c.id === seleccionadaId;
        const disponible = c.saldo + (saldoExtra && saldoExtra.cuentaId === c.id ? saldoExtra.monto : 0);
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left"
            style={{
              background: active ? COLORS.accentSoft : COLORS.surface,
              border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
            }}
          >
            <span className="text-sm font-medium" style={{ color: active ? COLORS.accent : COLORS.ink }}>
              {c.nombre}
            </span>
            <span className="text-xs tabular-nums" style={{ color: active ? COLORS.accent : COLORS.inkMuted }}>
              Disp. {formatCLP(disponible)}
            </span>
          </button>
        );
      })}
      <p className="text-[11px] mt-0.5" style={{ color: COLORS.inkMuted }}>
        Las cuentas de deuda (incluida CMR) no aparecen: un préstamo no puede salir ni entrar de una deuda.
      </p>
    </div>
  );
}

function ExplicacionBanner({ icon: Icon, texto }) {
  return (
    <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: COLORS.accentSoft }}>
      <Icon size={16} style={{ color: COLORS.accent }} />
      <p className="text-xs font-medium" style={{ color: COLORS.accent }}>
        {texto}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Pantalla — Dashboard (demo, recorte mínimo)
// Solo lo necesario para mostrar el punto de
// entrada "Por cobrar" que pide el diseño.
// ─────────────────────────────────────────────

function DashboardDemo({ totalPorCobrar, cantidadPendientes, onVerPrestamos }) {
  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-lg font-semibold tracking-tight">Finanzas</h1>
        <p className="text-sm" style={{ color: COLORS.inkMuted }}>
          Julio 2026
        </p>
      </div>

      <p className="text-[11px] font-semibold px-5 mt-4 mb-1 tracking-wide" style={{ color: COLORS.inkMuted }}>
        RECORTE DE DASHBOARD PARA ESTE MOCKUP
      </p>

      {/* Tarjeta permanente — se muestra siempre, incluso en $0 */}
      <div
        className="mx-4 mt-1 rounded-2xl p-4 flex items-center justify-between"
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
      >
        <div>
          <div className="flex items-center gap-1.5">
            <HandCoins size={14} style={{ color: COLORS.accent }} />
            <p className="text-xs font-medium" style={{ color: COLORS.inkMuted }}>
              Por cobrar
            </p>
          </div>
          <p className="text-xl font-semibold tabular-nums mt-0.5">{formatCLP(totalPorCobrar)}</p>
          <p className="text-[11px] mt-0.5" style={{ color: COLORS.inkMuted }}>
            {cantidadPendientes > 0 ? `${cantidadPendientes} préstamo${cantidadPendientes === 1 ? "" : "s"} pendiente${cantidadPendientes === 1 ? "" : "s"}` : "Sin préstamos pendientes"}
          </p>
        </div>
        <button onClick={onVerPrestamos} className="flex items-center gap-1 text-xs font-medium shrink-0" style={{ color: COLORS.accent }}>
          Ver préstamos <ArrowRight size={13} />
        </button>
      </div>

      <p className="text-[11px] px-5 mt-3" style={{ color: COLORS.inkMuted }}>
        El resto del Dashboard (disponible para gastar, patrimonio, metas, movimientos) no cambia y se omite acá
        para mantener el foco de este mockup en Préstamos. El total "Por cobrar" es informativo: no se suma al
        patrimonio líquido en este slice.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Pantalla — Ingreso rápido (demo, recorte mínimo)
// Solo para mostrar el tipo "Préstamo" y sus dos
// acciones, que reenvían a los mismos formularios
// que usa la pantalla de Préstamos.
// ─────────────────────────────────────────────

function IngresoRapidoDemo({ onEntregar, onDevolucion, onVolver }) {
  const [tipo, setTipo] = useState("PRESTAMO");
  const tipos = [
    { key: "GASTO", label: "Gasto" },
    { key: "INGRESO", label: "Ingreso" },
    { key: "TRANSFERENCIA", label: "Transf." },
    { key: "PRESTAMO", label: "Préstamo" },
  ];

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <TopBar titulo="Ingreso rápido" onVolver={onVolver} volverLabel="Dashboard" />

      <p className="text-[11px] font-semibold px-5 mt-2 mb-1 tracking-wide" style={{ color: COLORS.inkMuted }}>
        RECORTE DE INGRESO RÁPIDO PARA ESTE MOCKUP
      </p>

      <div className="flex gap-2 px-4 pt-2 flex-wrap">
        {tipos.map((t) => {
          const active = tipo === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTipo(t.key)}
              className="px-3.5 py-2 rounded-xl text-sm font-medium"
              style={{
                background: active ? COLORS.accent : COLORS.surface,
                color: active ? "#fff" : COLORS.inkMuted,
                border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tipo === "PRESTAMO" ? (
        <div className="px-4 mt-5 flex flex-col gap-2.5">
          <p className="text-xs font-medium" style={{ color: COLORS.inkMuted }}>
            Un préstamo no es gasto ni ingreso. Elegí qué querés registrar:
          </p>
          <button
            onClick={onEntregar}
            className="flex items-center gap-3 rounded-2xl p-4 text-left"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 38, height: 38, background: COLORS.accentSoft, color: COLORS.accent }}>
              <HandCoins size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Entregar préstamo</p>
              <p className="text-xs" style={{ color: COLORS.inkMuted }}>
                Le prestás plata a alguien
              </p>
            </div>
            <ArrowRight size={16} style={{ color: COLORS.inkMuted }} />
          </button>
          <button
            onClick={onDevolucion}
            className="flex items-center gap-3 rounded-2xl p-4 text-left"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 38, height: 38, background: COLORS.accentSoft, color: COLORS.accent }}>
              <Undo2 size={18} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Registrar devolución</p>
              <p className="text-xs" style={{ color: COLORS.inkMuted }}>
                Te devuelven un préstamo pendiente
              </p>
            </div>
            <ArrowRight size={16} style={{ color: COLORS.inkMuted }} />
          </button>
        </div>
      ) : (
        <div className="px-4 mt-8 text-center">
          <p className="text-sm" style={{ color: COLORS.inkMuted }}>
            El formulario de "{tipos.find((t) => t.key === tipo).label}" no cambia y se omite en este mockup.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Pantalla principal de Préstamos — lista
// ─────────────────────────────────────────────

function ResumenCard({ totalPorCobrar, cantidadPendientes }) {
  return (
    <div className="mx-4 mt-3 rounded-2xl p-5" style={{ background: COLORS.accentSoft }}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <HandCoins size={14} style={{ color: COLORS.accent }} />
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: COLORS.accent }}>
          Total por cobrar
        </p>
      </div>
      <p className="text-4xl font-bold tabular-nums" style={{ color: COLORS.accent, letterSpacing: "-0.02em" }}>
        {formatCLP(totalPorCobrar)}
      </p>
      <p className="text-xs mt-1" style={{ color: COLORS.accent, opacity: 0.75 }}>
        {cantidadPendientes > 0
          ? `Suma de ${cantidadPendientes} préstamo${cantidadPendientes === 1 ? "" : "s"} pendiente${cantidadPendientes === 1 ? "" : "s"} · saldados e incobrables no cuentan`
          : "No tenés préstamos pendientes"}
      </p>
    </div>
  );
}

function Tabs({ tab, setTab, counts }) {
  const opciones = [
    { key: "PENDIENTE", label: "Pendientes" },
    { key: "SALDADO", label: "Saldados" },
    { key: "INCOBRABLE", label: "Incobrables" },
  ];
  return (
    <div className="flex gap-1.5 px-4 mt-4 overflow-x-auto">
      {opciones.map((op) => {
        const active = tab === op.key;
        return (
          <button
            key={op.key}
            onClick={() => setTab(op.key)}
            className="flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-medium shrink-0"
            style={{
              background: active ? COLORS.accent : COLORS.surface,
              color: active ? "#fff" : COLORS.inkMuted,
              border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
            }}
          >
            {op.label}
            <span
              className="text-[10px] font-semibold px-1.5 rounded-full"
              style={{ background: active ? "rgba(255,255,255,0.25)" : COLORS.border, color: active ? "#fff" : COLORS.inkMuted }}
            >
              {counts[op.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PrestamoCard({ prestamo, cuentas, onRegistrarDevolucion, onVerDetalle }) {
  const pendiente = prestamo.estado === "PENDIENTE";
  const saldo = saldoPendiente(prestamo);
  const devuelto = montoDevuelto(prestamo);
  const cuentaOrigen = cuentaPorId(cuentas, prestamo.cuentaOrigenId);

  return (
    <div className="rounded-2xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs" style={{ color: COLORS.inkMuted }}>
            {prestamo.estado === "SALDADO" ? "Prestado (saldado)" : "Saldo pendiente"}
          </p>
          <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color: pendiente ? COLORS.ink : COLORS.inkMuted }}>
            {formatCLP(saldo)}
          </p>
        </div>
        <EstadoBadge estado={prestamo.estado} />
      </div>

      <div className="flex items-center gap-3 mt-3 text-xs flex-wrap" style={{ color: COLORS.inkMuted }}>
        <span>Original {formatCLP(prestamo.montoOriginal)}</span>
        <span>·</span>
        <span>Devuelto {formatCLP(devuelto)}</span>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs flex-wrap" style={{ color: COLORS.inkMuted }}>
        <span className="flex items-center gap-1">
          <Calendar size={11} /> {prestamo.fechaEntrega}
        </span>
        <span>·</span>
        <span>{cuentaOrigen ? cuentaOrigen.nombre : "Cuenta eliminada"}</span>
      </div>

      <div className="flex gap-2 mt-3">
        {pendiente && (
          <button
            onClick={() => onRegistrarDevolucion(prestamo.id)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl"
            style={{ background: COLORS.accent, color: "#fff" }}
          >
            <Undo2 size={13} />
            Registrar devolución
          </button>
        )}
        <button
          onClick={() => onVerDetalle(prestamo.id)}
          className="flex-1 text-xs font-medium px-3 py-2 rounded-xl"
          style={{ color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` }}
        >
          Ver detalle
        </button>
      </div>
    </div>
  );
}

function PersonaGroup({ persona, prestamos, cuentas, onRegistrarDevolucion, onVerDetalle }) {
  const totalPersona = prestamos.reduce((acc, p) => acc + saldoPendiente(p), 0);
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-1.5">
          <Users size={13} style={{ color: COLORS.inkMuted }} />
          <p className="text-sm font-medium">{persona}</p>
          {prestamos.length > 1 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: COLORS.border, color: COLORS.inkMuted }}>
              {prestamos.length} préstamos
            </span>
          )}
        </div>
        <span className="text-xs font-semibold tabular-nums" style={{ color: COLORS.inkMuted }}>
          {formatCLP(totalPersona)}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {prestamos.map((p) => (
          <PrestamoCard key={p.id} prestamo={p} cuentas={cuentas} onRegistrarDevolucion={onRegistrarDevolucion} onVerDetalle={onVerDetalle} />
        ))}
      </div>
    </div>
  );
}

function ListaPrestamos({ prestamos, cuentas, tab, setTab, totalPorCobrar, onVolver, onNuevo, onRegistrarDevolucion, onVerDetalle }) {
  const counts = {
    PENDIENTE: prestamos.filter((p) => p.estado === "PENDIENTE").length,
    SALDADO: prestamos.filter((p) => p.estado === "SALDADO").length,
    INCOBRABLE: prestamos.filter((p) => p.estado === "INCOBRABLE").length,
  };
  const visibles = prestamos.filter((p) => p.estado === tab);

  const grupos = useMemo(() => {
    const acc = {};
    visibles.forEach((p) => {
      if (!acc[p.persona]) acc[p.persona] = [];
      acc[p.persona].push(p);
    });
    return acc;
  }, [visibles]);

  const mensajeVacio = {
    PENDIENTE: "No tenés préstamos pendientes",
    SALDADO: "Todavía no hay préstamos saldados",
    INCOBRABLE: "No tenés préstamos marcados como incobrables",
  }[tab];

  return (
    <div className="w-full max-w-sm pb-28" style={{ color: COLORS.ink }}>
      <TopBar titulo="" onVolver={onVolver} volverLabel="Dashboard" />
      <div className="px-5 -mt-1">
        <h1 className="text-lg font-semibold tracking-tight">Préstamos</h1>
        <p className="text-sm" style={{ color: COLORS.inkMuted }}>
          Dinero por cobrar
        </p>
      </div>

      <ResumenCard totalPorCobrar={totalPorCobrar} cantidadPendientes={counts.PENDIENTE} />
      <Tabs tab={tab} setTab={setTab} counts={counts} />

      <div className="px-4 mt-4">
        {Object.keys(grupos).length === 0 ? (
          <div className="mt-8 text-center px-4">
            <p className="text-sm font-medium">{mensajeVacio}</p>
            {tab === "PENDIENTE" && (
              <>
                <p className="text-xs mt-1" style={{ color: COLORS.inkMuted }}>
                  Cuando le prestes plata a alguien, registralo acá para llevar la cuenta.
                </p>
                <button
                  onClick={onNuevo}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full"
                  style={{ background: COLORS.accent, color: "#fff" }}
                >
                  <Plus size={15} />
                  Registrar préstamo
                </button>
              </>
            )}
          </div>
        ) : (
          Object.entries(grupos).map(([persona, lista]) => (
            <PersonaGroup key={persona} persona={persona} prestamos={lista} cuentas={cuentas} onRegistrarDevolucion={onRegistrarDevolucion} onVerDetalle={onVerDetalle} />
          ))
        )}
      </div>

      <button
        onClick={onNuevo}
        className="fixed rounded-full flex items-center justify-center gap-1.5 shadow-lg text-sm font-semibold"
        style={{ padding: "12px 20px", background: COLORS.accent, color: "#fff", bottom: 24, left: "50%", transform: "translateX(-50%)" }}
      >
        <Plus size={18} />
        Nuevo préstamo
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Formulario — Nuevo préstamo (entrega)
// ─────────────────────────────────────────────

function FormNuevoPrestamo({ cuentas, onVolver, onRegistrar }) {
  const [persona, setPersona] = useState("");
  const [montoRaw, setMontoRaw] = useState("");
  const [cuentaOrigenId, setCuentaOrigenId] = useState(cuentasSeleccionables(cuentas)[0]?.id || null);
  const [fecha] = useState("Hoy · 16 jul");
  const [notas, setNotas] = useState("");

  const monto = Number(montoRaw || 0);
  const cuentaOrigen = cuentaPorId(cuentas, cuentaOrigenId);
  const excedeSaldo = cuentaOrigen ? monto > cuentaOrigen.saldo : false;
  const puedeGuardar = persona.trim().length > 0 && monto > 0 && Boolean(cuentaOrigenId) && !excedeSaldo;

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <TopBar
        titulo="Nuevo préstamo"
        onVolver={onVolver}
        accionDerecha={
          <button
            disabled={!puedeGuardar}
            onClick={() => onRegistrar({ persona: persona.trim(), montoOriginal: monto, cuentaOrigenId, fechaEntrega: "Hoy", notas })}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold"
            style={{ background: puedeGuardar ? COLORS.accent : COLORS.disabled, color: "#fff" }}
          >
            <Check size={15} />
            Registrar
          </button>
        }
      />

      <ExplicacionBanner icon={HandCoins} texto="Entrega de préstamo — no se registra como gasto" />

      <div className="px-4 flex flex-col gap-4 mt-4">
        <Campo label="Persona">
          <input
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            placeholder="Ej: Persona demo"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={inputStyle}
          />
          <p className="text-[11px] mt-1" style={{ color: COLORS.inkMuted }}>
            Es solo un nombre de texto libre, no hay catálogo de contactos.
          </p>
        </Campo>

        <Campo label="Monto entregado" error={excedeSaldo ? `Supera el saldo disponible de ${cuentaOrigen?.nombre} (${formatCLP(cuentaOrigen?.saldo || 0)}).` : null}>
          <div className="flex items-center gap-1 rounded-xl px-3.5 py-2.5" style={{ ...inputStyle, border: `1px solid ${excedeSaldo ? COLORS.negative : COLORS.border}` }}>
            <span style={{ color: COLORS.inkMuted }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formatMontoInput(montoRaw)}
              onChange={(e) => setMontoRaw(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-transparent outline-none tabular-nums text-sm"
              autoFocus
            />
          </div>
        </Campo>

        <Campo label="Cuenta de origen">
          <CuentaSelector cuentas={cuentas} seleccionadaId={cuentaOrigenId} onSelect={setCuentaOrigenId} />
        </Campo>

        <Campo label="Fecha de entrega">
          <button className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm" style={inputStyle}>
            <span style={{ color: COLORS.inkMuted }}>Fecha</span>
            <span className="font-medium">{fecha}</span>
          </button>
        </Campo>

        <Campo label="Notas (opcional)">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Ej: para el arriendo del mes"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none"
            style={inputStyle}
          />
        </Campo>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Formulario — Editar préstamo (solo sin devoluciones)
// ─────────────────────────────────────────────

function FormEditarPrestamo({ prestamo, cuentas, onVolver, onGuardar }) {
  const [persona, setPersona] = useState(prestamo.persona);
  const [montoRaw, setMontoRaw] = useState(String(prestamo.montoOriginal));
  const [cuentaOrigenId, setCuentaOrigenId] = useState(prestamo.cuentaOrigenId);
  const [notas, setNotas] = useState(prestamo.notas);

  const monto = Number(montoRaw || 0);
  const cuentaOrigen = cuentaPorId(cuentas, cuentaOrigenId);
  // El monto original de este préstamo sigue "reservado" en su cuenta
  // actual hasta que se guarde el cambio, así que al mostrar disponible
  // se lo devolvemos hipotéticamente a esa cuenta.
  const saldoExtra = { cuentaId: prestamo.cuentaOrigenId, monto: prestamo.montoOriginal };
  const disponible = cuentaOrigen ? cuentaOrigen.saldo + (saldoExtra.cuentaId === cuentaOrigenId ? saldoExtra.monto : 0) : 0;
  const excedeSaldo = monto > disponible;
  const puedeGuardar = persona.trim().length > 0 && monto > 0 && Boolean(cuentaOrigenId) && !excedeSaldo;

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <TopBar
        titulo="Editar préstamo"
        onVolver={onVolver}
        accionDerecha={
          <button
            disabled={!puedeGuardar}
            onClick={() => onGuardar({ persona: persona.trim(), montoOriginal: monto, cuentaOrigenId, notas })}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold"
            style={{ background: puedeGuardar ? COLORS.accent : COLORS.disabled, color: "#fff" }}
          >
            <Check size={15} />
            Guardar
          </button>
        }
      />

      <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: COLORS.amberSoft }}>
        <Pencil size={16} style={{ color: COLORS.amber }} />
        <p className="text-xs font-medium" style={{ color: COLORS.amber }}>
          Editable porque todavía no tiene devoluciones registradas
        </p>
      </div>

      <div className="px-4 flex flex-col gap-4 mt-4">
        <Campo label="Persona">
          <input value={persona} onChange={(e) => setPersona(e.target.value)} className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
        </Campo>

        <Campo label="Monto entregado" error={excedeSaldo ? `Supera el saldo disponible de ${cuentaOrigen?.nombre} (${formatCLP(disponible)}).` : null}>
          <div className="flex items-center gap-1 rounded-xl px-3.5 py-2.5" style={{ ...inputStyle, border: `1px solid ${excedeSaldo ? COLORS.negative : COLORS.border}` }}>
            <span style={{ color: COLORS.inkMuted }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              value={formatMontoInput(montoRaw)}
              onChange={(e) => setMontoRaw(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-transparent outline-none tabular-nums text-sm"
            />
          </div>
        </Campo>

        <Campo label="Cuenta de origen">
          <CuentaSelector cuentas={cuentas} seleccionadaId={cuentaOrigenId} onSelect={setCuentaOrigenId} saldoExtra={saldoExtra} />
        </Campo>

        <Campo label="Notas (opcional)">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none" style={inputStyle} />
        </Campo>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Formulario — Registrar devolución
// ─────────────────────────────────────────────

function FormDevolucion({ prestamos, cuentas, prestamoIdInicial, onVolver, onRegistrar }) {
  const [prestamoId, setPrestamoId] = useState(prestamoIdInicial);
  const [montoRaw, setMontoRaw] = useState("");
  const [cuentaDestinoId, setCuentaDestinoId] = useState(cuentasSeleccionables(cuentas)[0]?.id || null);
  const [fecha] = useState("Hoy · 16 jul");
  const [notas, setNotas] = useState("");

  const pendientes = prestamos.filter((p) => p.estado === "PENDIENTE");
  const prestamo = prestamos.find((p) => p.id === prestamoId);

  if (!prestamo) {
    return (
      <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
        <TopBar titulo="Registrar devolución" onVolver={onVolver} />
        <div className="px-4 mt-2">
          <p className="text-xs font-medium mb-2" style={{ color: COLORS.inkMuted }}>
            Elegí qué préstamo pendiente te están devolviendo
          </p>
          <div className="flex flex-col gap-2.5">
            {pendientes.map((p) => (
              <button
                key={p.id}
                onClick={() => setPrestamoId(p.id)}
                className="w-full flex items-center justify-between rounded-2xl p-4 text-left"
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
              >
                <div>
                  <p className="text-sm font-medium">{p.persona}</p>
                  <p className="text-xs mt-0.5" style={{ color: COLORS.inkMuted }}>
                    Entregado el {p.fechaEntrega}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatCLP(saldoPendiente(p))}</span>
              </button>
            ))}
            {pendientes.length === 0 && (
              <p className="text-sm text-center mt-4" style={{ color: COLORS.inkMuted }}>
                No hay préstamos pendientes para devolver.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const saldo = saldoPendiente(prestamo);
  const monto = Number(montoRaw || 0);
  const excedeSaldo = monto > saldo;
  const saldoRestante = Math.max(0, saldo - monto);
  const saldaCompleto = monto > 0 && monto >= saldo;
  const puedeGuardar = monto > 0 && !excedeSaldo && Boolean(cuentaDestinoId);

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <TopBar
        titulo="Registrar devolución"
        onVolver={onVolver}
        accionDerecha={
          <button
            disabled={!puedeGuardar}
            onClick={() => onRegistrar({ prestamoId: prestamo.id, monto, cuentaDestinoId, notas })}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold"
            style={{ background: puedeGuardar ? COLORS.accent : COLORS.disabled, color: "#fff" }}
          >
            <Check size={15} />
            Registrar
          </button>
        }
      />

      <ExplicacionBanner icon={Undo2} texto="Devolución de préstamo — no se registra como ingreso" />

      <div className="mx-4 mt-3 rounded-2xl p-4 flex items-center justify-between" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
        <div>
          <p className="text-sm font-medium">{prestamo.persona}</p>
          <p className="text-xs mt-0.5" style={{ color: COLORS.inkMuted }}>
            Saldo pendiente
          </p>
        </div>
        <span className="text-lg font-bold tabular-nums">{formatCLP(saldo)}</span>
      </div>

      {!prestamoIdInicial && (
        <div className="px-4 mt-2">
          <button onClick={() => setPrestamoId(null)} className="text-xs font-medium" style={{ color: COLORS.accent }}>
            Cambiar préstamo
          </button>
        </div>
      )}

      <div className="px-4 flex flex-col gap-4 mt-4">
        <Campo label="Monto devuelto" error={excedeSaldo ? `No puede ser mayor al saldo pendiente (${formatCLP(saldo)}).` : null}>
          <div className="flex items-center gap-1 rounded-xl px-3.5 py-2.5" style={{ ...inputStyle, border: `1px solid ${excedeSaldo ? COLORS.negative : COLORS.border}` }}>
            <span style={{ color: COLORS.inkMuted }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={formatMontoInput(montoRaw)}
              onChange={(e) => setMontoRaw(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-transparent outline-none tabular-nums text-sm"
              autoFocus
            />
          </div>
        </Campo>

        <Campo label="Cuenta donde ingresa el dinero">
          <CuentaSelector cuentas={cuentas} seleccionadaId={cuentaDestinoId} onSelect={setCuentaDestinoId} />
          <p className="text-[11px] mt-1" style={{ color: COLORS.inkMuted }}>
            Acá no se valida contra ningún saldo: el dinero está entrando a la cuenta, no saliendo.
          </p>
        </Campo>

        <Campo label="Fecha">
          <button className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm" style={inputStyle}>
            <span style={{ color: COLORS.inkMuted }}>Fecha</span>
            <span className="font-medium">{fecha}</span>
          </button>
        </Campo>

        <Campo label="Notas (opcional)">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none" style={inputStyle} />
        </Campo>

        {monto > 0 && !excedeSaldo && (
          <div className="rounded-xl p-3.5" style={{ background: saldaCompleto ? COLORS.accentSoft : COLORS.bg, border: `1px solid ${COLORS.border}` }}>
            <p className="text-xs" style={{ color: COLORS.inkMuted }}>
              Saldo restante después de esta devolución
            </p>
            <p className="text-lg font-semibold tabular-nums mt-0.5">{formatCLP(saldoRestante)}</p>
            {saldaCompleto && (
              <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: COLORS.accent }}>
                <Check size={12} /> Este préstamo pasará a estado Saldado
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Modales de confirmación
// ─────────────────────────────────────────────

function ModalConfirmarAnular({ prestamo, cuentaOrigen, onCancelar, onConfirmar }) {
  return (
    <div className="fixed inset-0 flex items-end justify-center z-10" style={{ background: "rgba(28, 35, 31, 0.45)" }}>
      <div className="w-full max-w-sm rounded-t-3xl p-5" style={{ background: COLORS.surface }}>
        <div className="flex items-center gap-2 mb-2">
          <TriangleAlert size={18} style={{ color: COLORS.negative }} />
          <p className="text-sm font-semibold">Anular este préstamo</p>
        </div>
        <p className="text-sm mb-3" style={{ color: COLORS.inkMuted }}>
          Se va a eliminar el préstamo de <strong>{prestamo.persona}</strong> por {formatCLP(prestamo.montoOriginal)} y se
          revertirá su efecto en <strong>{cuentaOrigen?.nombre}</strong>: el saldo de esa cuenta va a subir en{" "}
          {formatCLP(prestamo.montoOriginal)}, como si la entrega nunca hubiera pasado.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onCancelar} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: COLORS.accent, color: "#fff" }}>
            Cancelar
          </button>
          <button onClick={onConfirmar} className="w-full py-2.5 rounded-xl text-sm font-medium" style={{ color: COLORS.negative, border: `1px solid ${COLORS.border}` }}>
            Anular préstamo
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalConfirmarIncobrable({ prestamo, onCancelar, onConfirmar }) {
  return (
    <div className="fixed inset-0 flex items-end justify-center z-10" style={{ background: "rgba(28, 35, 31, 0.45)" }}>
      <div className="w-full max-w-sm rounded-t-3xl p-5" style={{ background: COLORS.surface }}>
        <div className="flex items-center gap-2 mb-2">
          <TriangleAlert size={18} style={{ color: COLORS.negative }} />
          <p className="text-sm font-semibold">Marcar como incobrable</p>
        </div>
        <p className="text-sm mb-3" style={{ color: COLORS.inkMuted }}>
          El préstamo de <strong>{prestamo.persona}</strong> va a quedar marcado como que ya no se espera recuperar el
          saldo pendiente de {formatCLP(saldoPendiente(prestamo))}. Esto no modifica ningún saldo de cuenta ni crea
          movimientos: solo cambia el estado. Podés volver a "Pendiente" cuando quieras.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onCancelar} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: COLORS.accent, color: "#fff" }}>
            Cancelar
          </button>
          <button onClick={onConfirmar} className="w-full py-2.5 rounded-xl text-sm font-medium" style={{ color: COLORS.negative, border: `1px solid ${COLORS.border}` }}>
            Marcar como incobrable
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Detalle de un préstamo
// ─────────────────────────────────────────────

function DetallePrestamo({ prestamo, cuentas, onVolver, onRegistrarDevolucion, onEditar, onPedirAnular, onPedirIncobrable, onVolverAPendiente }) {
  const saldo = saldoPendiente(prestamo);
  const devuelto = montoDevuelto(prestamo);
  const cuentaOrigen = cuentaPorId(cuentas, prestamo.cuentaOrigenId);
  const cfg = ESTADO_UI[prestamo.estado];
  const sinDevoluciones = prestamo.historial.length === 0;

  const fila = (label, valor) => (
    <div className="flex items-center justify-between py-2.5" style={{ borderTop: `1px solid ${COLORS.border}` }}>
      <span className="text-xs" style={{ color: COLORS.inkMuted }}>
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums">{valor}</span>
    </div>
  );

  return (
    <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
      <TopBar titulo="Detalle del préstamo" onVolver={onVolver} />

      <div className="px-4 mt-2">
        <div className="rounded-2xl p-5" style={{ background: cfg.soft }}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <Users size={13} style={{ color: cfg.color }} />
            <p className="text-xs font-medium" style={{ color: cfg.color }}>
              {prestamo.persona}
            </p>
          </div>
          <p className="text-3xl font-bold tabular-nums" style={{ color: cfg.color }}>
            {formatCLP(saldo)}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <EstadoBadge estado={prestamo.estado} size="md" />
            <span className="text-xs" style={{ color: cfg.color, opacity: 0.8 }}>
              {prestamo.estado === "PENDIENTE" && "saldo por cobrar"}
              {prestamo.estado === "SALDADO" && "préstamo saldado por completo"}
              {prestamo.estado === "INCOBRABLE" && "no se espera recuperar este saldo"}
            </span>
          </div>
        </div>

        <div className="rounded-2xl px-4 mt-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
          {fila("Monto original", formatCLP(prestamo.montoOriginal))}
          {fila("Total devuelto", formatCLP(devuelto))}
          {fila("Saldo pendiente", formatCLP(saldo))}
          {fila("Cuenta de origen", cuentaOrigen ? cuentaOrigen.nombre : "—")}
          {fila("Fecha de entrega", prestamo.fechaEntrega)}
        </div>

        {prestamo.notas && (
          <div className="mt-3">
            <p className="text-xs font-medium mb-1" style={{ color: COLORS.inkMuted }}>
              Notas
            </p>
            <p className="text-sm">{prestamo.notas}</p>
          </div>
        )}

        {/* Historial de devoluciones */}
        <div className="mt-4">
          <p className="text-xs font-medium mb-2" style={{ color: COLORS.inkMuted }}>
            Historial de devoluciones
          </p>
          {prestamo.historial.length === 0 ? (
            <p className="text-xs" style={{ color: COLORS.inkMuted }}>
              Todavía no se registró ninguna devolución.
            </p>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
              {prestamo.historial.map((h, i) => {
                const cuentaDestino = cuentaPorId(cuentas, h.cuentaDestinoId);
                const saldoRestanteEvento = prestamo.montoOriginal - prestamo.historial.slice(0, i + 1).reduce((acc, e) => acc + e.monto, 0);
                return (
                  <div key={h.id} className="px-4 py-3" style={{ borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{formatCLP(h.monto)}</span>
                      <span className="text-xs" style={{ color: COLORS.inkMuted }}>
                        {h.fecha}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs" style={{ color: COLORS.inkMuted }}>
                        Recibido en {cuentaDestino ? cuentaDestino.nombre : "—"}
                      </span>
                      <span className="text-xs tabular-nums" style={{ color: COLORS.inkMuted }}>
                        Restante {formatCLP(saldoRestanteEvento)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Acciones según estado */}
        <div className="flex flex-col gap-2 mt-5">
          {prestamo.estado === "PENDIENTE" && (
            <button
              onClick={() => onRegistrarDevolucion(prestamo.id)}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-3 rounded-xl"
              style={{ background: COLORS.accent, color: "#fff" }}
            >
              <Undo2 size={15} />
              Registrar devolución
            </button>
          )}

          {sinDevoluciones && prestamo.estado !== "SALDADO" && (
            <div className="flex gap-2">
              <button
                onClick={() => onEditar(prestamo.id)}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-xl"
                style={{ color: COLORS.ink, border: `1px solid ${COLORS.border}` }}
              >
                <Pencil size={14} />
                Editar
              </button>
              <button
                onClick={() => onPedirAnular(prestamo.id)}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-xl"
                style={{ color: COLORS.negative, border: `1px solid ${COLORS.border}` }}
              >
                <Ban size={14} />
                Anular
              </button>
            </div>
          )}

          {!sinDevoluciones && prestamo.estado !== "SALDADO" && (
            <p className="text-[11px] text-center" style={{ color: COLORS.inkMuted }}>
              Este préstamo ya tiene devoluciones registradas: no se puede editar ni eliminar directamente, para no
              romper el historial.
            </p>
          )}

          {prestamo.estado === "PENDIENTE" && (
            <button
              onClick={() => onPedirIncobrable(prestamo.id)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-xl"
              style={{ color: COLORS.negative, border: `1px solid ${COLORS.border}` }}
            >
              <XCircle size={13} />
              Marcar como incobrable
            </button>
          )}

          {prestamo.estado === "INCOBRABLE" && (
            <button
              onClick={() => onVolverAPendiente(prestamo.id)}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-xl"
              style={{ color: COLORS.accent, border: `1px solid ${COLORS.border}` }}
            >
              <RotateCcw size={14} />
              Volver a pendiente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Selector de vista demo (no es parte de la app real)
// ─────────────────────────────────────────────

function SelectorVistaDemo({ pantalla, setPantalla }) {
  const opciones = [
    { key: "dashboard", label: "Dashboard" },
    { key: "ingresoRapido", label: "Ingreso rápido" },
    { key: "prestamos", label: "Préstamos" },
  ];
  return (
    <div className="w-full flex justify-center py-2" style={{ background: "#EDEEEC", borderBottom: `1px solid ${COLORS.border}` }}>
      <div className="w-full max-w-sm px-4 flex items-center gap-1.5">
        <LayoutGrid size={12} style={{ color: COLORS.inkMuted }} />
        <span className="text-[10px] font-medium mr-1" style={{ color: COLORS.inkMuted }}>
          Vista demo:
        </span>
        {opciones.map((op) => {
          const active =
            pantalla === op.key ||
            (op.key === "prestamos" && ["prestamos", "nuevo", "editar", "devolucion", "detalle"].includes(pantalla));
          return (
            <button
              key={op.key}
              onClick={() => setPantalla(op.key)}
              className="text-[10px] font-medium px-2 py-1 rounded-full"
              style={{
                background: active ? COLORS.ink : "transparent",
                color: active ? "#fff" : COLORS.inkMuted,
              }}
            >
              {op.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Contenedor principal
// ─────────────────────────────────────────────

function Prestamos() {
  const [cuentas, setCuentas] = useState(CUENTAS_INICIALES);
  const [prestamos, setPrestamos] = useState(PRESTAMOS_INICIALES);
  const [tab, setTab] = useState("PENDIENTE");

  // pantalla: dashboard | ingresoRapido | prestamos | nuevo | devolucion | detalle | editar
  const [pantalla, setPantalla] = useState("dashboard");
  const [prestamoActivoId, setPrestamoActivoId] = useState(null);
  const [modal, setModal] = useState(null); // 'anular' | 'incobrable' | null

  const totalPorCobrar = useMemo(
    () => prestamos.filter((p) => p.estado === "PENDIENTE").reduce((acc, p) => acc + saldoPendiente(p), 0),
    [prestamos]
  );
  const cantidadPendientes = prestamos.filter((p) => p.estado === "PENDIENTE").length;

  const irALista = () => {
    setPantalla("prestamos");
    setPrestamoActivoId(null);
    setModal(null);
  };

  const ajustarSaldoCuenta = (cuentaId, delta) => {
    setCuentas((prev) => prev.map((c) => (c.id === cuentaId ? { ...c, saldo: c.saldo + delta } : c)));
  };

  const crearPrestamo = (form) => {
    setPrestamos((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        persona: form.persona,
        montoOriginal: form.montoOriginal,
        cuentaOrigenId: form.cuentaOrigenId,
        fechaEntrega: form.fechaEntrega,
        notas: form.notas,
        estado: "PENDIENTE",
        historial: [],
      },
    ]);
    ajustarSaldoCuenta(form.cuentaOrigenId, -form.montoOriginal);
    setTab("PENDIENTE");
    irALista();
  };

  const guardarEdicion = (form) => {
    const original = prestamos.find((p) => p.id === prestamoActivoId);
    if (!original) return;
    // Revertir el efecto anterior y aplicar el nuevo, para que el saldo
    // de las cuentas involucradas quede consistente con el cambio.
    ajustarSaldoCuenta(original.cuentaOrigenId, original.montoOriginal);
    ajustarSaldoCuenta(form.cuentaOrigenId, -form.montoOriginal);
    setPrestamos((prev) =>
      prev.map((p) =>
        p.id === prestamoActivoId
          ? { ...p, persona: form.persona, montoOriginal: form.montoOriginal, cuentaOrigenId: form.cuentaOrigenId, notas: form.notas }
          : p
      )
    );
    irALista();
  };

  const registrarDevolucion = ({ prestamoId, monto, cuentaDestinoId, notas }) => {
    setPrestamos((prev) =>
      prev.map((p) => {
        if (p.id !== prestamoId) return p;
        const nuevoHistorial = [
          ...p.historial,
          { id: String(Date.now()), fecha: "Hoy", monto, cuentaDestinoId, notas },
        ];
        const totalDevuelto = nuevoHistorial.reduce((acc, h) => acc + h.monto, 0);
        const nuevoEstado = totalDevuelto >= p.montoOriginal ? "SALDADO" : "PENDIENTE";
        return { ...p, historial: nuevoHistorial, estado: nuevoEstado };
      })
    );
    ajustarSaldoCuenta(cuentaDestinoId, monto);
    irALista();
  };

  const confirmarAnular = () => {
    const p = prestamos.find((x) => x.id === prestamoActivoId);
    if (!p) return;
    ajustarSaldoCuenta(p.cuentaOrigenId, p.montoOriginal);
    setPrestamos((prev) => prev.filter((x) => x.id !== p.id));
    irALista();
  };

  const confirmarIncobrable = () => {
    setPrestamos((prev) => prev.map((p) => (p.id === prestamoActivoId ? { ...p, estado: "INCOBRABLE" } : p)));
    setModal(null);
  };

  const volverAPendiente = (id) => {
    setPrestamos((prev) => prev.map((p) => (p.id === id ? { ...p, estado: "PENDIENTE" } : p)));
  };

  const abrirDevolucion = (prestamoId) => {
    setPrestamoActivoId(prestamoId);
    setPantalla("devolucion");
  };

  const abrirDetalle = (prestamoId) => {
    setPrestamoActivoId(prestamoId);
    setPantalla("detalle");
  };

  const abrirEditar = (prestamoId) => {
    setPrestamoActivoId(prestamoId);
    setPantalla("editar");
  };

  const cambiarVistaDemo = (destino) => {
    if (destino === "prestamos") {
      irALista();
    } else {
      setPantalla(destino);
      setPrestamoActivoId(null);
      setModal(null);
    }
  };

  const prestamoActivo = prestamos.find((p) => p.id === prestamoActivoId);

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ background: COLORS.bg, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <SelectorVistaDemo pantalla={pantalla} setPantalla={cambiarVistaDemo} />

      <div className="flex justify-center w-full">
        {pantalla === "dashboard" && (
          <DashboardDemo totalPorCobrar={totalPorCobrar} cantidadPendientes={cantidadPendientes} onVerPrestamos={irALista} />
        )}

        {pantalla === "ingresoRapido" && (
          <IngresoRapidoDemo
            onVolver={() => setPantalla("dashboard")}
            onEntregar={() => setPantalla("nuevo")}
            onDevolucion={() => {
              setPrestamoActivoId(null);
              setPantalla("devolucion");
            }}
          />
        )}

        {pantalla === "prestamos" && (
          <ListaPrestamos
            prestamos={prestamos}
            cuentas={cuentas}
            tab={tab}
            setTab={setTab}
            totalPorCobrar={totalPorCobrar}
            onVolver={() => setPantalla("dashboard")}
            onNuevo={() => setPantalla("nuevo")}
            onRegistrarDevolucion={abrirDevolucion}
            onVerDetalle={abrirDetalle}
          />
        )}

        {pantalla === "nuevo" && <FormNuevoPrestamo cuentas={cuentas} onVolver={irALista} onRegistrar={crearPrestamo} />}

        {pantalla === "editar" && prestamoActivo && (
          <FormEditarPrestamo prestamo={prestamoActivo} cuentas={cuentas} onVolver={() => abrirDetalle(prestamoActivo.id)} onGuardar={guardarEdicion} />
        )}

        {pantalla === "devolucion" && (
          <FormDevolucion prestamos={prestamos} cuentas={cuentas} prestamoIdInicial={prestamoActivoId} onVolver={irALista} onRegistrar={registrarDevolucion} />
        )}

        {pantalla === "detalle" && prestamoActivo && (
          <DetallePrestamo
            prestamo={prestamoActivo}
            cuentas={cuentas}
            onVolver={irALista}
            onRegistrarDevolucion={abrirDevolucion}
            onEditar={abrirEditar}
            onPedirAnular={(id) => {
              setPrestamoActivoId(id);
              setModal("anular");
            }}
            onPedirIncobrable={(id) => {
              setPrestamoActivoId(id);
              setModal("incobrable");
            }}
            onVolverAPendiente={volverAPendiente}
          />
        )}
      </div>

      {modal === "anular" && prestamoActivo && (
        <ModalConfirmarAnular
          prestamo={prestamoActivo}
          cuentaOrigen={cuentaPorId(cuentas, prestamoActivo.cuentaOrigenId)}
          onCancelar={() => setModal(null)}
          onConfirmar={confirmarAnular}
        />
      )}

      {modal === "incobrable" && prestamoActivo && (
        <ModalConfirmarIncobrable prestamo={prestamoActivo} onCancelar={() => setModal(null)} onConfirmar={confirmarIncobrable} />
      )}
    </div>
  );
}

export default Prestamos;
