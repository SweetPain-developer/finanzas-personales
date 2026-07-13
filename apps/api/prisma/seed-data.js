export const DEMO_USER = {
  id: "user-demo-initial",
  email: "demo@finanzas-personales.local",
  passwordHash: "demo-seed-password-hash-placeholder",
  displayName: "Usuario demo",
};

export const accounts = [
  {
    id: "account-demo-primary",
    nombre: "Demo Cuenta Principal",
    tipo: "OPERATIVA",
    saldo: 123_450,
    orden: 1,
  },
  {
    id: "account-demo-secondary",
    nombre: "Demo Cuenta Secundaria",
    tipo: "OPERATIVA",
    saldo: 45_000,
    orden: 2,
  },
  {
    id: "account-demo-wallet",
    nombre: "Demo Billetera",
    tipo: "OPERATIVA",
    saldo: 32_100,
    orden: 3,
  },
  {
    id: "account-demo-trip",
    nombre: "Demo - Viaje",
    tipo: "AHORRO",
    saldo: 80_000,
    orden: 4,
  },
  {
    id: "account-demo-reserve",
    nombre: "Demo - Reserva",
    tipo: "RESERVA",
    saldo: 60_000,
    orden: 5,
  },
];

export const categories = [
  { id: "category-car", nombre: "Auto", icono: "car", tipo: "GASTO", orden: 1 },
  { id: "category-food", nombre: "Alimentación", icono: "utensils", tipo: "GASTO", orden: 2 },
  { id: "category-delivery", nombre: "Delivery", icono: "bike", tipo: "GASTO", orden: 3 },
  { id: "category-household-demo", nombre: "Hogar demo", icono: "users", tipo: "GASTO", orden: 4 },
  { id: "category-entertainment", nombre: "Entretenimiento", icono: "gamepad", tipo: "GASTO", orden: 5 },
  { id: "category-health", nombre: "Salud", icono: "heartPulse", tipo: "GASTO", orden: 6 },
  { id: "category-services", nombre: "Servicios", icono: "services", tipo: "GASTO", orden: 7 },
  { id: "category-subscriptions", nombre: "Suscripciones", icono: "repeat", tipo: "GASTO", orden: 8 },
  { id: "category-cash", nombre: "Efectivo", icono: "banknote", tipo: "GASTO", orden: 9 },
  { id: "category-sent-transfer", nombre: "Transferencia enviada", icono: "send", tipo: "GASTO", orden: 10 },
  { id: "category-other-expense", nombre: "Otro gasto", icono: "more", tipo: "GASTO", orden: 11 },
  { id: "category-demo-income", nombre: "Ingreso demo", icono: "salary", tipo: "INGRESO", orden: 1 },
  { id: "category-received-transfer", nombre: "Transferencia recibida", icono: "transferIn", tipo: "INGRESO", orden: 2 },
  { id: "category-other-income", nombre: "Otro", icono: "more", tipo: "INGRESO", orden: 3 },
];

export const goals = [
  {
    id: "goal-demo-trip",
    nombre: "Meta demo viaje",
    montoObjetivo: 200_000,
    estado: "ACTIVA",
    accountId: "account-demo-trip",
    notas: "Seeded from the dashboard mockup.",
  },
  {
    id: "goal-demo-reserve",
    nombre: "Meta demo reserva",
    montoObjetivo: 150_000,
    estado: "ACTIVA",
    accountId: "account-demo-reserve",
    notas: "Seeded from the dashboard mockup.",
  },
];

export const commitmentTemplates = [
  {
    id: "commitment-template-demo-service",
    nombre: "Servicio mensual demo",
    tipo: "RECURRENTE",
    montoDefault: 120_000,
    diaVencimiento: 5,
    notas: "Seeded for July 2026 commitments visual validation.",
  },
  {
    id: "commitment-template-phone",
    nombre: "Plan celular",
    tipo: "RECURRENTE",
    montoDefault: 15_000,
    diaVencimiento: 3,
    notas: "Seeded for July 2026 commitments visual validation.",
  },
];

export const commitments = [
  {
    id: "commitment-2026-07-phone",
    nombre: "Plan celular",
    tipo: "RECURRENTE",
    monto: 15_000,
    estado: "PAGADO",
    fechaVencimiento: new Date("2026-07-03T00:00:00.000Z"),
    mes: 7,
    anio: 2026,
    notas: "Pagado para validar la sección de compromisos pagados.",
    templateId: "commitment-template-phone",
  },
  {
    id: "commitment-2026-07-demo-service",
    nombre: "Servicio mensual demo",
    tipo: "RECURRENTE",
    monto: 120_000,
    estado: "PENDIENTE",
    fechaVencimiento: new Date("2026-07-05T00:00:00.000Z"),
    mes: 7,
    anio: 2026,
    notas: "Pendiente para validar ordenamiento por vencimiento.",
    templateId: "commitment-template-demo-service",
  },
  {
    id: "commitment-2026-07-electricity",
    nombre: "Luz",
    tipo: "VARIABLE",
    monto: 45_000,
    estado: "PENDIENTE",
    fechaVencimiento: new Date("2026-07-15T00:00:00.000Z"),
    mes: 7,
    anio: 2026,
    notas: "Compromiso variable para validar una segunda fila pendiente.",
  },
];

export const transactions = [
  {
    id: "transaction-delivery",
    tipo: "GASTO",
    monto: 8_500,
    descripcion: "Delivery",
    fecha: new Date("2026-07-05T12:00:00.000Z"),
    accountId: "account-demo-primary",
    categoryId: "category-delivery",
  },
  {
    id: "transaction-demo-income",
    tipo: "INGRESO",
    monto: 300_000,
    descripcion: "Ingreso demo",
    fecha: new Date("2026-07-01T12:00:00.000Z"),
    accountId: "account-demo-primary",
    categoryId: "category-demo-income",
  },
  {
    id: "transaction-fuel",
    tipo: "GASTO",
    monto: 25_000,
    descripcion: "Bencina",
    fecha: new Date("2026-06-30T12:00:00.000Z"),
    accountId: "account-demo-primary",
    categoryId: "category-car",
  },
  {
    id: "transaction-demo-service",
    tipo: "GASTO",
    monto: 120_000,
    descripcion: "Servicio mensual demo",
    fecha: new Date("2026-07-03T12:00:00.000Z"),
    accountId: "account-demo-primary",
    categoryId: "category-services",
  },
  {
    id: "transaction-groceries",
    tipo: "GASTO",
    monto: 89_000,
    descripcion: "Supermercado",
    fecha: new Date("2026-07-04T12:00:00.000Z"),
    accountId: "account-demo-secondary",
    categoryId: "category-food",
  },
  {
    id: "transaction-transport",
    tipo: "GASTO",
    monto: 60_000,
    descripcion: "Transporte",
    fecha: new Date("2026-07-02T12:00:00.000Z"),
    accountId: "account-demo-wallet",
    categoryId: "category-car",
  },
];

export function withDemoOwnership(records) {
  return records.map((record) => ({ ...record, userId: DEMO_USER.id }));
}
