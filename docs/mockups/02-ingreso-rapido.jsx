import React, { useState, useMemo } from "react";
import {
  X,
  Check,
  ArrowLeftRight,
  Car,
  Utensils,
  Bike,
  Users,
  Gamepad2,
  Zap,
  Repeat,
  Banknote,
  MoreHorizontal,
  Wallet,
  ArrowDownLeft,
} from "lucide-react";

// ─────────────────────────────────────────────
// MOCKUP — Ingreso rápido de movimiento
// Datos hardcodeados (cuentas, categorías). El
// objetivo de este mockup es validar el flujo de
// interacción (taps, orden de campos, feedback
// visual), no la integración real con el backend.
// ─────────────────────────────────────────────

const CUENTAS = [
  { id: "demo-principal", nombre: "Demo Cuenta Principal" },
  { id: "demo-billetera", nombre: "Demo Billetera" },
  { id: "demo-tarjeta", nombre: "Demo Tarjeta" },
  { id: "demo-secundaria", nombre: "Demo Cuenta Secundaria" },
];

// Última cuenta usada — en la app real viene del último Transaction
// creado; acá se hardcodea para simular la preselección.
const CUENTA_ULTIMA_USADA = "demo-principal";

const CATEGORIAS_GASTO = [
  { id: "auto", nombre: "Auto", icon: Car },
  { id: "alimentacion", nombre: "Alimentación", icon: Utensils },
  { id: "delivery", nombre: "Delivery", icon: Bike },
  { id: "hogar_demo", nombre: "Hogar", icon: Users },
  { id: "entretenimiento", nombre: "Entret.", icon: Gamepad2 },
  { id: "equipo", nombre: "Equipo", icon: Wallet },
  { id: "servicios", nombre: "Servicios", icon: Zap },
  { id: "suscripciones", nombre: "Suscrip.", icon: Repeat },
  { id: "efectivo", nombre: "Efectivo", icon: Banknote },
  { id: "otro_gasto", nombre: "Otro", icon: MoreHorizontal },
];

const CATEGORIAS_INGRESO = [
  { id: "ingreso_demo", nombre: "Ingreso", icon: Wallet },
  { id: "transferencia_recibida", nombre: "Transf.", icon: ArrowDownLeft },
  { id: "otro_ingreso", nombre: "Otro", icon: MoreHorizontal },
];

const COLORS = {
  bg: "#F5F6F5",
  surface: "#FFFFFF",
  ink: "#1C231F",
  inkMuted: "#6B756E",
  accent: "#0F6B4F",
  accentSoft: "#E6F2ED",
  border: "#E4E7E3",
  disabled: "#C7CCC8",
};

const formatMonto = (raw) => {
  const digitos = raw.replace(/\D/g, "");
  if (!digitos) return "";
  return Number(digitos).toLocaleString("es-CL");
};

function TipoSelector({ tipo, setTipo }) {
  const opciones = [
    { key: "GASTO", label: "Gasto" },
    { key: "INGRESO", label: "Ingreso" },
    { key: "TRANSFERENCIA", label: null, icon: ArrowLeftRight },
  ];
  return (
    <div className="flex gap-2 px-4 pt-2">
      {opciones.map((op) => {
        const active = tipo === op.key;
        return (
          <button
            key={op.key}
            onClick={() => setTipo(op.key)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-colors"
            style={{
              background: active ? COLORS.accent : COLORS.surface,
              color: active ? "#fff" : COLORS.inkMuted,
              border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
            }}
          >
            {op.icon ? <op.icon size={16} /> : null}
            {op.label}
          </button>
        );
      })}
    </div>
  );
}

function CuentaChips({ cuentas, seleccionada, onSelect, excluir }) {
  const visibles = cuentas.filter((c) => c.id !== excluir);
  return (
    <div className="flex flex-wrap gap-2">
      {visibles.map((c) => {
        const active = c.id === seleccionada;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
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
  );
}

function CategoriaGrid({ categorias, seleccionada, onSelect }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {categorias.map((cat) => {
        const active = cat.id === seleccionada;
        const Icon = cat.icon;
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className="flex flex-col items-center gap-1 py-2 rounded-xl"
            style={{
              background: active ? COLORS.accentSoft : "transparent",
              border: `1px solid ${active ? COLORS.accent : "transparent"}`,
            }}
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 38,
                height: 38,
                background: active ? COLORS.accent : COLORS.border,
                color: active ? "#fff" : COLORS.inkMuted,
              }}
            >
              <Icon size={18} />
            </div>
            <span
              className="text-[10px] font-medium text-center leading-tight"
              style={{ color: active ? COLORS.accent : COLORS.inkMuted }}
            >
              {cat.nombre}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function IngresoRapido() {
  const [tipo, setTipo] = useState("GASTO");
  const [montoRaw, setMontoRaw] = useState("");
  const [cuentaId, setCuentaId] = useState(CUENTA_ULTIMA_USADA);
  const [cuentaDestinoId, setCuentaDestinoId] = useState(null);
  const [categoriaId, setCategoriaId] = useState(null);
  const [descripcion, setDescripcion] = useState("");
  const [fecha] = useState("Hoy · 04 jul");

  // Cambiar de tipo resetea selección de categoría / cuenta destino,
  // porque dejan de tener sentido entre GASTO/INGRESO y TRANSFERENCIA.
  const cambiarTipo = (nuevoTipo) => {
    setTipo(nuevoTipo);
    setCategoriaId(null);
    setCuentaDestinoId(null);
  };

  const categorias = tipo === "INGRESO" ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO;

  const puedeGuardar = useMemo(() => {
    const hayMonto = montoRaw.length > 0 && Number(montoRaw) > 0;
    if (!hayMonto || !cuentaId) return false;
    if (tipo === "TRANSFERENCIA") return Boolean(cuentaDestinoId);
    return Boolean(categoriaId);
  }, [montoRaw, cuentaId, cuentaDestinoId, categoriaId, tipo]);

  return (
    <div className="min-h-screen flex justify-center" style={{ background: COLORS.bg, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <div className="w-full max-w-sm" style={{ color: COLORS.ink }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-5 pb-1">
          <button className="p-1" aria-label="Cerrar" style={{ color: COLORS.inkMuted }}>
            <X size={22} />
          </button>
          <button
            disabled={!puedeGuardar}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold"
            style={{
              background: puedeGuardar ? COLORS.accent : COLORS.disabled,
              color: "#fff",
              cursor: puedeGuardar ? "pointer" : "not-allowed",
            }}
          >
            <Check size={15} />
            Guardar
          </button>
        </div>

        {/* Selector de tipo */}
        <TipoSelector tipo={tipo} setTipo={cambiarTipo} />

        {/* Monto — campo protagonista, teclado numérico nativo */}
        <div className="px-4 py-6 text-center">
          <div className="flex items-center justify-center gap-1">
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
              style={{ color: COLORS.ink, width: "220px" }}
              autoFocus
            />
          </div>
        </div>

        <div className="flex flex-col gap-5 px-4">
          {/* Cuenta(s) */}
          {tipo !== "TRANSFERENCIA" ? (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: COLORS.inkMuted }}>
                Cuenta
              </p>
              <CuentaChips cuentas={CUENTAS} seleccionada={cuentaId} onSelect={setCuentaId} />
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: COLORS.inkMuted }}>
                  Desde
                </p>
                <CuentaChips
                  cuentas={CUENTAS}
                  seleccionada={cuentaId}
                  onSelect={(id) => {
                    setCuentaId(id);
                    // Si la cuenta destino quedó igual a la nueva origen, se limpia
                    if (cuentaDestinoId === id) setCuentaDestinoId(null);
                  }}
                />
              </div>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: COLORS.inkMuted }}>
                  Hacia
                </p>
                <CuentaChips
                  cuentas={CUENTAS}
                  seleccionada={cuentaDestinoId}
                  onSelect={setCuentaDestinoId}
                  excluir={cuentaId}
                />
              </div>
            </>
          )}

          {/* Categoría — solo para GASTO / INGRESO */}
          {tipo !== "TRANSFERENCIA" && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: COLORS.inkMuted }}>
                Categoría
              </p>
              <CategoriaGrid categorias={categorias} seleccionada={categoriaId} onSelect={setCategoriaId} />
            </div>
          )}

          {/* Descripción opcional */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: COLORS.inkMuted }}>
              Descripción (opcional)
            </p>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: compra demo"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            />
          </div>

          {/* Fecha */}
          <button
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm"
            style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.inkMuted }}
          >
            <span>Fecha</span>
            <span className="font-medium" style={{ color: COLORS.ink }}>
              {fecha}
            </span>
          </button>
        </div>

        <div className="h-10" />
      </div>
    </div>
  );
}

export default IngresoRapido;
