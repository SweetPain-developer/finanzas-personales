import { TransactionType, type Transaction } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { deleteMovement, MovementDeleteConflictError, MovementDeleteNotFoundError } from "./deleteMovement.js";

vi.mock("../prisma.js", () => {
  const tx = {
    account: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    transaction: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
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
const findManyAccount = prisma.account.findMany as Mock;
const updateAccount = prisma.account.updateMany as Mock;
const deleteManyTransaction = prisma.transaction.deleteMany as Mock;
const findManyTransaction = prisma.transaction.findMany as Mock;
const findFirstTransaction = prisma.transaction.findFirst as Mock;

describe("deleteMovement", () => {
  beforeEach(() => {
    runTransaction.mockClear();
    findManyAccount.mockReset();
    updateAccount.mockReset();
    updateAccount.mockResolvedValue({ count: 1 });
    deleteManyTransaction.mockReset();
    findManyTransaction.mockReset();
    findFirstTransaction.mockReset();
  });

  it("deletes an income and reverses its account balance increase", async () => {
    const existing = transaction({ id: "tx-salary", tipo: TransactionType.INGRESO, monto: 120_000, accountId: "account-checking" });
    findFirstTransaction.mockResolvedValueOnce(existing);
    deleteManyTransaction.mockResolvedValueOnce({ count: 1 });

    await deleteMovement("tx-salary", "user-demo");

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(deleteManyTransaction).toHaveBeenCalledWith({
      where: {
        id: "tx-salary",
        userId: "user-demo",
        tipo: TransactionType.INGRESO,
        monto: 120_000,
        accountId: "account-checking",
        categoryId: "category-food",
        transferId: null,
        updatedAt: existing.updatedAt,
      },
    });
    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: "account-checking", userId: "user-demo" },
      data: { saldo: { increment: -120_000 } },
    });
  });

  it("deletes an expense and restores its account balance", async () => {
    findFirstTransaction.mockResolvedValueOnce(transaction({ id: "tx-food", tipo: TransactionType.GASTO, monto: 32_000, accountId: "account-checking" }));
    deleteManyTransaction.mockResolvedValueOnce({ count: 1 });

    await deleteMovement("tx-food", "user-demo");

    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: "account-checking", userId: "user-demo" },
      data: { saldo: { increment: 32_000 } },
    });
  });

  it("returns not found for missing movements", async () => {
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([]);

    await expect(deleteMovement("missing", "user-demo")).rejects.toThrow(MovementDeleteNotFoundError);

    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("deletes a transfer pair from a transaction row id and reverses both account balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(salida);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);
    findManyAccount.mockResolvedValueOnce([{ id: "account-origin" }, { id: "account-destination" }]);
    deleteManyTransaction.mockResolvedValueOnce({ count: 2 });

    await deleteMovement("tx-transfer-out", "user-demo");

    expect(findManyTransaction).toHaveBeenCalledWith({ where: { transferId: "transfer-1", userId: "user-demo" }, orderBy: { tipo: "asc" } });
    expect(findManyAccount).toHaveBeenCalledWith({ where: { id: { in: ["account-origin", "account-destination"] }, userId: "user-demo" }, select: { id: true } });
    expect(deleteManyTransaction).toHaveBeenCalledWith({
      where: {
        transferId: "transfer-1",
        userId: "user-demo",
        OR: [
          { id: salida.id, tipo: salida.tipo, monto: salida.monto, accountId: salida.accountId, categoryId: null, updatedAt: salida.updatedAt },
          { id: entrada.id, tipo: entrada.tipo, monto: entrada.monto, accountId: entrada.accountId, categoryId: null, updatedAt: entrada.updatedAt },
        ],
      },
    });
    expect(updateAccount).toHaveBeenNthCalledWith(1, { where: { id: "account-origin", userId: "user-demo" }, data: { saldo: { increment: 10_000 } } });
    expect(updateAccount).toHaveBeenNthCalledWith(2, { where: { id: "account-destination", userId: "user-demo" }, data: { saldo: { increment: -10_000 } } });
  });

  it("deletes a transfer pair from a fused transfer id", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);
    findManyAccount.mockResolvedValueOnce([{ id: "account-origin" }, { id: "account-destination" }]);
    deleteManyTransaction.mockResolvedValueOnce({ count: 2 });

    await deleteMovement("transfer-1", "user-demo");

    expect(updateAccount).toHaveBeenCalledTimes(2);
  });

  it("returns not found when a fused transfer pair cannot be found", async () => {
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([]);

    await expect(deleteMovement("missing-transfer", "user-demo")).rejects.toThrow(MovementDeleteNotFoundError);

    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects incomplete transfer pairs without changing balances", async () => {
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([
      transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, accountId: "account-origin", categoryId: null, transferId: "transfer-1" }),
    ]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects inconsistent transfer pairs without changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 11_000, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects transfer pairs with mismatched dates before deleting or changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, fecha: new Date("2026-07-05T12:00:00.000Z"), accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, fecha: new Date("2026-07-06T12:00:00.000Z"), accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(findManyAccount).not.toHaveBeenCalled();
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects transfer pairs with mismatched descriptions before deleting or changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, descripcion: "Savings", accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, descripcion: "Stale savings", accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(findManyAccount).not.toHaveBeenCalled();
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects transfer pairs that use the same account before deleting or changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-shared", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-shared", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(findManyAccount).not.toHaveBeenCalled();
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects transfer pairs with a category on the expense side before deleting or changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: "category-food", transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(findManyAccount).not.toHaveBeenCalled();
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects transfer pairs with a category on the income side before deleting or changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-destination", categoryId: "category-salary", transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(findManyAccount).not.toHaveBeenCalled();
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects transfer rows with duplicate same-type entries before deleting or changing balances", async () => {
    const firstSalida = transaction({ id: "tx-transfer-out-1", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const secondSalida = transaction({ id: "tx-transfer-out-2", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin-2", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([firstSalida, secondSalida]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(findManyAccount).not.toHaveBeenCalled();
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects transfer ids with more than two rows before deleting or changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    const extraEntrada = transaction({ id: "tx-transfer-in-extra", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-extra", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada, extraEntrada]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(findManyAccount).not.toHaveBeenCalled();
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects transfer pairs with invalid account references without changing balances", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);
    findManyAccount.mockResolvedValueOnce([{ id: "account-origin" }]);

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects stale transfer deletes without changing balances when the guarded delete does not match", async () => {
    const salida = transaction({ id: "tx-transfer-out", tipo: TransactionType.GASTO, monto: 10_000, accountId: "account-origin", categoryId: null, transferId: "transfer-1" });
    const entrada = transaction({ id: "tx-transfer-in", tipo: TransactionType.INGRESO, monto: 10_000, accountId: "account-destination", categoryId: null, transferId: "transfer-1" });
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([salida, entrada]);
    findManyAccount.mockResolvedValueOnce([{ id: "account-origin" }, { id: "account-destination" }]);
    deleteManyTransaction.mockResolvedValueOnce({ count: 1 });

    await expect(deleteMovement("transfer-1", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects stale deletes without changing balances when the guarded delete does not match", async () => {
    findFirstTransaction.mockResolvedValueOnce(transaction({ id: "tx-food", tipo: TransactionType.GASTO, monto: 1_000, accountId: "account-checking" }));
    deleteManyTransaction.mockResolvedValueOnce({ count: 0 });

    await expect(deleteMovement("tx-food", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects normal movement deletes when the historical account is not owned by the current user", async () => {
    findFirstTransaction.mockResolvedValueOnce(transaction({ id: "tx-food", tipo: TransactionType.GASTO, monto: 1_000, accountId: "other-user-account" }));
    deleteManyTransaction.mockResolvedValueOnce({ count: 1 });
    updateAccount.mockResolvedValueOnce({ count: 0 });

    await expect(deleteMovement("tx-food", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: "other-user-account", userId: "user-demo" },
      data: { saldo: { increment: 1_000 } },
    });
  });

  it("does not delete movements owned by another user", async () => {
    findFirstTransaction.mockResolvedValueOnce(null);
    findManyTransaction.mockResolvedValueOnce([]);

    await expect(deleteMovement("other-user-tx", "user-demo")).rejects.toThrow(MovementDeleteNotFoundError);

    expect(findFirstTransaction).toHaveBeenCalledWith({ where: { id: "other-user-tx", userId: "user-demo" } });
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("maps Prisma transaction conflicts to stale delete conflicts", async () => {
    runTransaction.mockRejectedValueOnce(prismaTransactionConflictError());

    await expect(deleteMovement("tx-food", "user-demo")).rejects.toThrow(MovementDeleteConflictError);

    expect(updateAccount).not.toHaveBeenCalled();
  });
});

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
