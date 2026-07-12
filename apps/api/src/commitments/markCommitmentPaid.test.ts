import { CategoryType, CommitmentStatus, CommitmentType, TransactionType, type Commitment } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { CommitmentNotFoundError, CommitmentPaymentConflictError, CommitmentPaymentValidationError, markCommitmentPaid, markCommitmentUnpaid } from "./markCommitmentPaid.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    commitment: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    category: {
      findUnique: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  },
}));

const findUniqueCommitment = prisma.commitment.findUnique as Mock;
const findUniqueOrThrowCommitment = prisma.commitment.findUniqueOrThrow as Mock;
const updateCommitment = prisma.commitment.update as Mock;
const updateManyCommitment = prisma.commitment.updateMany as Mock;
const findUniqueCategory = prisma.category.findUnique as Mock;
const createTransaction = prisma.transaction.create as Mock;
const deleteManyTransaction = prisma.transaction.deleteMany as Mock;
const findUniqueTransaction = prisma.transaction.findUnique as Mock;
const findFirstAccount = prisma.account.findFirst as Mock;
const updateAccount = prisma.account.update as Mock;
const runPrismaTransaction = prisma.$transaction as Mock;

describe("markCommitmentPaid", () => {
  beforeEach(() => {
    findUniqueCommitment.mockReset();
    findUniqueOrThrowCommitment.mockReset();
    updateCommitment.mockReset();
    updateManyCommitment.mockReset();
    findUniqueCategory.mockReset();
    createTransaction.mockReset();
    deleteManyTransaction.mockReset();
    findUniqueTransaction.mockReset();
    findFirstAccount.mockReset();
    updateAccount.mockReset();
    runPrismaTransaction.mockReset();
    runPrismaTransaction.mockImplementation(async (callback) => callback(prisma));
  });

  it("creates one expense transaction, decreases the account balance, and marks a pending commitment as paid", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", nombre: "Arriendo", monto: 350_000, estado: CommitmentStatus.PENDIENTE }));
    updateManyCommitment.mockResolvedValueOnce({ count: 1 });
    findFirstAccount.mockResolvedValueOnce({ id: "account-demo-primary", activa: true });
    findUniqueCategory.mockResolvedValueOnce({ id: "category-services", tipo: CategoryType.GASTO });
    createTransaction.mockResolvedValueOnce({ id: "transaction-payment" });
    findUniqueOrThrowCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", estado: CommitmentStatus.PAGADO }));

    const result = await markCommitmentPaid("commitment-rent", { accountId: "account-demo-primary", categoryId: "category-services" });

    expect(result.estado).toBe(CommitmentStatus.PAGADO);
    expect(runPrismaTransaction).toHaveBeenCalledTimes(1);
    expect(findFirstAccount).toHaveBeenCalledWith({ where: { id: "account-demo-primary", activa: true } });
    expect(findUniqueCategory).toHaveBeenCalledWith({ where: { id: "category-services" } });
    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: "account-demo-primary" },
      data: { saldo: { decrement: 350_000 } },
    });
    expect(createTransaction).toHaveBeenCalledWith({
      data: {
        tipo: TransactionType.GASTO,
        monto: 350_000,
        descripcion: "Pago compromiso: Arriendo",
        accountId: "account-demo-primary",
        categoryId: "category-services",
        transferId: null,
      },
    });
    expect(updateManyCommitment).toHaveBeenCalledWith({
      where: { id: "commitment-rent", estado: CommitmentStatus.PENDIENTE },
      data: { estado: CommitmentStatus.PAGADO },
    });
    expect(updateCommitment).toHaveBeenCalledWith({
      where: { id: "commitment-rent" },
      data: { paymentTransactionId: "transaction-payment" },
    });
    expect(findUniqueOrThrowCommitment).toHaveBeenCalledWith({ where: { id: "commitment-rent" } });
  });

  it("returns an already paid commitment without updating it again", async () => {
    const paidCommitment = commitment({ id: "commitment-phone", estado: CommitmentStatus.PAGADO });
    findUniqueCommitment.mockResolvedValueOnce(paidCommitment);

    const result = await markCommitmentPaid("commitment-phone", { accountId: "account-demo-primary", categoryId: "category-services" });

    expect(result).toEqual(paidCommitment);
    expect(runPrismaTransaction).not.toHaveBeenCalled();
    expect(findFirstAccount).not.toHaveBeenCalled();
    expect(findUniqueCategory).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects nonexistent commitments without creating transactions", async () => {
    findUniqueCommitment.mockResolvedValueOnce(null);

    await expect(markCommitmentPaid("missing-commitment", { accountId: "account-demo-primary", categoryId: "category-services" })).rejects.toThrow(new CommitmentNotFoundError("Commitment not found."));

    expect(runPrismaTransaction).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects missing account and category for a pending commitment", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", estado: CommitmentStatus.PENDIENTE }));
    updateManyCommitment.mockResolvedValueOnce({ count: 1 });

    await expect(markCommitmentPaid("commitment-rent", {})).rejects.toThrow(new CommitmentPaymentValidationError("accountId is required."));

    expect(runPrismaTransaction).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
  });

  it.each([
    { payload: null, message: "Request body must be an object." },
    { payload: { accountId: " ", categoryId: "category-services" }, message: "accountId is required." },
    { payload: { accountId: "account-demo-primary" }, message: "categoryId is required." },
    { payload: { accountId: "account-demo-primary", categoryId: " " }, message: "categoryId is required." },
  ])("rejects malformed payment payloads before opening a transaction", async ({ payload, message }) => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", estado: CommitmentStatus.PENDIENTE }));

    await expect(markCommitmentPaid("commitment-rent", payload)).rejects.toThrow(new CommitmentPaymentValidationError(message));

    expect(runPrismaTransaction).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
  });

  it("rejects nonexistent or inactive accounts without creating a transaction", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", estado: CommitmentStatus.PENDIENTE }));
    updateManyCommitment.mockResolvedValueOnce({ count: 1 });
    findFirstAccount.mockResolvedValueOnce(null);
    findUniqueCategory.mockResolvedValueOnce({ id: "category-services", tipo: CategoryType.GASTO });

    await expect(markCommitmentPaid("commitment-rent", { accountId: "missing-account", categoryId: "category-services" })).rejects.toThrow(new CommitmentPaymentValidationError("Account not found or inactive."));

    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
  });

  it("rolls back the paid state when account validation fails", async () => {
    const state = mockTransactionalPaymentState({ account: null, category: { id: "category-services", tipo: CategoryType.GASTO } });

    await expect(markCommitmentPaid("commitment-rent", { accountId: "missing-account", categoryId: "category-services" })).rejects.toThrow(new CommitmentPaymentValidationError("Account not found or inactive."));

    expect(state.commitment.estado).toBe(CommitmentStatus.PENDIENTE);
    expect(state.accountSaldo).toBe(500_000);
    expect(state.transactions).toHaveLength(0);
  });

  it("rejects nonexistent categories without creating a transaction", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", estado: CommitmentStatus.PENDIENTE }));
    updateManyCommitment.mockResolvedValueOnce({ count: 1 });
    findFirstAccount.mockResolvedValueOnce({ id: "account-demo-primary", activa: true });
    findUniqueCategory.mockResolvedValueOnce(null);

    await expect(markCommitmentPaid("commitment-rent", { accountId: "account-demo-primary", categoryId: "missing-category" })).rejects.toThrow(new CommitmentPaymentValidationError("Category not found."));

    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
  });

  it("rolls back the paid state when category validation fails", async () => {
    const state = mockTransactionalPaymentState({ account: { id: "account-demo-primary", activa: true }, category: null });

    await expect(markCommitmentPaid("commitment-rent", { accountId: "account-demo-primary", categoryId: "missing-category" })).rejects.toThrow(new CommitmentPaymentValidationError("Category not found."));

    expect(state.commitment.estado).toBe(CommitmentStatus.PENDIENTE);
    expect(state.accountSaldo).toBe(500_000);
    expect(state.transactions).toHaveLength(0);
  });

  it("rejects non-expense categories without creating a transaction", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", estado: CommitmentStatus.PENDIENTE }));
    updateManyCommitment.mockResolvedValueOnce({ count: 1 });
    findFirstAccount.mockResolvedValueOnce({ id: "account-demo-primary", activa: true });
    findUniqueCategory.mockResolvedValueOnce({ id: "category-salary", tipo: CategoryType.INGRESO });

    await expect(markCommitmentPaid("commitment-rent", { accountId: "account-demo-primary", categoryId: "category-salary" })).rejects.toThrow(new CommitmentPaymentValidationError("Category type must be GASTO."));

    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
  });

  it("deletes the linked expense transaction, restores balance, and marks a paid commitment pending", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", monto: 350_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" }));
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", monto: 350_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" }));
    findUniqueTransaction.mockResolvedValueOnce({
      id: "transaction-payment",
      tipo: TransactionType.GASTO,
      monto: 350_000,
      accountId: "account-demo-primary",
      categoryId: "category-services",
      transferId: null,
    });
    updateManyCommitment.mockResolvedValueOnce({ count: 1 });
    deleteManyTransaction.mockResolvedValueOnce({ count: 1 });
    findUniqueOrThrowCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", estado: CommitmentStatus.PENDIENTE, paymentTransactionId: null }));

    const result = await markCommitmentUnpaid("commitment-rent");

    expect(result.estado).toBe(CommitmentStatus.PENDIENTE);
    expect(runPrismaTransaction).toHaveBeenCalledTimes(1);
    expect(updateManyCommitment).toHaveBeenCalledWith({
      where: { id: "commitment-rent", estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" },
      data: { estado: CommitmentStatus.PENDIENTE, paymentTransactionId: null },
    });
    expect(deleteManyTransaction).toHaveBeenCalledWith({
      where: {
        id: "transaction-payment",
        tipo: TransactionType.GASTO,
        monto: 350_000,
        accountId: "account-demo-primary",
        transferId: null,
      },
    });
    expect(updateAccount).toHaveBeenCalledWith({
      where: { id: "account-demo-primary" },
      data: { saldo: { increment: 350_000 } },
    });
  });

  it("rejects reverting an unpaid commitment before opening a transaction", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", estado: CommitmentStatus.PENDIENTE }));

    await expect(markCommitmentUnpaid("commitment-rent")).rejects.toThrow(new CommitmentPaymentValidationError("Only paid commitments can be reverted."));

    expect(runPrismaTransaction).not.toHaveBeenCalled();
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects reverting a paid commitment without a linked payment transaction", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", estado: CommitmentStatus.PAGADO, paymentTransactionId: null }));
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", estado: CommitmentStatus.PAGADO, paymentTransactionId: null }));

    await expect(markCommitmentUnpaid("commitment-phone")).rejects.toThrow(new CommitmentPaymentConflictError("Paid commitment has no linked payment transaction."));

    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects reverting a paid commitment when the linked transaction is missing", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", estado: CommitmentStatus.PAGADO, paymentTransactionId: "missing-transaction" }));
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", estado: CommitmentStatus.PAGADO, paymentTransactionId: "missing-transaction" }));
    findUniqueTransaction.mockResolvedValueOnce(null);

    await expect(markCommitmentUnpaid("commitment-phone")).rejects.toThrow(new CommitmentPaymentConflictError("Linked payment transaction not found."));

    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it.each([
    { transaction: { tipo: TransactionType.INGRESO, transferId: null, monto: 350_000 }, name: "wrong type" },
    { transaction: { tipo: TransactionType.GASTO, transferId: "transfer-1", monto: 350_000 }, name: "transfer link" },
    { transaction: { tipo: TransactionType.GASTO, transferId: null, monto: 340_000 }, name: "amount mismatch" },
  ])("rejects reverting when the linked transaction has $name", async ({ transaction }) => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", monto: 350_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" }));
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", monto: 350_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" }));
    findUniqueTransaction.mockResolvedValueOnce({
      id: "transaction-payment",
      accountId: "account-demo-primary",
      categoryId: "category-services",
      ...transaction,
    });

    await expect(markCommitmentUnpaid("commitment-phone")).rejects.toThrow(new CommitmentPaymentConflictError("Linked payment transaction is not reversible."));

    expect(updateManyCommitment).not.toHaveBeenCalled();
    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects reverting when the commitment update guard matches no row", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", monto: 350_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" }));
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", monto: 350_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" }));
    findUniqueTransaction.mockResolvedValueOnce({ id: "transaction-payment", tipo: TransactionType.GASTO, monto: 350_000, accountId: "account-demo-primary", transferId: null });
    updateManyCommitment.mockResolvedValueOnce({ count: 0 });

    await expect(markCommitmentUnpaid("commitment-phone")).rejects.toThrow(new CommitmentPaymentConflictError("Commitment changed while reverting payment."));

    expect(deleteManyTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("rejects reverting when the linked transaction delete guard matches no row", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", monto: 350_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" }));
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", monto: 350_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" }));
    findUniqueTransaction.mockResolvedValueOnce({ id: "transaction-payment", tipo: TransactionType.GASTO, monto: 350_000, accountId: "account-demo-primary", transferId: null });
    updateManyCommitment.mockResolvedValueOnce({ count: 1 });
    deleteManyTransaction.mockResolvedValueOnce({ count: 0 });

    await expect(markCommitmentUnpaid("commitment-phone")).rejects.toThrow(new CommitmentPaymentConflictError("Linked payment transaction changed while reverting payment."));

    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("returns a retry-friendly conflict when the serializable transaction conflicts", async () => {
    findUniqueCommitment.mockResolvedValueOnce(commitment({ id: "commitment-phone", estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-payment" }));
    runPrismaTransaction.mockRejectedValueOnce({ code: "P2034" });

    await expect(markCommitmentUnpaid("commitment-phone")).rejects.toThrow(new CommitmentPaymentConflictError("Commitment changed while reverting payment. Please reload and try again."));
  });
});

function commitment(overrides: Partial<Commitment> & { id: string; estado: CommitmentStatus }): Commitment {
  const base: Commitment = {
    id: overrides.id,
    nombre: "Compromiso",
    tipo: CommitmentType.RECURRENTE,
    monto: 10_000,
    estado: overrides.estado,
    fechaVencimiento: new Date("2026-07-10T00:00:00.000Z"),
    mes: 7,
    anio: 2026,
    notas: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    templateId: null,
    paymentTransactionId: null,
  };

  return { ...base, ...overrides };
}

function mockTransactionalPaymentState(options: {
  account: { id: string; activa: boolean } | null;
  category: { id: string; tipo: CategoryType } | null;
}) {
  const state = {
    commitment: commitment({ id: "commitment-rent", nombre: "Arriendo", monto: 350_000, estado: CommitmentStatus.PENDIENTE }),
    accountSaldo: 500_000,
    transactions: [] as unknown[],
  };

  findUniqueCommitment.mockImplementation(async () => state.commitment);
  updateManyCommitment.mockImplementation(async ({ where, data }) => {
    if (where.id === state.commitment.id && where.estado === state.commitment.estado) {
      state.commitment = { ...state.commitment, ...data };
      return { count: 1 };
    }

    return { count: 0 };
  });
  findFirstAccount.mockResolvedValue(options.account);
  findUniqueCategory.mockResolvedValue(options.category);
  updateAccount.mockImplementation(async ({ data }) => {
    state.accountSaldo -= data.saldo.decrement;
  });
  createTransaction.mockImplementation(async ({ data }) => {
    state.transactions.push(data);
  });
  findUniqueOrThrowCommitment.mockImplementation(async () => state.commitment);
  runPrismaTransaction.mockImplementation(async (callback) => {
    const snapshot = {
      commitment: state.commitment,
      accountSaldo: state.accountSaldo,
      transactionCount: state.transactions.length,
    };

    try {
      return await callback(prisma);
    } catch (error) {
      state.commitment = snapshot.commitment;
      state.accountSaldo = snapshot.accountSaldo;
      state.transactions.length = snapshot.transactionCount;
      throw error;
    }
  });

  return state;
}
