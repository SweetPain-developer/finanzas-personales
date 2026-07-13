import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { AccountDeactivateNotFoundError, deactivateAccount } from "./deactivateAccount.js";

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

describe("deactivateAccount", () => {
  beforeEach(() => {
    updateManyMock.mockReset();
    findFirstOrThrowMock.mockReset();
  });

  it("deactivates an existing account", async () => {
    const persistedAccount = {
      id: "account-demo-primary",
      nombre: "Cuenta Demo Principal",
      tipo: "OPERATIVA",
      saldo: 450_200,
      activa: false,
      notas: null,
      orden: 0,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-08T00:00:00.000Z"),
    };

    updateManyMock.mockResolvedValueOnce({ count: 1 });
    findFirstOrThrowMock.mockResolvedValueOnce(persistedAccount);

    const account = await deactivateAccount("account-demo-primary", "user-demo");

    expect(account).toEqual(persistedAccount);
    expect(account.activa).toBe(false);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "account-demo-primary", userId: "user-demo" },
      data: { activa: false },
    });
    expect(findFirstOrThrowMock).toHaveBeenCalledWith({ where: { id: "account-demo-primary", userId: "user-demo" } });
  });

  it("does not require history checks to deactivate an existing account", async () => {
    const persistedAccount = {
      id: "account-empty",
      nombre: "Cuenta nueva",
      tipo: "AHORRO",
      saldo: 0,
      activa: false,
      notas: null,
      orden: 1,
      createdAt: new Date("2026-07-09T00:00:00.000Z"),
      updatedAt: new Date("2026-07-10T00:00:00.000Z"),
    };

    updateManyMock.mockResolvedValueOnce({ count: 1 });
    findFirstOrThrowMock.mockResolvedValueOnce(persistedAccount);

    await expect(deactivateAccount("account-empty", "user-demo")).resolves.toEqual(persistedAccount);

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "account-empty", userId: "user-demo" },
      data: { activa: false },
    });
    expect(findFirstOrThrowMock).toHaveBeenCalledWith({ where: { id: "account-empty", userId: "user-demo" } });
  });

  it("throws when the account does not exist", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(deactivateAccount("missing-account", "user-demo")).rejects.toBeInstanceOf(AccountDeactivateNotFoundError);

    expect(findFirstOrThrowMock).not.toHaveBeenCalled();
  });

  it("maps a post-update not-found race to the domain not found error", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 1 });
    findFirstOrThrowMock.mockRejectedValueOnce({ code: "P2025" });

    await expect(deactivateAccount("account-removed-after-update", "user-demo")).rejects.toBeInstanceOf(
      AccountDeactivateNotFoundError,
    );

    expect(findFirstOrThrowMock).toHaveBeenCalledWith({ where: { id: "account-removed-after-update", userId: "user-demo" } });
  });

  it("does not deactivate accounts owned by another user", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(deactivateAccount("account-other-user", "user-owner")).rejects.toBeInstanceOf(
      AccountDeactivateNotFoundError,
    );

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "account-other-user", userId: "user-owner" },
      data: { activa: false },
    });
    expect(findFirstOrThrowMock).not.toHaveBeenCalled();
  });
});
