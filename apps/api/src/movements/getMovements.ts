import { TransactionType, type Account, type Category, type Transaction } from "@prisma/client";

import { prisma } from "../prisma.js";

type MovementAccount = Pick<Account, "id" | "nombre">;
type MovementCategory = Pick<Category, "id" | "nombre" | "icono" | "tipo">;

type TransactionWithRelations = Pick<
  Transaction,
  "id" | "tipo" | "monto" | "descripcion" | "fecha" | "accountId" | "categoryId" | "transferId" | "createdAt"
> & {
  account: MovementAccount;
  category: MovementCategory | null;
};

export type NormalMovement = {
  id: string;
  tipo: "GASTO" | "INGRESO";
  monto: number;
  descripcion: string;
  account: MovementAccount;
  category: MovementCategory | null;
  fecha: string;
};

export type TransferMovement = {
  id: string;
  transferId: string;
  tipo: "TRANSFERENCIA";
  monto: number;
  descripcion: string;
  fromAccount: MovementAccount;
  toAccount: MovementAccount;
  fecha: string;
};

export type Movement = NormalMovement | TransferMovement;

export type MovementGroup = {
  label: string;
  date: string;
  movements: Movement[];
};

export type MovementsData = {
  currentMonth: string;
  filters: {
    accounts: MovementAccount[];
    categories: MovementCategory[];
  };
  groups: MovementGroup[];
};

type MonthRange = {
  value: string;
  start: Date;
  end: Date;
};

export type MovementFilters = {
  month?: string;
  accountId?: string;
  categoryId?: string;
};

type MovementOptions = {
  today?: Date;
};

const DEFAULT_MONTH = "2026-07";
const MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;

const groupLabelFormatter = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export class MovementValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MovementValidationError";
  }
}

export async function getMovements(filters: MovementFilters = {}, options: MovementOptions = {}): Promise<MovementsData> {
  const monthRange = parseMovementMonth(filters.month ?? DEFAULT_MONTH);

  const [accounts, categories, transactions] = await Promise.all([
    prisma.account.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    }),
    prisma.category.findMany({
      select: { id: true, nombre: true, icono: true, tipo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    }),
    prisma.transaction.findMany({
      where: {
        fecha: { gte: monthRange.start, lt: monthRange.end },
      },
      include: { account: { select: { id: true, nombre: true } }, category: true },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const movements = buildMovements(transactions, filters);

  return {
    currentMonth: monthRange.value,
    filters: { accounts, categories },
    groups: groupMovementsByDate(movements, options.today ?? new Date()),
  };
}

function parseMovementMonth(month: string): MonthRange {
  if (!MONTH_FORMAT.test(month)) {
    throw new MovementValidationError("Invalid month format. Use YYYY-MM.");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));

  return { value: month, start, end };
}

function buildMovements(transactions: TransactionWithRelations[], filters: MovementFilters): Movement[] {
  const normalMovements = transactions
    .filter((transaction) => transaction.transferId === null)
    .filter((transaction) => matchesNormalMovementFilters(transaction, filters))
    .map(toNormalMovement);

  if (filters.categoryId) {
    return normalMovements;
  }

  const transferMovements = Array.from(groupTransfers(transactions).values())
    .map(toTransferMovement)
    .filter((movement): movement is TransferMovement => movement !== null)
    .filter((movement) => matchesTransferAccountFilter(movement, filters.accountId));

  return [...normalMovements, ...transferMovements].sort(compareMovementsDescending);
}

function matchesNormalMovementFilters(transaction: TransactionWithRelations, filters: MovementFilters) {
  if (filters.accountId && transaction.accountId !== filters.accountId) {
    return false;
  }

  if (filters.categoryId && transaction.categoryId !== filters.categoryId) {
    return false;
  }

  return true;
}

function matchesTransferAccountFilter(movement: TransferMovement, accountId: string | undefined) {
  return !accountId || movement.fromAccount.id === accountId || movement.toAccount.id === accountId;
}

function groupTransfers(transactions: TransactionWithRelations[]) {
  return transactions.reduce((groups, transaction) => {
    if (!transaction.transferId) {
      return groups;
    }

    const existing = groups.get(transaction.transferId) ?? [];
    existing.push(transaction);
    groups.set(transaction.transferId, existing);

    return groups;
  }, new Map<string, TransactionWithRelations[]>());
}

function toTransferMovement(transactions: TransactionWithRelations[]): TransferMovement | null {
  const salida = transactions.find((transaction) => transaction.tipo === TransactionType.GASTO);
  const entrada = transactions.find((transaction) => transaction.tipo === TransactionType.INGRESO);
  const transferId = salida?.transferId ?? entrada?.transferId;

  if (!salida || !entrada || !transferId) {
    return null;
  }

  return {
    id: transferId,
    transferId,
    tipo: "TRANSFERENCIA",
    monto: salida.monto,
    descripcion: salida.descripcion,
    fromAccount: salida.account,
    toAccount: entrada.account,
    fecha: toIsoDate(salida.fecha),
  };
}

function toNormalMovement(transaction: TransactionWithRelations): NormalMovement {
  return {
    id: transaction.id,
    tipo: transaction.tipo === TransactionType.INGRESO ? "INGRESO" : "GASTO",
    monto: transaction.monto,
    descripcion: transaction.descripcion,
    account: transaction.account,
    category: transaction.category,
    fecha: toIsoDate(transaction.fecha),
  };
}

function groupMovementsByDate(movements: Movement[], today: Date): MovementGroup[] {
  const groups = new Map<string, Movement[]>();

  movements.forEach((movement) => {
    const existing = groups.get(movement.fecha) ?? [];
    existing.push(movement);
    groups.set(movement.fecha, existing);
  });

  return Array.from(groups.entries()).map(([date, groupedMovements]) => ({
    label: formatGroupLabel(date, today),
    date,
    movements: groupedMovements,
  }));
}

function compareMovementsDescending(left: Movement, right: Movement) {
  return right.fecha.localeCompare(left.fecha);
}

function formatGroupLabel(date: string, today: Date) {
  if (date === toIsoDate(today)) {
    return "HOY";
  }

  return groupLabelFormatter.format(new Date(`${date}T00:00:00.000Z`)).replace(".", "").replace("-", " ").toUpperCase();
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
