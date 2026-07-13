import { CategoryType, TransactionType, type Account, type Category, type Transaction } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { getMovements, MovementValidationError } from "./getMovements.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    account: { findMany: vi.fn() },
    category: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
}));

const findManyAccounts = prisma.account.findMany as Mock;
const findManyCategories = prisma.category.findMany as Mock;
const findManyTransactions = prisma.transaction.findMany as Mock;

describe("getMovements", () => {
  beforeEach(() => {
    findManyAccounts.mockReset();
    findManyCategories.mockReset();
    findManyTransactions.mockReset();
  });

  it("returns normal movements grouped by date with deterministic labels", async () => {
    mockFilters();
    findManyTransactions.mockResolvedValueOnce([
      transaction({
        id: "tx-lunch",
        tipo: TransactionType.GASTO,
        descripcion: "Almuerzo",
        fecha: new Date("2026-07-05T12:00:00.000Z"),
        accountId: "account-demo-primary",
        categoryId: "category-food",
        account: account({ id: "account-demo-primary", nombre: "Cuenta Demo Principal" }),
        category: category({ id: "category-food", nombre: "Delivery", tipo: CategoryType.GASTO }),
      }),
      transaction({
        id: "tx-salary",
        tipo: TransactionType.INGRESO,
        descripcion: "Sueldo",
        monto: 850_000,
        fecha: new Date("2026-07-01T08:00:00.000Z"),
        accountId: "account-demo-primary",
        categoryId: "category-salary",
        account: account({ id: "account-demo-primary", nombre: "Cuenta Demo Principal" }),
        category: category({ id: "category-salary", nombre: "Sueldo", tipo: CategoryType.INGRESO }),
      }),
    ]);

    const result = await getMovements("user-demo", { month: "2026-07" }, { today: new Date("2026-07-05T00:00:00.000Z") });

    expect(result.currentMonth).toBe("2026-07");
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toMatchObject({
      label: "HOY",
      date: "2026-07-05",
      movements: [{ id: "tx-lunch", tipo: "GASTO", descripcion: "Almuerzo" }],
    });
    expect(result.groups[1]).toMatchObject({
      label: "01 JUL",
      date: "2026-07-01",
      movements: [{ id: "tx-salary", tipo: "INGRESO", descripcion: "Sueldo" }],
    });
    expect(findManyTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-demo", fecha: { gte: new Date("2026-07-01T00:00:00.000Z"), lt: new Date("2026-08-01T00:00:00.000Z") } },
      }),
    );
    expect(findManyAccounts).toHaveBeenCalledWith(expect.objectContaining({ where: { activa: true, userId: "user-demo" } }));
    expect(findManyCategories).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-demo" } }));
  });

  it("fuses transfer pairs with the same transferId into one movement", async () => {
    mockFilters();
    findManyTransactions.mockResolvedValueOnce([
      transaction({
        id: "tx-transfer-out",
        tipo: TransactionType.GASTO,
        descripcion: "Transferencia",
        monto: 50_000,
        transferId: "transfer-1",
        accountId: "account-demo-primary",
        account: account({ id: "account-demo-primary", nombre: "Cuenta Demo Principal" }),
        categoryId: null,
        category: null,
      }),
      transaction({
        id: "tx-transfer-in",
        tipo: TransactionType.INGRESO,
        descripcion: "Transferencia",
        monto: 50_000,
        transferId: "transfer-1",
        accountId: "account-demo-wallet",
        account: account({ id: "account-demo-wallet", nombre: "Billetera Demo" }),
        categoryId: null,
        category: null,
      }),
    ]);

    const result = await getMovements("user-demo", { month: "2026-07" });

    expect(result.groups[0]?.movements).toEqual([
      expect.objectContaining({
        id: "transfer-1",
        transferId: "transfer-1",
        tipo: "TRANSFERENCIA",
        monto: 50_000,
        fromAccount: { id: "account-demo-primary", nombre: "Cuenta Demo Principal" },
        toAccount: { id: "account-demo-wallet", nombre: "Billetera Demo" },
      }),
    ]);
  });

  it("includes a transfer in the account filter when either side matches", async () => {
    mockFilters();
    findManyTransactions.mockResolvedValueOnce([
      transaction({
        id: "tx-transfer-out",
        tipo: TransactionType.GASTO,
        transferId: "transfer-1",
        accountId: "account-demo-primary",
        account: account({ id: "account-demo-primary", nombre: "Cuenta Demo Principal" }),
        categoryId: null,
        category: null,
      }),
      transaction({
        id: "tx-transfer-in",
        tipo: TransactionType.INGRESO,
        transferId: "transfer-1",
        accountId: "account-demo-wallet",
        account: account({ id: "account-demo-wallet", nombre: "Billetera Demo" }),
        categoryId: null,
        category: null,
      }),
    ]);

    const result = await getMovements("user-demo", { month: "2026-07", accountId: "account-demo-wallet" });

    expect(result.groups[0]?.movements[0]).toMatchObject({ tipo: "TRANSFERENCIA", toAccount: { id: "account-demo-wallet" } });
  });

  it("excludes transfers when category filter is active and filters normal movements", async () => {
    mockFilters();
    findManyTransactions.mockResolvedValueOnce([
      transaction({
        id: "tx-food",
        tipo: TransactionType.GASTO,
        accountId: "account-demo-primary",
        categoryId: "category-food",
        account: account({ id: "account-demo-primary", nombre: "Cuenta Demo Principal" }),
        category: category({ id: "category-food", nombre: "Delivery", tipo: CategoryType.GASTO }),
      }),
      transaction({
        id: "tx-car",
        tipo: TransactionType.GASTO,
        accountId: "account-demo-primary",
        categoryId: "category-car",
        account: account({ id: "account-demo-primary", nombre: "Cuenta Demo Principal" }),
        category: category({ id: "category-car", nombre: "Auto", tipo: CategoryType.GASTO }),
      }),
      transaction({
        id: "tx-transfer-out",
        tipo: TransactionType.GASTO,
        transferId: "transfer-1",
        accountId: "account-demo-primary",
        account: account({ id: "account-demo-primary", nombre: "Cuenta Demo Principal" }),
        categoryId: null,
        category: null,
      }),
      transaction({
        id: "tx-transfer-in",
        tipo: TransactionType.INGRESO,
        transferId: "transfer-1",
        accountId: "account-demo-wallet",
        account: account({ id: "account-demo-wallet", nombre: "Billetera Demo" }),
        categoryId: null,
        category: null,
      }),
    ]);

    const result = await getMovements("user-demo", { month: "2026-07", categoryId: "category-food" });

    expect(result.groups[0]?.movements).toEqual([expect.objectContaining({ id: "tx-food", tipo: "GASTO" })]);
  });

  it("rejects invalid month values", async () => {
    await expect(getMovements("user-demo", { month: "2026-13" })).rejects.toThrow(MovementValidationError);
    expect(findManyTransactions).not.toHaveBeenCalled();
  });

  it("filters movement reads and filter options by the current user", async () => {
    mockFilters();
    findManyTransactions.mockResolvedValueOnce([]);

    await getMovements("user-owner", { month: "2026-07" });

    expect(findManyAccounts).toHaveBeenCalledWith(expect.objectContaining({ where: { activa: true, userId: "user-owner" } }));
    expect(findManyCategories).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-owner" } }));
    expect(findManyTransactions).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-owner" }),
    }));
  });
});

function mockFilters() {
  findManyAccounts.mockResolvedValue([account({ id: "account-demo-primary", nombre: "Cuenta Demo Principal" })]);
  findManyCategories.mockResolvedValue([category({ id: "category-food", nombre: "Delivery", tipo: CategoryType.GASTO })]);
}

function account(overrides: Pick<Account, "id" | "nombre">): Pick<Account, "id" | "nombre"> {
  return overrides;
}

function category(overrides: Pick<Category, "id" | "nombre" | "tipo">): Pick<Category, "id" | "nombre" | "icono" | "tipo"> {
  return { ...overrides, icono: "tag" };
}

function transaction(
  overrides: Partial<Transaction> & {
    id: string;
    account: Pick<Account, "id" | "nombre">;
    category: Pick<Category, "id" | "nombre" | "icono" | "tipo"> | null;
  },
) {
  return {
    tipo: TransactionType.GASTO,
    monto: 1_000,
    descripcion: "Movimiento",
    fecha: new Date("2026-07-05T12:00:00.000Z"),
    notas: null,
    accountId: "account-demo-primary",
    categoryId: "category-food",
    transferId: null,
    createdAt: new Date("2026-07-05T12:00:00.000Z"),
    updatedAt: new Date("2026-07-05T12:00:00.000Z"),
    ...overrides,
  };
}
