import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { AccountReactivateNotFoundError, LoanAccountConflictError, reactivateAccount } from "./reactivateAccount.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    account: {
      updateMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({ tipo: "OPERATIVA" }),
      findFirstOrThrow: vi.fn(),
    },
    transaction: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

const updateManyMock = prisma.account.updateMany as Mock;
const findFirstOrThrowMock = prisma.account.findFirstOrThrow as Mock;
const findLoanTransactionMock = prisma.transaction.findFirst as Mock;

describe("reactivateAccount", () => {
  beforeEach(() => {
    updateManyMock.mockReset();
    findFirstOrThrowMock.mockReset();
    findLoanTransactionMock.mockReset();
    findLoanTransactionMock.mockResolvedValue(null);
  });

  it("reactivates an existing account", async () => {
    const persistedAccount = {
      id: "account-demo-primary",
      nombre: "Cuenta Demo Principal",
      tipo: "OPERATIVA",
      saldo: 450_200,
      activa: true,
      notas: null,
      orden: 0,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-08T00:00:00.000Z"),
    };

    updateManyMock.mockResolvedValueOnce({ count: 1 });
    findFirstOrThrowMock.mockResolvedValueOnce(persistedAccount);

    const account = await reactivateAccount("account-demo-primary", "user-demo");

    expect(account).toEqual(persistedAccount);
    expect(account.activa).toBe(true);

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "account-demo-primary", userId: "user-demo" },
      data: { activa: true },
    });
    expect(findFirstOrThrowMock).toHaveBeenCalledWith({ where: { id: "account-demo-primary", userId: "user-demo" } });
  });

  it("throws when the account does not exist", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(reactivateAccount("missing-account", "user-demo")).rejects.toMatchObject({
      name: "AccountReactivateNotFoundError",
      message: "Account not found.",
    });

    expect(findFirstOrThrowMock).not.toHaveBeenCalled();
  });

  it("does not reactivate accounts owned by another user", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(reactivateAccount("account-other-user", "user-owner")).rejects.toBeInstanceOf(
      AccountReactivateNotFoundError,
    );

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "account-other-user", userId: "user-owner" },
      data: { activa: true },
    });
    expect(findFirstOrThrowMock).not.toHaveBeenCalled();
  });

  it("does not reactivate a loan-linked DEUDA account into an invalid active state", async () => {
    (prisma.account.findFirst as Mock).mockResolvedValueOnce({ tipo: "DEUDA" });
    findLoanTransactionMock.mockResolvedValueOnce({ id: "loan-delivery-tx" });

    await expect(reactivateAccount("account-debt", "user-demo")).rejects.toBeInstanceOf(LoanAccountConflictError);
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
