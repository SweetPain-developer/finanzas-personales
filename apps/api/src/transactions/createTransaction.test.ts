import { CategoryType, TransactionType, type Transaction } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { createTransaction, TransactionValidationError } from "./createTransaction.js";

vi.mock("../prisma.js", () => {
  const tx = {
    account: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
  };

  return {
    prisma: {
      $transaction: vi.fn((callback) => callback(tx)),
      ...tx,
    },
  };
});

const runTransaction = prisma.$transaction as Mock;
const findFirstAccount = prisma.account.findFirst as Mock;
const updateAccount = prisma.account.update as Mock;
const findUniqueCategory = prisma.category.findUnique as Mock;
const createPrismaTransaction = prisma.transaction.create as Mock;

describe("createTransaction", () => {
  beforeEach(() => {
    runTransaction.mockClear();
    findFirstAccount.mockReset();
    updateAccount.mockReset();
    findUniqueCategory.mockReset();
    createPrismaTransaction.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an expense and subtracts the account balance", async () => {
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-checking" }));
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-food", nombre: "Food", tipo: CategoryType.GASTO }));
    createPrismaTransaction.mockResolvedValueOnce(transaction({ id: "tx-expense", tipo: TransactionType.GASTO }));

    const result = await createTransaction({
      tipo: "GASTO",
      monto: 1_500,
      accountId: "account-checking",
      categoryId: "category-food",
      fecha: "2026-07-05T12:00:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: "account-checking" },
      data: { saldo: { increment: -1_500 } },
    });
    expect(createPrismaTransaction).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "GASTO",
        monto: 1_500,
        descripcion: "Food",
        accountId: "account-checking",
        categoryId: "category-food",
        transferId: null,
      }),
    });
  });

  it("creates income and adds the account balance", async () => {
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-checking" }));
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-salary", nombre: "Salary", tipo: CategoryType.INGRESO }));
    createPrismaTransaction.mockResolvedValueOnce(transaction({ id: "tx-income", tipo: TransactionType.INGRESO }));

    const result = await createTransaction({
      tipo: "INGRESO",
      monto: 900_000,
      accountId: "account-checking",
      categoryId: "category-salary",
      descripcion: "July salary",
    });

    expect(result).toHaveLength(1);
    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: "account-checking" },
      data: { saldo: { increment: 900_000 } },
    });
    expect(createPrismaTransaction).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: "INGRESO",
        descripcion: "July salary",
        transferId: null,
      }),
    });
  });

  it("uses the current date when fecha is missing", async () => {
    const now = new Date("2026-07-05T09:30:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-checking" }));
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-salary", nombre: "Salary", tipo: CategoryType.INGRESO }));
    createPrismaTransaction.mockResolvedValueOnce(transaction({ id: "tx-income", tipo: TransactionType.INGRESO }));

    await createTransaction({
      tipo: "INGRESO",
      monto: 900_000,
      accountId: "account-checking",
      categoryId: "category-salary",
    });

    expect(createPrismaTransaction).toHaveBeenCalledWith({
      data: expect.objectContaining({ fecha: now }),
    });
  });

  it("keeps date-only ISO values at the exact requested calendar day", async () => {
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-checking" }));
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-food", nombre: "Food", tipo: CategoryType.GASTO }));
    createPrismaTransaction.mockResolvedValueOnce(transaction({ id: "tx-expense", tipo: TransactionType.GASTO }));

    await createTransaction({
      tipo: "GASTO",
      monto: 1_500,
      accountId: "account-checking",
      categoryId: "category-food",
      fecha: "2026-07-05",
    });

    expect(createPrismaTransaction).toHaveBeenCalledWith({
      data: expect.objectContaining({ fecha: new Date("2026-07-05T00:00:00.000Z") }),
    });
  });

  it("creates a transfer with linked movements and updates both balances", async () => {
    findFirstAccount
      .mockResolvedValueOnce(account({ id: "account-origin" }))
      .mockResolvedValueOnce(account({ id: "account-destination" }));
    createPrismaTransaction
      .mockImplementationOnce(({ data }) => Promise.resolve(transaction({ id: "tx-transfer-out", ...data })))
      .mockImplementationOnce(({ data }) => Promise.resolve(transaction({ id: "tx-transfer-in", ...data })));

    const result = await createTransaction({
      tipo: "TRANSFERENCIA",
      monto: 50_000,
      fromAccountId: "account-origin",
      toAccountId: "account-destination",
      fecha: "2026-07-05T12:00:00.000Z",
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.transferId).toEqual(expect.any(String));
    expect(result[1]?.transferId).toBe(result[0]?.transferId);
    expect(updateAccount).toHaveBeenNthCalledWith(1, {
      where: { id: "account-origin" },
      data: { saldo: { decrement: 50_000 } },
    });
    expect(updateAccount).toHaveBeenNthCalledWith(2, {
      where: { id: "account-destination" },
      data: { saldo: { increment: 50_000 } },
    });
    expect(createPrismaTransaction).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        tipo: TransactionType.GASTO,
        accountId: "account-origin",
        categoryId: null,
        transferId: result[0]?.transferId,
      }),
    });
    expect(createPrismaTransaction).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        tipo: TransactionType.INGRESO,
        accountId: "account-destination",
        categoryId: null,
        transferId: result[0]?.transferId,
      }),
    });
  });

  it("rejects invalid amounts before opening a database transaction", async () => {
    await expect(createTransaction({ tipo: "GASTO", monto: 10.5 })).rejects.toThrow(TransactionValidationError);

    expect(runTransaction).not.toHaveBeenCalled();
  });

  it("rejects invalid calendar dates before opening a database transaction", async () => {
    await expect(
      createTransaction({
        tipo: "GASTO",
        monto: 1_000,
        accountId: "account-checking",
        categoryId: "category-food",
        fecha: "2026-02-31",
      }),
    ).rejects.toThrow("Invalid date.");

    expect(runTransaction).not.toHaveBeenCalled();
  });

  it("rejects invalid calendar dates in ISO datetimes before opening a database transaction", async () => {
    await expect(
      createTransaction({
        tipo: "GASTO",
        monto: 1_000,
        accountId: "account-checking",
        categoryId: "category-food",
        fecha: "2026-02-31T12:00:00.000Z",
      }),
    ).rejects.toThrow("Invalid date.");

    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each(["2026-02-31 12:00:00", "2026/02/31", "02/31/2026"])(
    "rejects non-ISO fecha format %s before opening a database transaction",
    async (fecha) => {
      await expect(
        createTransaction({
          tipo: "GASTO",
          monto: 1_000,
          accountId: "account-checking",
          categoryId: "category-food",
          fecha,
        }),
      ).rejects.toThrow("Invalid date.");

      expect(runTransaction).not.toHaveBeenCalled();
    },
  );

  it("rejects missing or inactive accounts", async () => {
    findFirstAccount.mockResolvedValueOnce(null);
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-food", nombre: "Food", tipo: CategoryType.GASTO }));

    await expect(
      createTransaction({ tipo: "GASTO", monto: 1_000, accountId: "missing", categoryId: "category-food" }),
    ).rejects.toThrow("Account not found or inactive.");

    expect(createPrismaTransaction).not.toHaveBeenCalled();
  });

  it("rejects category type mismatches", async () => {
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-checking" }));
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-food", nombre: "Food", tipo: CategoryType.GASTO }));

    await expect(
      createTransaction({ tipo: "INGRESO", monto: 1_000, accountId: "account-checking", categoryId: "category-food" }),
    ).rejects.toThrow("Category type does not match transaction type.");
  });

  it("rejects transfers between the same account", async () => {
    await expect(
      createTransaction({ tipo: "TRANSFERENCIA", monto: 1_000, fromAccountId: "same", toAccountId: "same" }),
    ).rejects.toThrow("Transfer accounts must be different.");

    expect(runTransaction).not.toHaveBeenCalled();
  });
});

function account(overrides: { id: string }) {
  return {
    id: overrides.id,
    nombre: overrides.id,
    tipo: "OPERATIVA",
    saldo: 100_000,
    activa: true,
    notas: null,
    orden: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function category(overrides: { id: string; nombre: string; tipo: CategoryType }) {
  return {
    ...overrides,
    icono: "tag",
    orden: 0,
  };
}

function transaction(overrides: Partial<Transaction> & { id: string }) {
  return {
    ...baseTransaction(),
    ...overrides,
  };
}

function baseTransaction() {
  return {
    id: "tx",
    tipo: TransactionType.GASTO,
    monto: 1_000,
    descripcion: "Description",
    fecha: new Date("2026-07-05T12:00:00.000Z"),
    notas: null,
    accountId: "account-checking",
    categoryId: "category-food",
    transferId: null as string | null,
    createdAt: new Date("2026-07-05T12:00:00.000Z"),
    updatedAt: new Date("2026-07-05T12:00:00.000Z"),
  };
}
