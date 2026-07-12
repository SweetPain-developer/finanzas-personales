import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { AccountDeleteConflictError, AccountDeleteNotFoundError, deleteAccount } from "./deleteAccount.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  },
}));

const findUniqueMock = prisma.account.findUnique as Mock;
const updateMock = prisma.account.update as Mock;
const deleteMock = prisma.account.delete as Mock;
const runTransactionMock = prisma.$transaction as Mock;

describe("deleteAccount", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
    runTransactionMock.mockReset();
    runTransactionMock.mockImplementation(async (callback) => callback(prisma));
  });

  it("throws when the account does not exist", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    await expect(deleteAccount("missing-account")).rejects.toBeInstanceOf(AccountDeleteNotFoundError);

    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("physically deletes accounts without transactions or goals", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "account-empty", _count: { transacciones: 0, metas: 0 } });
    deleteMock.mockResolvedValueOnce({ id: "account-empty" });

    await expect(deleteAccount("account-empty")).resolves.toEqual({ status: "deleted" });

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "account-empty" },
      select: { id: true, _count: { select: { transacciones: true, metas: true } } },
    });
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "account-empty" } });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects physical deletion for accounts with transactions", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "account-with-history", _count: { transacciones: 1, metas: 0 } });

    await expect(deleteAccount("account-with-history")).rejects.toBeInstanceOf(AccountDeleteConflictError);

    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("rejects physical deletion for accounts linked to goals", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "account-goal", _count: { transacciones: 0, metas: 1 } });

    await expect(deleteAccount("account-goal")).rejects.toBeInstanceOf(AccountDeleteConflictError);

    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("maps race FK conflicts to a delete conflict", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "account-race", _count: { transacciones: 0, metas: 0 } });
    deleteMock.mockRejectedValueOnce({ code: "P2003" });

    await expect(deleteAccount("account-race")).rejects.toBeInstanceOf(AccountDeleteConflictError);

    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "account-race" } });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns not found when the account disappears during deletion", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "account-removed", _count: { transacciones: 0, metas: 0 } });
    deleteMock.mockRejectedValueOnce({ code: "P2025" });

    await expect(deleteAccount("account-removed")).rejects.toBeInstanceOf(AccountDeleteNotFoundError);

    expect(updateMock).not.toHaveBeenCalled();
  });
});
