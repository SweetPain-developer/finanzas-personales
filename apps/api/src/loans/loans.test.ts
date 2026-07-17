import { TransactionType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../prisma.js";
import { createLoan, deleteLoan, getLoanById, getLoans, LoanConflictError, LoanNotFoundError, LoanValidationError, repayLoan, updateLoan, updateLoanStatus } from "./loans.js";

let currentTx: any;
vi.mock("../prisma.js", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

describe("loans", () => {
  beforeEach(() => { currentTx = undefined; transaction.mockClear(); });

  it("creates a delivery transaction and loan while decrementing the owned operational account", async () => {
    const tx = fakeClient({
      account: { findFirst: vi.fn().mockResolvedValue({ id: "account-1", tipo: "OPERATIVA", saldo: 10_000 }) },
      transaction: { create: vi.fn().mockResolvedValue({ id: "transaction-1" }) },
      loan: { create: vi.fn().mockResolvedValue({ id: "loan-1", estado: "PENDIENTE" }) },
    });
    currentTx = tx;

    await createLoan({ persona: "Ana", montoEntregado: 2_000, accountId: "account-1", fecha: "2026-07-16", notas: "Cena" }, "user-1");

    expect(tx.account.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "account-1", userId: "user-1", activa: true, tipo: { in: ["OPERATIVA", "AHORRO", "RESERVA"] }, saldo: { gte: 2_000 } },
      data: { saldo: { decrement: 2_000 } },
    }));
    expect(tx.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: TransactionType.GASTO, categoryId: null, transferId: null, notas: "Cena", userId: "user-1" }),
    }));
  });

  it("rejects an insufficient balance without creating a loan", async () => {
    const tx = fakeClient({
      account: { findFirst: vi.fn().mockResolvedValue({ id: "account-1", tipo: "OPERATIVA", saldo: 100 }) },
      transaction: { create: vi.fn() },
      loan: { create: vi.fn() },
    });
    tx.account.updateMany.mockResolvedValue({ count: 0 });
    currentTx = tx;

    await expect(createLoan({ persona: "Ana", montoEntregado: 2_000, accountId: "account-1" }, "user-1"))
      .rejects.toBeInstanceOf(LoanConflictError);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it("rejects invalid amounts before opening a database transaction", async () => {
    await expect(createLoan({ persona: "Ana", montoEntregado: 0, accountId: "account-1" }, "user-1"))
      .rejects.toBeInstanceOf(LoanValidationError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("records a partial repayment and derives the remaining balance", async () => {
    const tx = fakeClient({
      loan: { findFirst: vi.fn().mockResolvedValue(loanWithRepayments([{ monto: 2_000 }])), update: vi.fn() },
      account: { findFirst: vi.fn().mockResolvedValue({ id: "account-1", tipo: "AHORRO" }) },
      transaction: { create: vi.fn().mockResolvedValue({ id: "repayment-tx" }) },
      loanRepayment: { create: vi.fn().mockResolvedValue({ id: "repayment-1", monto: 3_000 }) },
    });
    currentTx = tx;

    await repayLoan("loan-1", { monto: 3_000, accountId: "account-1", fecha: "2026-07-16" }, "user-1");

    expect(tx.account.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "account-1", userId: "user-1", activa: true, tipo: { in: ["OPERATIVA", "AHORRO", "RESERVA"] } },
      data: { saldo: { increment: 3_000 } },
    }));
    expect(tx.loanRepayment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ loanId: "loan-1", userId: "user-1" }) }));
    expect(tx.loan.update).not.toHaveBeenCalled();
  });

  it("settles exactly on the final repayment and rejects overpayment", async () => {
    const tx = fakeClient({
      loan: { findFirst: vi.fn().mockResolvedValue(loanWithRepayments([{ monto: 7_000 }])), update: vi.fn().mockResolvedValue({}) },
      account: { findFirst: vi.fn().mockResolvedValue({ id: "account-1", tipo: "OPERATIVA" }) },
      transaction: { create: vi.fn().mockResolvedValue({ id: "repayment-tx" }) },
      loanRepayment: { create: vi.fn().mockResolvedValue({ id: "repayment-1", monto: 3_000 }) },
    });
    currentTx = tx;

    await repayLoan("loan-1", { monto: 3_000, accountId: "account-1" }, "user-1");
    expect(tx.loan.update).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: "SALDADO" } }));

    tx.loan.findFirst.mockResolvedValueOnce(loanWithRepayments([{ monto: 7_000 }]));
    await expect(repayLoan("loan-1", { monto: 4_000, accountId: "account-1" }, "user-1")).rejects.toBeInstanceOf(LoanValidationError);
    expect(tx.transaction.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, "ineligible DEUDA"],
    [null, "inactive"],
    [null, "foreign or missing"],
  ])("rejects %s repayment account", async (account) => {
    const tx = fakeClient({ loan: { findFirst: vi.fn().mockResolvedValue(loanWithRepayments([])) }, account: { findFirst: vi.fn().mockResolvedValue(account) } });
    currentTx = tx;
    await expect(repayLoan("loan-1", { monto: 1_000, accountId: "account-1" }, "user-1")).rejects.toBeInstanceOf(LoanValidationError);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it("rejects a repayment when the atomic credit loses the account race", async () => {
    const tx = fakeClient({
      loan: { findFirst: vi.fn().mockResolvedValue(loanWithRepayments([])) },
      account: { findFirst: vi.fn().mockResolvedValue({ id: "account-1", tipo: "AHORRO" }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    });
    currentTx = tx;

    await expect(repayLoan("loan-1", { monto: 1_000, accountId: "account-1" }, "user-1"))
      .rejects.toMatchObject({ name: "LoanConflictError", message: "Destination account is no longer available." });
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.loanRepayment.create).not.toHaveBeenCalled();
  });

  it("enforces ownership and valid status transitions", async () => {
    const tx = fakeClient({ loan: { findFirst: vi.fn().mockResolvedValue(null) } });
    currentTx = tx;
    (prisma as any).loan = tx.loan;
    await expect(getLoanById("loan-1", "other-user")).rejects.toBeInstanceOf(LoanNotFoundError);
    await expect(repayLoan("loan-1", { monto: 1, accountId: "account-1" }, "other-user")).rejects.toBeInstanceOf(LoanNotFoundError);

    tx.loan.findFirst.mockResolvedValueOnce({ id: "loan-1", estado: "SALDADO" });
    await expect(updateLoanStatus("loan-1", { estado: "PENDIENTE" }, "user-1")).rejects.toBeInstanceOf(LoanConflictError);
    tx.loan.findFirst.mockResolvedValueOnce({ id: "loan-1", estado: "INCOBRABLE" });
    await updateLoanStatus("loan-1", { estado: "PENDIENTE" }, "user-1");
  });

  it("does not edit or delete a loan after repayments", async () => {
    const loan = loanWithRepayments([{ monto: 1_000 }]);
    const tx = fakeClient({ loan: { findFirst: vi.fn().mockResolvedValue(loan) } });
    currentTx = tx;
    await expect(updateLoan("loan-1", { persona: "Nueva" }, "user-1")).rejects.toBeInstanceOf(LoanConflictError);
    await expect(deleteLoan("loan-1", "user-1")).rejects.toBeInstanceOf(LoanConflictError);
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to restore or mutate balances when a historical loan account is now invalid", async () => {
    const tx = fakeClient({
      loan: { findFirst: vi.fn().mockResolvedValue(loanWithRepayments([])) },
      account: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    currentTx = tx;

    await expect(updateLoan("loan-1", { persona: "Nueva" }, "user-1")).rejects.toBeInstanceOf(LoanConflictError);
    await expect(deleteLoan("loan-1", "user-1")).rejects.toBeInstanceOf(LoanConflictError);
    expect(tx.account.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.update).not.toHaveBeenCalled();
    expect(tx.loan.delete).not.toHaveBeenCalled();
  });

  it("rolls back an edit when the atomic debit loses the account race", async () => {
    const tx = fakeClient({
      loan: { findFirst: vi.fn().mockResolvedValue(loanWithRepayments([])) },
      account: { findFirst: vi.fn().mockResolvedValue({ id: "account-1", tipo: "OPERATIVA" }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    });
    currentTx = tx;

    await expect(updateLoan("loan-1", { montoEntregado: 11_000 }, "user-1"))
      .rejects.toMatchObject({ name: "LoanConflictError", message: "Insufficient account balance." });
    expect(tx.transaction.update).not.toHaveBeenCalled();
    expect(tx.loan.update).not.toHaveBeenCalled();
  });

  it("rolls back a cross-account edit when restoring succeeds but the new debit loses the account race", async () => {
    const state = {
      oldBalance: 0,
      newBalance: 12_000,
      loan: { accountId: "account-1", montoEntregado: 10_000 },
    };
    const originalLoan = loanWithRepayments([]);
    const tx = fakeClient({
      loan: { findFirst: vi.fn().mockResolvedValue(originalLoan) },
      account: {
        findFirst: vi.fn().mockResolvedValue({ tipo: "OPERATIVA" }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (where.id === "account-1") {
            state.oldBalance += data.saldo.increment;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
    });
    currentTx = tx;
    transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(state);
      try { return await callback(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
    });

    await expect(updateLoan("loan-1", { accountId: "account-2" }, "user-1"))
      .rejects.toMatchObject({ name: "LoanConflictError", message: "Insufficient account balance." });
    expect(state).toEqual({ oldBalance: 0, newBalance: 12_000, loan: { accountId: "account-1", montoEntregado: 10_000 } });
    expect(tx.account.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "account-1", userId: "user-1", activa: true, tipo: { in: ["OPERATIVA", "AHORRO", "RESERVA"] } },
    }));
    expect(tx.account.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: "account-2", userId: "user-1", activa: true, tipo: { in: ["OPERATIVA", "AHORRO", "RESERVA"] }, saldo: { gte: 10_000 } },
    }));
    expect(tx.transaction.update).not.toHaveBeenCalled();
    expect(tx.loan.update).not.toHaveBeenCalled();
  });

  it("does not delete a loan when restoring its account loses the account race", async () => {
    const tx = fakeClient({
      loan: { findFirst: vi.fn().mockResolvedValue(loanWithRepayments([])) },
      account: { findFirst: vi.fn().mockResolvedValue({ id: "account-1", tipo: "RESERVA" }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    });
    currentTx = tx;

    await expect(deleteLoan("loan-1", "user-1"))
      .rejects.toMatchObject({ name: "LoanConflictError", message: "Loan-linked account is no longer available." });
    expect(tx.loan.delete).not.toHaveBeenCalled();
    expect(tx.transaction.delete).not.toHaveBeenCalled();
  });

  it("uses a snapshot fake to prove a failed mutation rolls back and stops later writes", async () => {
    const state = { balance: 10_000, transactions: 0, loans: 0 };
    const tx = fakeClient({
      account: { findFirst: vi.fn().mockResolvedValue({ id: "account-1", tipo: "OPERATIVA" }), updateMany: vi.fn(async () => { state.balance -= 2_000; return { count: 1 }; }) },
      transaction: { create: vi.fn(async () => { state.transactions += 1; return { id: "tx-1" }; }) },
      loan: { create: vi.fn(async () => { state.loans += 1; throw new Error("simulated downstream failure"); }) },
    });
    currentTx = tx;
    transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) => {
      const snapshot = { ...state };
      try { return await callback(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
    });

    await expect(createLoan({ persona: "Ana", montoEntregado: 2_000, accountId: "account-1" }, "user-1")).rejects.toThrow("simulated downstream failure");
    expect(state).toEqual({ balance: 10_000, transactions: 0, loans: 0 });
  });
});

function fakeClient(overrides: Record<string, unknown> = {}) {
  const account = { findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
  const transaction = { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() };
  const loan = { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() };
  return {
    account: { ...account, ...(overrides.account as object) },
    transaction: { ...transaction, ...(overrides.transaction as object) },
    loan: { ...loan, ...(overrides.loan as object) },
    loanRepayment: { create: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), deleteMany: vi.fn(), ...(overrides.loanRepayment as object) },
  } as any;
}

function loanWithRepayments(repayments: Array<{ monto: number }>) {
  return {
    id: "loan-1",
    userId: "user-1",
    estado: "PENDIENTE",
    montoEntregado: 10_000,
    persona: "Ana",
    entregaTransactionId: "delivery-tx",
    entregaTransaction: { accountId: "account-1" },
    devoluciones: repayments.map((repayment, index) => ({ id: `repayment-${index}`, ...repayment })),
  };
}
