import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { AccountReactivateNotFoundError, reactivateAccount } from "./reactivateAccount.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    account: {
      updateMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
  },
}));

const updateManyMock = prisma.account.updateMany as Mock;
const findFirstOrThrowMock = prisma.account.findFirstOrThrow as Mock;

describe("reactivateAccount", () => {
  beforeEach(() => {
    updateManyMock.mockReset();
    findFirstOrThrowMock.mockReset();
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
});
