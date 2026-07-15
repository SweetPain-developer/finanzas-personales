import type { Account, Category, Goal, Transaction } from "@prisma/client";
import { AccountType, GoalStatus, TransactionType } from "@prisma/client";

import { prisma } from "../prisma.js";

const dashboardPrisma = prisma as any;

type DashboardGoal = Pick<Goal, "id" | "nombre" | "montoObjetivo" | "estado" | "accountId"> & {
  emoji: string;
  account: Pick<Account, "id" | "nombre" | "saldo">;
};

type DashboardTransaction = Omit<
  Pick<
  Transaction,
  "id" | "tipo" | "monto" | "descripcion" | "fecha" | "accountId" | "categoryId" | "transferId"
  >,
  "tipo"
> & {
  tipo: "GASTO" | "INGRESO" | "TRANSFERENCIA";
  displayDate: string;
  account: Pick<Account, "id" | "nombre">;
  category: Pick<Category, "id" | "nombre" | "icono"> | null;
};

type DashboardTransactionWithRelations = Pick<
  Transaction,
  "id" | "tipo" | "monto" | "descripcion" | "fecha" | "accountId" | "categoryId" | "transferId" | "createdAt"
> & {
  account: Pick<Account, "id" | "nombre">;
  category: Pick<Category, "id" | "nombre" | "icono"> | null;
};

type SortableDashboardTransaction = DashboardTransaction & {
  sortTimestamp: Date;
};

export type DashboardData = {
  currentMonthLabel: string;
  availableToSpend: number;
  liquidNetWorth: number;
  liquidNetWorthVariation: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  goals: DashboardGoal[];
  recentTransactions: DashboardTransaction[];
};

type MonthRange = {
  year: number;
  month: number;
  start: Date;
  end: Date;
};

const DEFAULT_MONTH = "2026-07";
const MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;

const monthLabelFormatter = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const transactionDateFormatter = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const RECENT_RAW_TRANSACTION_LIMIT = 10;
const RECENT_DASHBOARD_MOVEMENT_LIMIT = 5;
const RECENT_TRANSACTION_INCLUDE = {
  account: { select: { id: true, nombre: true } },
  category: { select: { id: true, nombre: true, icono: true } },
} as const;

export function parseDashboardMonth(month = DEFAULT_MONTH): MonthRange {
  if (!MONTH_FORMAT.test(month)) {
    throw new Error("Invalid month format. Use YYYY-MM.");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));

  return { year, month: monthNumber, start, end };
}

export async function getDashboardData(userId: string, month = DEFAULT_MONTH): Promise<DashboardData> {
  const monthRange = parseDashboardMonth(month);

  const [income, expenses, accounts, pendingCommitments, goals, recentTransactions] = await Promise.all([
    dashboardPrisma.transaction.aggregate({
      _sum: { monto: true },
      where: {
        tipo: TransactionType.INGRESO,
        userId,
        transferId: null,
        fecha: { gte: monthRange.start, lt: monthRange.end },
      },
    }),
    dashboardPrisma.transaction.aggregate({
      _sum: { monto: true },
      where: {
        tipo: TransactionType.GASTO,
        userId,
        transferId: null,
        fecha: { gte: monthRange.start, lt: monthRange.end },
      },
    }),
    dashboardPrisma.account.findMany({
      where: { activa: true, userId },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    }),
    dashboardPrisma.commitment.aggregate({
      _sum: { monto: true },
      where: {
        anio: monthRange.year,
        mes: monthRange.month,
        userId,
        estado: "PENDIENTE",
      },
    }),
    dashboardPrisma.goal.findMany({
      where: { estado: GoalStatus.ACTIVA, userId },
      include: { account: true },
      orderBy: { createdAt: "asc" },
    }),
    dashboardPrisma.transaction.findMany({
      take: RECENT_RAW_TRANSACTION_LIMIT,
      where: { userId },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      include: RECENT_TRANSACTION_INCLUDE,
    }),
  ]) as [any, any, Account[], any, Array<DashboardGoal & { createdAt: Date }>, DashboardTransactionWithRelations[]];

  const completedRecentTransactions = await fetchMissingRecentTransferPairs(recentTransactions, userId);

  const operativeBalance = sumBy(
    accounts.filter((account) => account.tipo === AccountType.OPERATIVA),
    (account) => account.saldo,
  );
  const pendingCommitmentsTotal = pendingCommitments._sum.monto ?? 0;

  return {
    currentMonthLabel: capitalize(monthLabelFormatter.format(monthRange.start)),
    availableToSpend: operativeBalance - pendingCommitmentsTotal,
    // Explicit v1 interpretation: liquid net worth is the sum of all active account balances.
    liquidNetWorth: sumBy(accounts, (account) => account.saldo),
    liquidNetWorthVariation: 0,
    monthlyIncome: income._sum.monto ?? 0,
    monthlyExpenses: expenses._sum.monto ?? 0,
    goals: goals.map((goal) => ({
      id: goal.id,
      nombre: goal.nombre,
      montoObjetivo: goal.montoObjetivo,
      estado: goal.estado,
      accountId: goal.accountId,
      emoji: getGoalEmoji(goal.nombre),
      account: {
        id: goal.account.id,
        nombre: goal.account.nombre,
        saldo: goal.account.saldo,
      },
    })),
    recentTransactions: buildRecentDashboardTransactions(completedRecentTransactions).slice(0, RECENT_DASHBOARD_MOVEMENT_LIMIT),
  };
}

async function fetchMissingRecentTransferPairs(transactions: DashboardTransactionWithRelations[], userId: string) {
  const incompleteTransferIds = getIncompleteTransferIds(transactions);

  if (incompleteTransferIds.length === 0) {
    return transactions;
  }

  const transferPairs = await dashboardPrisma.transaction.findMany({
    where: { userId, transferId: { in: incompleteTransferIds } },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    include: RECENT_TRANSACTION_INCLUDE,
  });

  return uniqueTransactionsById([...transactions, ...transferPairs]);
}

function getIncompleteTransferIds(transactions: DashboardTransactionWithRelations[]) {
  return Array.from(groupTransfers(transactions).entries())
    .filter(([, transferTransactions]) => !hasTransferPair(transferTransactions))
    .map(([transferId]) => transferId);
}

function hasTransferPair(transactions: DashboardTransactionWithRelations[]) {
  return transactions.some((transaction) => transaction.tipo === TransactionType.GASTO)
    && transactions.some((transaction) => transaction.tipo === TransactionType.INGRESO);
}

function uniqueTransactionsById(transactions: DashboardTransactionWithRelations[]) {
  return Array.from(new Map(transactions.map((transaction) => [transaction.id, transaction])).values());
}

function buildRecentDashboardTransactions(transactions: DashboardTransactionWithRelations[]): DashboardTransaction[] {
  const normalTransactions = transactions
    .filter((transaction) => transaction.transferId === null)
    .map(toSortableDashboardTransaction);

  const transferTransactions = Array.from(groupTransfers(transactions).values())
    .map(toSortableDashboardTransferTransaction)
    .filter((transaction): transaction is SortableDashboardTransaction => transaction !== null);

  return [...normalTransactions, ...transferTransactions].sort(compareDashboardTransactionsDescending).map(stripSortTimestamp);
}

function groupTransfers(transactions: DashboardTransactionWithRelations[]) {
  return transactions.reduce((groups, transaction) => {
    if (!transaction.transferId) {
      return groups;
    }

    const existing = groups.get(transaction.transferId) ?? [];
    existing.push(transaction);
    groups.set(transaction.transferId, existing);

    return groups;
  }, new Map<string, DashboardTransactionWithRelations[]>());
}

function toSortableDashboardTransferTransaction(transactions: DashboardTransactionWithRelations[]): SortableDashboardTransaction | null {
  const salida = transactions.find((transaction) => transaction.tipo === TransactionType.GASTO);
  const entrada = transactions.find((transaction) => transaction.tipo === TransactionType.INGRESO);
  const transferId = salida?.transferId ?? entrada?.transferId;

  if (!salida || !entrada || !transferId) {
    return null;
  }

  return {
    id: transferId,
    tipo: "TRANSFERENCIA",
    monto: salida.monto,
    descripcion: salida.descripcion,
    fecha: salida.fecha,
    accountId: salida.accountId,
    categoryId: null,
    transferId,
    displayDate: formatTransactionDisplayDate(salida.fecha),
    sortTimestamp: latestDate(transactions.map((transaction) => transaction.createdAt)),
    account: {
      id: salida.account.id,
      nombre: `${salida.account.nombre} → ${entrada.account.nombre}`,
    },
    category: null,
  };
}

function toSortableDashboardTransaction(transaction: DashboardTransactionWithRelations): SortableDashboardTransaction {
  return {
    id: transaction.id,
    tipo: transaction.tipo,
    monto: transaction.monto,
    descripcion: transaction.descripcion,
    fecha: transaction.fecha,
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    transferId: transaction.transferId,
    displayDate: formatTransactionDisplayDate(transaction.fecha),
    sortTimestamp: transaction.createdAt,
    account: transaction.account,
    category: transaction.category,
  };
}

function compareDashboardTransactionsDescending(left: SortableDashboardTransaction, right: SortableDashboardTransaction) {
  const dateDifference = new Date(right.fecha).getTime() - new Date(left.fecha).getTime();

  if (dateDifference !== 0) {
    return dateDifference;
  }

  return right.sortTimestamp.getTime() - left.sortTimestamp.getTime();
}

function stripSortTimestamp({ sortTimestamp: _sortTimestamp, ...transaction }: SortableDashboardTransaction): DashboardTransaction {
  return transaction;
}

function latestDate(dates: Date[]) {
  return dates.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest));
}

function formatTransactionDisplayDate(date: Date) {
  return transactionDateFormatter.format(date).replace(".", "").replace("-", " ");
}

function sumBy<T>(items: T[], selector: (item: T) => number) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getGoalEmoji(goalName: string) {
  const normalized = goalName.toLowerCase();

  if (normalized.includes("vacaciones")) {
    return "🏖️";
  }

  if (normalized.includes("equipo") || normalized.includes("notebook")) {
    return "💻";
  }

  return "🎯";
}
