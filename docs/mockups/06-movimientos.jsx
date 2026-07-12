import React, { useState, useMemo } from "react";
import {
  Search,
  ChevronDown,
  UtensilsCrossed,
  Wallet,
  Car,
  Home,
  ArrowLeftRight,
  X,
  Trash2,
} from "lucide-react";

// ─────────────────────────────────────────────
// MOCKUP — Listado de movimientos con filtros
// Refleja: agrupación por día, filtros de cuenta/
// período/categoría, y transferencias fusionadas
// visualmente en una sola línea "A → B" aunque en
// la base de datos sean 2 registros con el mismo
// transferId.
// ─────────────────────────────────────────────

const CUENTAS = ["Todas", "Demo Cuenta Principal", "Demo Billetera", "Demo Tarjeta", "Demo Cuenta Secundaria"];
const PERIODOS = ["Este mes", "Mes anterior"];
const CATEGORIAS = ["Delivery", "Auto", "Hogar", "Servicios", "Ingreso", "Otro"];

const MOVIMIENTOS_MOCK = [
  { id: "1", tipo: "GASTO", descripcion: "Pedido demo", categoria: "Delivery", monto: -8500, cuenta: "Demo Cuenta Principal", fecha: "2026-07-04", grupo: "HOY" },
  { id: "2", tipo: "INGRESO", descripcion: "Ingreso demo", categoria: "Ingreso", monto: 300000, cuenta: "Demo Cuenta Principal", fecha: "2026-07-01", grupo: "01 JUL" },
  { id: "3", tipo: "GASTO", descripcion: "Servicio mensual demo", categoria: "Hogar", monto: -120000, cuenta: "Demo Cuenta Principal", fecha: "2026-07-01", grupo: "01 JUL" },
  {
    id: "4a",
    tipo: "TRANSFERENCIA",
    descripcion: "Transferencia",
    categoria: null,
    monto: -50000,
    cuenta: "Demo Cuenta Principal",
    cuentaDestino: "Demo Billetera",
    transferId: "t1",
    fecha: "2026-06-30",
    grupo: "30 JUN",
  },
  { id: "5", tipo: "GASTO", descripcion: "Transporte demo", categoria: "Auto", monto: -25000, cuenta: "Demo Cuenta Principal", fecha: "2026-06-30", grupo: "30 JUN" },
  { id: "6", tipo: "GASTO", descripcion: "Compra demo", categoria: "Hogar", monto: -42000, cuenta: "Demo Billetera", fecha: "2026-06-28", grupo: "28 JUN" },
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

const ICONO_POR_CATEGORIA = {
  Delivery: UtensilsCrossed,
  Auto: Car,
  Hogar: Home,
  Ingreso: Wallet,
};

const formatCLP = (monto) => {
  const signo = monto < 0 ? "-" : "+";
  return `${signo}$${Math.abs(monto).toLocaleString("es-CL")}`;
};

function Dropdown({ label, value, opciones, onChange }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium shrink-0"
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.ink }}
      >
        {value === "Todas" || value === "Todas las categorías" ? label : value}
        <ChevronDown size={12} />
      </button>
      {abierto && (
        <div
          className="absolute top-9 left-0 rounded-xl overflow-hidden z-10 shadow-lg"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, minWidth: 150 }}
        >
          {opciones.map((op) => (
            <button
              key={op}
              onClick={() => {
                onChange(op);
                setAbierto(false);
              }}
              className="w-full text-left px-3.5 py-2 text-xs"
              style={{
                background: op === value ? COLORS.accentSoft : "transparent",
                color: op === value ? COLORS.accent : COLORS.ink,
              }}
            >
              {op}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilaMovimiento({ mov, onEliminar }) {
  const esTransferencia = mov.tipo === "TRANSFERENCIA";
  const Icono = esTransferencia ? ArrowLeftRight : ICONO_POR_CATEGORIA[mov.categoria] || Wallet;
  const [mostrarEliminar, setMostrarEliminar] = useState(false);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderTop: `1px solid ${COLORS.border}` }}
      onClick={() => setMostrarEliminar((v) => !v)}
    >
      <div
        className="flex items-center justify-center rounded-full shrink-0"
        style={{ width: 34, height: 34, background: COLORS.accentSoft, color: COLORS.accent }}
      >
        <Icono size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {esTransferencia ? `${mov.cuenta} → ${mov.cuentaDestino}` : mov.descripcion}
        </p>
        <p className="text-xs" style={{ color: COLORS.inkMuted }}>
          {esTransferencia ? "Transferencia" : `${mov.cuenta}`}
        </p>
      </div>
      {mostrarEliminar ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEliminar(mov.id);
          }}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full shrink-0"
          style={{ background: "#F7E9E7", color: "#B4483A" }}
        >
          <Trash2 size={12} /> Eliminar
        </button>
      ) : (
        <p
          className="text-sm font-semibold tabular-nums shrink-0"
          style={{ color: mov.monto < 0 ? COLORS.ink : COLORS.accent }}
        >
          {formatCLP(mov.monto)}
        </p>
      )}
    </div>
  );
}

function Movimientos() {
  const [movimientos, setMovimientos] = useState(MOVIMIENTOS_MOCK);
  const [cuenta, setCuenta] = useState("Todas");
  const [periodo, setPeriodo] = useState("Este mes");
  const [categoria, setCategoria] = useState("Todas las categorías");

  const filtrados = useMemo(() => {
    return movimientos.filter((m) => {
      if (cuenta !== "Todas" && m.cuenta !== cuenta && m.cuentaDestino !== cuenta) return false;
      if (categoria !== "Todas las categorías" && m.categoria !== categoria) return false;
      // El filtro de período es solo ilustrativo en el mock: no hay fecha "actual"
      // real contra la cual comparar mes anterior/actual de forma determinística.
      return true;
    });
  }, [movimientos, cuenta, categoria]);

  const grupos = useMemo(() => {
    const acc = {};
    filtrados.forEach((m) => {
      if (!acc[m.grupo]) acc[m.grupo] = [];
      acc[m.grupo].push(m);
    });
    return acc;
  }, [filtrados]);

  const eliminarMovimiento = (id) => {
    setMovimientos((prev) => prev.filter((m) => m.id !== id));
  };

  const limpiarFiltros = () => {
    setCuenta("Todas");
    setPeriodo("Este mes");
    setCategoria("Todas las categorías");
  };

  const hayFiltrosActivos = cuenta !== "Todas" || categoria !== "Todas las categorías";

  return (
    <div className="min-h-screen flex justify-center" style={{ background: COLORS.bg, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <div className="w-full max-w-sm pb-10" style={{ color: COLORS.ink }}>
        <div className="flex items-center justify-between px-5 pt-6 pb-3">
          <h1 className="text-lg font-semibold tracking-tight">Movimientos</h1>
          <Search size={18} style={{ color: COLORS.inkMuted }} />
        </div>

        {/* Filtros */}
        <div className="flex gap-2 px-4 overflow-x-auto pb-1">
          <Dropdown label="Cuenta" value={cuenta} opciones={CUENTAS} onChange={setCuenta} />
          <Dropdown label="Período" value={periodo} opciones={PERIODOS} onChange={setPeriodo} />
          <Dropdown label="Categoría" value={categoria} opciones={["Todas las categorías", ...CATEGORIAS]} onChange={setCategoria} />
        </div>

        {hayFiltrosActivos && (
          <div className="px-4 mt-2">
            <button onClick={limpiarFiltros} className="flex items-center gap-1 text-xs font-medium" style={{ color: COLORS.accent }}>
              <X size={12} /> Limpiar filtros
            </button>
          </div>
        )}

        {/* Lista agrupada por día */}
        <div className="mt-3">
          {Object.keys(grupos).length === 0 ? (
            <div className="px-4 mt-10 text-center">
              <p className="text-sm" style={{ color: COLORS.inkMuted }}>
                No hay movimientos con estos filtros.
              </p>
              <button onClick={limpiarFiltros} className="text-sm font-medium mt-2" style={{ color: COLORS.accent }}>
                Limpiar filtros
              </button>
            </div>
          ) : (
            Object.entries(grupos).map(([grupo, movs]) => (
              <div key={grupo} className="mb-4">
                <p className="text-xs font-semibold px-5 mb-1.5" style={{ color: COLORS.inkMuted }}>
                  {grupo}
                </p>
                <div className="mx-4 rounded-2xl overflow-hidden" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                  {movs.map((mov, i) => (
                    <div key={mov.id} style={{ borderTop: i === 0 ? "none" : undefined }}>
                      <FilaMovimiento mov={mov} onEliminar={eliminarMovimiento} />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-[11px] text-center mt-2 px-6" style={{ color: COLORS.inkMuted }}>
          Tocá un movimiento para ver la opción de eliminar. En la app real, el gesto es swipe.
        </p>
      </div>
    </div>
  );
}

export default Movimientos;
