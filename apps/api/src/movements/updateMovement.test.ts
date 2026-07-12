import { CategoryType, TransactionType, type Transaction } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { MovementUpdateConflictError, MovementUpdateNotFoundError, MovementUpdateValidationError, updateMovement } from "./updateMovement.js";

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
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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
const findUniqueTransaction = prisma.transaction.findUnique as Mock;
const findManyTransaction = prisma.transaction.findMany as Mock;
const updateTransaction = prisma.transaction.update as Mock;
const updateManyTransaction = prisma.transaction.updateMany as Mock;

describe("updateMovement", () => {
  beforeEach(() => {
    runTransaction.mockClear();
    findFirstAccount.mockReset();
    updateAccount.mockReset();
    findUniqueCategory.mockReset();
    findUniqueTransaction.mockReset();
    findManyTransaction.mockReset();
    updateTransaction.mockReset();
    updateManyTransaction.mockReset();
  });

  it("adjusts the same account balance by reversing the old expense and applying the new amount", async () => {
    const existing = transaction({ id: "tx-food", tipo: TransactionType.GASTO, monto: 1_000, accountId: "account-checking" });
    findUniqueTransaction.mockResolvedValueOnce(existing).mockResolvedValueOnce(transaction({ id: "tx-food", tipo: TransactionType.GASTO, monto: 1_500 }));
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-checking" }));
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-food", nombre: "Food", tipo: CategoryType.GASTO }));
    updateManyTransaction.mockResolvedValueOnce({ count: 1 });

    await updateMovement("tx-food", {
      tipo: "GASTO",
      monto: 1_500,
      accountId: "account-checking",
      categoryId: "category-food",
      descripcion: "Food updated",
      fecha: "2026-07-06",
    });

    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: "account-checking" },
      data: { saldo: { increment: -500 } },
    });
    expect(updateManyTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "tx-food", monto: 1_000, updatedAt: existing.updatedAt }),
      }),
    );
  });

  it("restores the old account and applies the new account when account changes", async () => {
    findUniqueTransaction
      .mockResolvedValueOnce(transaction({ id: "tx-food", tipo: TransactionType.GASTO, monto: 2_000, accountId: "account-old" }))
      .mockResolvedValueOnce(transaction({ id: "tx-food", tipo: TransactionType.GASTO, monto: 3_000, accountId: "account-new" }));
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-new" }));
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-food", nombre: "Food", tipo: CategoryType.GASTO }));
    updateManyTransaction.mockResolvedValueOnce({ count: 1 });

    await updateMovement("tx-food", {
      tipo: "GASTO",
      monto: 3_000,
      accountId: "account-new",
      categoryId: "category-food",
      fecha: "2026-07-06",
    });

    expect(updateAccount).toHaveBeenNthCalledWith(1, {
      where: { id: "account-old" },
      data: { saldo: { increment: 2_000 } },
    });
    expect(updateAccount).toHaveBeenNthCalledWith(2, {
      where: { id: "account-new" },
      data: { saldo: { increment: -3_000 } },
    });
  });

  it("adjusts balance correctly when changing from expense to income", async () => {
    findUniqueTransaction
      .mockResolvedValueOnce(transaction({ id: "tx-adjustment", tipo: TransactionType.GASTO, monto: 4_000, accountId: "account-checking" }))
      .mockResolvedValueOnce(transaction({ id: "tx-adjustment", tipo: TransactionType.INGRESO, monto: 6_000 }));
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-checking" }));
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-income", nombre: "Adjustment", tipo: CategoryType.INGRESO }));
    updateManyTransaction.mockResolvedValueOnce({ count: 1 });

    await updateMovement("tx-adjustment", {
      tipo: "INGRESO",
      monto: 6_000,
      accountId: "account-checking",
      categoryId: "category-income",
      fecha: "2026-07-06",
    });

    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: "account-checking" },
      data: { saldo: { increment: 10_000 } },
    });
  });

  it("edits a transfer amount and applies only the balance delta", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findUniqueTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]).mockResolvedValueOnce([
      transaction({ ...salida, monto: 15_000 }),
      transaction({ ...entrada, monto: 15_000 }),
    ]);
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-origin" })).mockResolvedValueOnce(account({ id: "account-destination" }));
    updateManyTransaction.mockResolvedValueOnce({ count: 2 });

    await updateMovement("transfer-1", {
      tipo: "TRANSFERENCIA",
      monto: 15_000,
      fromAccountId: "account-origin",
      toAccountId: "account-destination",
      descripcion: "Savings",
      fecha: "2026-07-06",
    });

    expect(updateManyTransaction).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ monto: 15_000, descripcion: "Savings" }) }));
    expect(updateTransaction).toHaveBeenNthCalledWith(1, { where: { id: "tx-transfer-out" }, data: { accountId: "account-origin" } });
    expect(updateTransaction).toHaveBeenNthCalledWith(2, { where: { id: "tx-transfer-in" }, data: { accountId: "account-destination" } });
    expect(updateAccount).toHaveBeenNthCalledWith(1, { where: { id: "account-origin" }, data: { saldo: { increment: -5_000 } } });
    expect(updateAccount).toHaveBeenNthCalledWith(2, { where: { id: "account-destination" }, data: { saldo: { increment: 5_000 } } });
  });

  it("changes transfer source and destination accounts atomically", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 20_000, accountId: "account-old-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 20_000, accountId: "account-old-destination", categoryId: null, transferId: "transfer-1" });
    findUniqueTransaction.mockResolvedValueOnce(salida);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]).mockResolvedValueOnce([salida, entrada]);
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-new-origin" })).mockResolvedValueOnce(account({ id: "account-new-destination" }));
    updateManyTransaction.mockResolvedValueOnce({ count: 2 });

    await updateMovement("tx-transfer-out", {
      tipo: "TRANSFERENCIA",
      monto: 25_000,
      fromAccountId: "account-new-origin",
      toAccountId: "account-new-destination",
      fecha: "2026-07-06",
    });

    expect(updateAccount).toHaveBeenNthCalledWith(1, { where: { id: "account-old-origin" }, data: { saldo: { increment: 20_000 } } });
    expect(updateAccount).toHaveBeenNthCalledWith(2, { where: { id: "account-old-destination" }, data: { saldo: { increment: -20_000 } } });
    expect(updateAccount).toHaveBeenNthCalledWith(3, { where: { id: "account-new-origin" }, data: { saldo: { increment: -25_000 } } });
    expect(updateAccount).toHaveBeenNthCalledWith(4, { where: { id: "account-new-destination" }, data: { saldo: { increment: 25_000 } } });
  });

  it("rejects transfers between the same account before opening a database transaction", async () => {
    await expect(
      updateMovement("transfer-1", {
        tipo: "TRANSFERENCIA",
        monto: 10_000,
        fromAccountId: "account-same",
        toAccountId: "account-same",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateValidationError);

    expect(runTransaction).not.toHaveBeenCalled();
  });

  it("returns not found when a transfer pair cannot be found", async () => {
    findUniqueTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([]);

    await expect(
      updateMovement("missing-transfer", {
        tipo: "TRANSFERENCIA",
        monto: 10_000,
        fromAccountId: "account-origin",
        toAccountId: "account-destination",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateNotFoundError);
  });

  it("rejects invalid transfer pairs without changing balances", async () => {
    findUniqueTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([
      transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, accountId: "account-origin", categoryId: null, transferId: "transfer-1" }),
    ]);

    await expect(
      updateMovement("transfer-1", {
        tipo: "TRANSFERENCIA",
        monto: 10_000,
        fromAccountId: "account-origin",
        toAccountId: "account-destination",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateManyTransaction).not.toHaveBeenCalled();
  });

  it("rejects transfer pairs with mismatched amounts without changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 11_000, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findUniqueTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);

    await expect(
      updateMovement("transfer-1", {
        tipo: "TRANSFERENCIA",
        monto: 15_000,
        fromAccountId: "account-origin",
        toAccountId: "account-destination",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateManyTransaction).not.toHaveBeenCalled();
  });

  it("rejects transfer pairs with mismatched dates without changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, fecha: new Date("2026-07-05T12:00:00.000Z"), accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, fecha: new Date("2026-07-06T12:00:00.000Z"), accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findUniqueTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);

    await expect(
      updateMovement("transfer-1", {
        tipo: "TRANSFERENCIA",
        monto: 15_000,
        fromAccountId: "account-origin",
        toAccountId: "account-destination",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateManyTransaction).not.toHaveBeenCalled();
  });

  it("rejects transfer pairs with mismatched descriptions without changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, descripcion: "Savings", accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, descripcion: "Stale savings", accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findUniqueTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);

    await expect(
      updateMovement("transfer-1", {
        tipo: "TRANSFERENCIA",
        monto: 15_000,
        fromAccountId: "account-origin",
        toAccountId: "account-destination",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateManyTransaction).not.toHaveBeenCalled();
  });

  it("rejects stale transfer edits without changing balances when the guarded update does not match", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findUniqueTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-origin" })).mockResolvedValueOnce(account({ id: "account-destination" }));
    updateManyTransaction.mockResolvedValueOnce({ count: 1 });

    await expect(
      updateMovement("transfer-1", {
        tipo: "TRANSFERENCIA",
        monto: 10_000,
        fromAccountId: "account-origin",
        toAccountId: "account-destination",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects stale edits without changing balances when the guarded update does not match", async () => {
    findUniqueTransaction.mockResolvedValueOnce(transaction({ id: "tx-food", tipo: TransactionType.GASTO, monto: 1_000, accountId: "account-checking" }));
    findFirstAccount.mockResolvedValueOnce(account({ id: "account-checking" }));
    findUniqueCategory.mockResolvedValueOnce(category({ id: "category-food", nombre: "Food", tipo: CategoryType.GASTO }));
    updateManyTransaction.mockResolvedValueOnce({ count: 0 });

    await expect(
      updateMovement("tx-food", {
        tipo: "GASTO",
        monto: 1_500,
        accountId: "account-checking",
        categoryId: "category-food",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("maps Prisma transaction conflicts to stale edit conflicts", async () => {
    runTransaction.mockRejectedValueOnce(prismaTransactionConflictError());

    await expect(
      updateMovement("tx-food", {
        tipo: "GASTO",
        monto: 1_500,
        accountId: "account-checking",
        categoryId: "category-food",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("returns not found for missing movements", async () => {
    findUniqueTransaction.mockResolvedValueOnce(null);

    await expect(
      updateMovement("missing", {
        tipo: "GASTO",
        monto: 1_000,
        accountId: "account-checking",
        categoryId: "category-food",
        fecha: "2026-07-06",
      }),
    ).rejects.toThrow(MovementUpdateNotFoundError);
  });

  it("rejects invalid payloads before opening a database transaction", async () => {
    await expect(updateMovement("tx-food", { tipo: "GASTO", monto: 0 })).rejects.toThrow(MovementUpdateValidationError);

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
    categoryId: "category-food" as string | null,
    transferId: null as string | null,
    createdAt: new Date("2026-07-05T12:00:00.000Z"),
    updatedAt: new Date("2026-07-05T12:00:00.000Z"),
  };
}

function prismaTransactionConflictError() {
  return Object.assign(new Error("Transaction failed due to a write conflict or a deadlock."), {
    code: "P2034",
    clientVersion: "6.19.3",
  });
}
