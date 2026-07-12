import { AccountType, GoalStatus, TransactionType, type Account } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { getDashboardData } from "./getDashboardData.js";
import { prisma } from "../prisma.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    transaction: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    account: {
      findMany: vi.fn(),
    },
    commitment: {
      aggregate: vi.fn(),
    },
    goal: {
      findMany: vi.fn(),
    },
  },
}));

const aggregateTransaction = prisma.transaction.aggregate as Mock;
const findManyAccounts = prisma.account.findMany as Mock;
const aggregateCommitments = prisma.commitment.aggregate as Mock;
const findManyGoals = prisma.goal.findMany as Mock;
const findManyTransactions = prisma.transaction.findMany as Mock;

describe("getDashboardData", () => {
  beforeEach(() => {
    aggregateTransaction.mockReset();
    findManyAccounts.mockReset();
    aggregateCommitments.mockReset();
    findManyGoals.mockReset();
    findManyTransactions.mockReset();
  });

  it("calculates dashboard totals for the requested month using non-transfer transactions", async () => {
    aggregateTransaction.mockResolvedValueOnce({ _sum: { monto: 2_000 } }).mockResolvedValueOnce({ _sum: { monto: 750 } });
    findManyAccounts.mockResolvedValue([
      account({ id: "checking", nombre: "Checking", tipo: AccountType.OPERATIVA, saldo: 1_000, orden: 1 }),
      account({ id: "wallet", nombre: "Wallet", tipo: AccountType.OPERATIVA, saldo: 500, orden: 2 }),
      account({ id: "savings", nombre: "Savings", tipo: AccountType.AHORRO, saldo: 200, orden: 3 }),
      account({ id: "reserve", nombre: "Reserve", tipo: AccountType.RESERVA, saldo: 300, orden: 4 }),
    ]);
    aggregateCommitments.mockResolvedValue({ _sum: { monto: 400 } });
    findManyGoals.mockResolvedValue([
      {
        id: "goal-vacation",
        nombre: "Vacaciones",
        montoObjetivo: 1_000,
        estado: GoalStatus.ACTIVA,
        notas: null,
        accountId: "savings",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        account: account({ id: "savings", nombre: "Savings", tipo: AccountType.AHORRO, saldo: 200, orden: 3 }),
      },
    ]);
    findManyTransactions.mockResolvedValue([
      {
        id: "tx-current-month-day",
        tipo: TransactionType.GASTO,
        monto: 50,
        descripcion: "Lunch",
        fecha: new Date("2026-07-05T12:00:00.000Z"),
        notas: null,
        accountId: "checking",
        categoryId: null,
        transferId: null,
        createdAt: new Date("2026-07-05T12:00:00.000Z"),
        updatedAt: new Date("2026-07-05T12:00:00.000Z"),
        account: account({ id: "checking", nombre: "Checking", tipo: AccountType.OPERATIVA, saldo: 1_000, orden: 1 }),
        category: null,
      },
    ]);

    const result = await getDashboardData("2026-07");

    expect(result.monthlyIncome).toBe(2_000);
    expect(result.monthlyExpenses).toBe(750);
    expect(result.availableToSpend).toBe(1_100);
    expect(result.liquidNetWorth).toBe(2_000);
    expect(result.goals[0]?.account.saldo).toBe(200);
    expect(result.recentTransactions[0]?.displayDate).toBe("05 jul");
    expect(result.recentTransactions[0]?.displayDate).not.toBe("Hoy");
    expect(aggregateTransaction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          tipo: TransactionType.INGRESO,
          transferId: null,
          fecha: { gte: new Date("2026-07-01T00:00:00.000Z"), lt: new Date("2026-08-01T00:00:00.000Z") },
        }),
      }),
    );
    expect(aggregateTransaction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          tipo: TransactionType.GASTO,
          transferId: null,
        }),
      }),
    );
    expect(findManyTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
      }),
    );
  });

  it("excludes savings and reserves from available-to-spend subtraction", async () => {
    aggregateTransaction.mockResolvedValueOnce({ _sum: { monto: null } }).mockResolvedValueOnce({ _sum: { monto: null } });
    findManyAccounts.mockResolvedValue([
      account({ id: "checking", nombre: "Checking", tipo: AccountType.OPERATIVA, saldo: 1_500, orden: 1 }),
      account({ id: "savings", nombre: "Savings", tipo: AccountType.AHORRO, saldo: 10_000, orden: 2 }),
      account({ id: "reserve", nombre: "Reserve", tipo: AccountType.RESERVA, saldo: 20_000, orden: 3 }),
    ]);
    aggregateCommitments.mockResolvedValue({ _sum: { monto: 400 } });
    findManyGoals.mockResolvedValue([]);
    findManyTransactions.mockResolvedValue([]);

    const result = await getDashboardData("2026-07");

    expect(result.availableToSpend).toBe(1_100);
    expect(result.liquidNetWorth).toBe(31_500);
  });

  it("returns one recent movement for a transfer pair", async () => {
    aggregateTransaction.mockResolvedValueOnce({ _sum: { monto: 2_000 } }).mockResolvedValueOnce({ _sum: { monto: 750 } });
    findManyAccounts.mockResolvedValue([account({ id: "checking", nombre: "Checking", tipo: AccountType.OPERATIVA, saldo: 1_000, orden: 1 })]);
    aggregateCommitments.mockResolvedValue({ _sum: { monto: 0 } });
    findManyGoals.mockResolvedValue([]);
    findManyTransactions.mockResolvedValue([
      dashboardTransaction({
        id: "tx-transfer-out",
        tipo: TransactionType.GASTO,
        monto: 50_000,
        descripcion: "Transferencia",
        transferId: "transfer-1",
        accountId: "checking",
        account: { id: "checking", nombre: "Checking" },
      }),
      dashboardTransaction({
        id: "tx-transfer-in",
        tipo: TransactionType.INGRESO,
        monto: 50_000,
        descripcion: "Transferencia",
        transferId: "transfer-1",
        accountId: "savings",
        account: { id: "savings", nombre: "Savings" },
      }),
    ]);

    const result = await getDashboardData("2026-07");

    expect(result.monthlyIncome).toBe(2_000);
    expect(result.monthlyExpenses).toBe(750);
    expect(result.recentTransactions).toEqual([
      expect.objectContaining({
        id: "transfer-1",
        tipo: "TRANSFERENCIA",
        monto: 50_000,
        account: { id: "checking", nombre: "Checking → Savings" },
      }),
    ]);
  });

  it("fetches a missing counterpart when the raw recent limit splits a transfer pair", async () => {
    aggregateTransaction.mockResolvedValueOnce({ _sum: { monto: 0 } }).mockResolvedValueOnce({ _sum: { monto: 0 } });
    findManyAccounts.mockResolvedValue([account({ id: "checking", nombre: "Checking", tipo: AccountType.OPERATIVA, saldo: 1_000, orden: 1 })]);
    aggregateCommitments.mockResolvedValue({ _sum: { monto: 0 } });
    findManyGoals.mockResolvedValue([]);

    const transferOut = dashboardTransaction({
      id: "tx-transfer-out",
      tipo: TransactionType.GASTO,
      monto: 50_000,
      descripcion: "Transfer movement",
      transferId: "transfer-split",
      accountId: "checking",
      createdAt: new Date("2026-07-05T12:00:00.000Z"),
      account: { id: "checking", nombre: "Checking" },
    });
    const transferIn = dashboardTransaction({
      id: "tx-transfer-in",
      tipo: TransactionType.INGRESO,
      monto: 50_000,
      descripcion: "Transfer movement",
      transferId: "transfer-split",
      accountId: "savings",
      createdAt: new Date("2026-07-05T12:00:01.000Z"),
      account: { id: "savings", nombre: "Savings" },
    });

    findManyTransactions
      .mockResolvedValueOnce([
        transferOut,
        ...Array.from({ length: 9 }, (_, index) => dashboardTransaction({
          id: `tx-normal-${index}`,
          tipo: TransactionType.GASTO,
          descripcion: `Normal movement ${index}`,
          transferId: null,
          accountId: "checking",
          fecha: new Date(`2026-07-0${4 - Math.floor(index / 3)}T12:00:00.000Z`),
          createdAt: new Date(`2026-07-0${4 - Math.floor(index / 3)}T12:00:00.000Z`),
          account: { id: "checking", nombre: "Checking" },
        })),
      ])
      .mockResolvedValueOnce([transferOut, transferIn]);

    const result = await getDashboardData("2026-07");

    expect(findManyTransactions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { transferId: { in: ["transfer-split"] } },
      }),
    );
    expect(result.recentTransactions).toHaveLength(5);
    expect(result.recentTransactions[0]).toEqual(expect.objectContaining({
      id: "transfer-split",
      tipo: "TRANSFERENCIA",
      monto: 50_000,
      account: { id: "checking", nombre: "Checking → Savings" },
    }));
    expect(result.recentTransactions[0]).not.toHaveProperty("sortTimestamp");
  });

  it("keeps createdAt ordering for same-day normal and merged transfer recent movements", async () => {
    aggregateTransaction.mockResolvedValueOnce({ _sum: { monto: 0 } }).mockResolvedValueOnce({ _sum: { monto: 0 } });
    findManyAccounts.mockResolvedValue([account({ id: "checking", nombre: "Checking", tipo: AccountType.OPERATIVA, saldo: 1_000, orden: 1 })]);
    aggregateCommitments.mockResolvedValue({ _sum: { monto: 0 } });
    findManyGoals.mockResolvedValue([]);
    findManyTransactions.mockResolvedValue([
      dashboardTransaction({
        id: "tx-normal-older",
        tipo: TransactionType.GASTO,
        descripcion: "Older normal movement",
        transferId: null,
        accountId: "checking",
        createdAt: new Date("2026-07-05T09:00:00.000Z"),
        account: { id: "checking", nombre: "Checking" },
      }),
      dashboardTransaction({
        id: "tx-transfer-out",
        tipo: TransactionType.GASTO,
        descripcion: "Transfer movement",
        transferId: "transfer-1",
        accountId: "checking",
        createdAt: new Date("2026-07-05T11:00:00.000Z"),
        account: { id: "checking", nombre: "Checking" },
      }),
      dashboardTransaction({
        id: "tx-transfer-in",
        tipo: TransactionType.INGRESO,
        descripcion: "Transfer movement",
        transferId: "transfer-1",
        accountId: "savings",
        createdAt: new Date("2026-07-05T11:00:01.000Z"),
        account: { id: "savings", nombre: "Savings" },
      }),
      dashboardTransaction({
        id: "tx-normal-newer",
        tipo: TransactionType.INGRESO,
        descripcion: "Newer normal movement",
        transferId: null,
        accountId: "checking",
        createdAt: new Date("2026-07-05T12:00:00.000Z"),
        account: { id: "checking", nombre: "Checking" },
      }),
    ]);

    const result = await getDashboardData("2026-07");

    expect(result.recentTransactions.map((transaction) => transaction.id)).toEqual([
      "tx-normal-newer",
      "transfer-1",
      "tx-normal-older",
    ]);
    expect(result.recentTransactions[1]).not.toHaveProperty("sortTimestamp");
  });
});

function account(overrides: {
  id: string;
  nombre: string;
  tipo: AccountType;
  saldo: number;
  orden: number;
}) {
  return {
    activa: true,
    notas: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function dashboardTransaction(overrides: {
  id: string;
  tipo: TransactionType;
  monto?: number;
  descripcion?: string;
  fecha?: Date;
  transferId?: string | null;
  createdAt?: Date;
  accountId: string;
  account: Pick<Account, "id" | "nombre">;
}) {
  return {
    monto: 1_000,
    descripcion: "Movimiento",
    fecha: new Date("2026-07-05T12:00:00.000Z"),
    notas: null,
    categoryId: null,
    transferId: null,
    createdAt: new Date("2026-07-05T12:00:00.000Z"),
    updatedAt: new Date("2026-07-05T12:00:00.000Z"),
    category: null,
    ...overrides,
  };
}
