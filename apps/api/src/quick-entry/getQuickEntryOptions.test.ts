import { AccountType, CategoryType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { getQuickEntryOptions } from "./getQuickEntryOptions.js";
import { prisma } from "../prisma.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    account: {
      findMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
    transaction: {
      findFirst: vi.fn(),
    },
  },
}));

const findManyAccounts = prisma.account.findMany as Mock;
const findManyCategories = prisma.category.findMany as Mock;
const findFirstTransaction = prisma.transaction.findFirst as Mock;

describe("getQuickEntryOptions", () => {
  beforeEach(() => {
    findManyAccounts.mockReset();
    findManyCategories.mockReset();
    findFirstTransaction.mockReset();
  });

  it("returns active accounts, grouped categories, and the latest used active account", async () => {
    findManyAccounts.mockResolvedValue([
      { id: "account-primary", nombre: "Cuenta principal demo", tipo: AccountType.OPERATIVA },
      { id: "account-secondary", nombre: "Cuenta secundaria demo", tipo: AccountType.OPERATIVA },
    ]);
    findManyCategories.mockResolvedValue([
      { id: "category-delivery", nombre: "Delivery", icono: "delivery", tipo: CategoryType.GASTO },
      { id: "category-sent-transfer", nombre: "Transferencia enviada", icono: "send", tipo: CategoryType.GASTO },
      { id: "category-salary", nombre: "Sueldo", icono: "salary", tipo: CategoryType.INGRESO },
    ]);
    findFirstTransaction.mockResolvedValue({ accountId: "account-secondary" });

    const result = await getQuickEntryOptions();

    expect(result).toEqual({
      accounts: [
        { id: "account-primary", nombre: "Cuenta principal demo", tipo: AccountType.OPERATIVA },
        { id: "account-secondary", nombre: "Cuenta secundaria demo", tipo: AccountType.OPERATIVA },
      ],
      categories: {
        GASTO: [
          { id: "category-delivery", nombre: "Delivery", icono: "delivery" },
          { id: "category-sent-transfer", nombre: "Transferencia enviada", icono: "send" },
        ],
        INGRESO: [{ id: "category-salary", nombre: "Sueldo", icono: "salary" }],
      },
      lastUsedAccountId: "account-secondary",
    });
    expect(findManyAccounts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activa: true },
        orderBy: [{ orden: "asc" }, { id: "asc" }],
      }),
    );
    expect(findFirstTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { account: { activa: true } },
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("derives the last used account from the newest active-account transaction", async () => {
    findManyAccounts.mockResolvedValue([
      { id: "account-active", nombre: "Active account", tipo: AccountType.OPERATIVA },
      { id: "account-backup", nombre: "Backup account", tipo: AccountType.AHORRO },
    ]);
    findManyCategories.mockResolvedValue([]);
    findFirstTransaction.mockImplementation((query) => {
      const transactionsByNewest = [
        { accountId: "account-inactive", account: { activa: false } },
        { accountId: "account-backup", account: { activa: true } },
      ];

      return Promise.resolve(
        transactionsByNewest.find((transaction) => {
          if (query?.where?.account?.activa === true) {
            return transaction.account.activa;
          }

          return true;
        }),
      );
    });

    const result = await getQuickEntryOptions();

    expect(result.lastUsedAccountId).toBe("account-backup");
  });

  it("falls back to the first active account and then null when no transaction exists", async () => {
    findManyAccounts.mockResolvedValueOnce([{ id: "account-first", nombre: "First", tipo: AccountType.OPERATIVA }]);
    findManyCategories.mockResolvedValueOnce([]);
    findFirstTransaction.mockResolvedValueOnce(null);

    await expect(getQuickEntryOptions()).resolves.toMatchObject({ lastUsedAccountId: "account-first" });

    findManyAccounts.mockResolvedValueOnce([]);
    findManyCategories.mockResolvedValueOnce([]);
    findFirstTransaction.mockResolvedValueOnce(null);

    await expect(getQuickEntryOptions()).resolves.toMatchObject({ lastUsedAccountId: null });
  });
});
