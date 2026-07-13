import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { AccountDeleteConflictError, AccountDeleteNotFoundError, deleteAccount } from "./deleteAccount.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    account: {
      findFirst: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  },
}));

const findFirstMock = prisma.account.findFirst as Mock;
const updateMock = prisma.account.update as Mock;
const deleteManyMock = prisma.account.deleteMany as Mock;
const runTransactionMock = prisma.$transaction as Mock;

describe("deleteAccount", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    updateMock.mockReset();
    deleteManyMock.mockReset();
    runTransactionMock.mockReset();
    runTransactionMock.mockImplementation(async (callback) => callback(prisma));
  });

  it("throws when the account does not exist", async () => {
    findFirstMock.mockResolvedValueOnce(null);

    await expect(deleteAccount("missing-account", "user-demo")).rejects.toBeInstanceOf(AccountDeleteNotFoundError);

    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("physically deletes accounts without transactions or goals", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "account-empty", _count: { transacciones: 0, metas: 0 } });
    deleteManyMock.mockResolvedValueOnce({ count: 1 });

    await expect(deleteAccount("account-empty", "user-demo")).resolves.toEqual({ status: "deleted" });

    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: "account-empty", userId: "user-demo" },
      select: { id: true, _count: { select: { transacciones: true, metas: true } } },
    });
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: "account-empty", userId: "user-demo" } });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects physical deletion for accounts with transactions", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "account-with-history", _count: { transacciones: 1, metas: 0 } });

    await expect(deleteAccount("account-with-history", "user-demo")).rejects.toBeInstanceOf(AccountDeleteConflictError);

    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("rejects physical deletion for accounts linked to goals", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "account-goal", _count: { transacciones: 0, metas: 1 } });

    await expect(deleteAccount("account-goal", "user-demo")).rejects.toBeInstanceOf(AccountDeleteConflictError);

    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it("maps race FK conflicts to a delete conflict", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "account-race", _count: { transacciones: 0, metas: 0 } });
    deleteManyMock.mockRejectedValueOnce({ code: "P2003" });

    await expect(deleteAccount("account-race", "user-demo")).rejects.toBeInstanceOf(AccountDeleteConflictError);

    expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: "account-race", userId: "user-demo" } });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns not found when the account disappears during deletion", async () => {
    findFirstMock.mockResolvedValueOnce({ id: "account-removed", _count: { transacciones: 0, metas: 0 } });
    deleteManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(deleteAccount("account-removed", "user-demo")).rejects.toBeInstanceOf(AccountDeleteNotFoundError);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not delete accounts owned by another user", async () => {
    findFirstMock.mockResolvedValueOnce(null);

    await expect(deleteAccount("account-other-user", "user-owner")).rejects.toBeInstanceOf(AccountDeleteNotFoundError);

    expect(findFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "account-other-user", userId: "user-owner" },
    }));
    expect(deleteManyMock).not.toHaveBeenCalled();
  });
});
