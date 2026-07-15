import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { deleteGoal, GoalDeleteNotFoundError } from "./deleteGoal.js";

const goalDeletionStore = vi.hoisted(() => {
  type AccountRecord = { id: string; saldo: number };
   type GoalRecord = { id: string; accountId: string; nombre: string; montoObjetivo: number; userId?: string };
  type TransactionRecord = { id: string; accountId: string; monto: number; descripcion: string };

  const accounts = new Map<string, AccountRecord>();
  const goals = new Map<string, GoalRecord>();
  const transactions = new Map<string, TransactionRecord>();

  return {
    accounts,
    goals,
    transactions,
    reset() {
      accounts.clear();
      goals.clear();
      transactions.clear();
    },
  };
});

vi.mock("../prisma.js", () => ({
  prisma: {
    account: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => goalDeletionStore.accounts.get(where.id) ?? null),
    },
    goal: {
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const goal = goalDeletionStore.goals.get(where.id);

        if (!goal) {
          throw { code: "P2025" };
        }

        goalDeletionStore.goals.delete(where.id);

        return { id: goal.id };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
        const goal = goalDeletionStore.goals.get(where.id);
        if (!goal || (goal.userId ?? "user-demo") !== where.userId) return { count: 0 };
        goalDeletionStore.goals.delete(where.id);
        return { count: 1 };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => goalDeletionStore.goals.get(where.id) ?? null),
    },
    transaction: {
      findMany: vi.fn(async ({ where }: { where: { accountId: string } }) => Array.from(goalDeletionStore.transactions.values()).filter((transaction) => transaction.accountId === where.accountId)),
    },
  },
}));

const deleteGoalRecord = prisma.goal.delete as Mock;
const deleteManyGoalRecord = prisma.goal.deleteMany as Mock;
const findGoalRecord = prisma.goal.findUnique as Mock;
const findAccountRecord = prisma.account.findUnique as Mock;
const findTransactions = prisma.transaction.findMany as Mock;

describe("deleteGoal", () => {
  beforeEach(() => {
    goalDeletionStore.reset();
    deleteGoalRecord.mockClear();
    deleteManyGoalRecord.mockClear();
    findGoalRecord.mockClear();
    findAccountRecord.mockClear();
    findTransactions.mockClear();
  });

  it("hard deletes a goal without mutating the associated account balance", async () => {
    goalDeletionStore.goals.set("goal-vacations", {
      id: "goal-vacations",
      accountId: "account-vacations",
      nombre: "Vacations",
      montoObjetivo: 1_000_000,
    });

    await deleteGoal("goal-vacations", "user-demo");

    expect(deleteManyGoalRecord).toHaveBeenCalledWith({
      where: { id: "goal-vacations", userId: "user-demo" },
    });
    expect((prisma.account as unknown as { update?: Mock }).update).toBeUndefined();
  });

  it("removes only the goal while keeping account balance and transactions unchanged", async () => {
    goalDeletionStore.accounts.set("account-reserve", { id: "account-reserve", saldo: 250_000 });
    goalDeletionStore.goals.set("goal-emergency-fund", {
      id: "goal-emergency-fund",
      accountId: "account-reserve",
      nombre: "Emergency fund",
      montoObjetivo: 500_000,
    });
    goalDeletionStore.transactions.set("tx-income", {
      id: "tx-income",
      accountId: "account-reserve",
      monto: 300_000,
      descripcion: "Initial deposit",
    });
    goalDeletionStore.transactions.set("tx-expense", {
      id: "tx-expense",
      accountId: "account-reserve",
      monto: 50_000,
      descripcion: "Planned expense",
    });

    const accountBefore = await prisma.account.findUnique({ where: { id: "account-reserve" } });
    const transactionsBefore = await prisma.transaction.findMany({ where: { accountId: "account-reserve" } });

    await deleteGoal("goal-emergency-fund", "user-demo");

    await expect(prisma.goal.findUnique({ where: { id: "goal-emergency-fund" } })).resolves.toBeNull();
    await expect(prisma.account.findUnique({ where: { id: "account-reserve" } })).resolves.toEqual(accountBefore);
    await expect(prisma.transaction.findMany({ where: { accountId: "account-reserve" } })).resolves.toEqual(transactionsBefore);
  });

  it("returns a not-found error when the goal does not exist", async () => {
    await expect(deleteGoal("missing", "user-demo")).rejects.toThrow(GoalDeleteNotFoundError);
  });

  it("does not delete a goal owned by another user", async () => {
    goalDeletionStore.goals.set("goal-other-user", {
      id: "goal-other-user",
      accountId: "account-other-user",
      nombre: "Other user's goal",
      montoObjetivo: 100_000,
      userId: "user-other",
    });

    await expect(deleteGoal("goal-other-user", "user-demo")).rejects.toThrow(GoalDeleteNotFoundError);
    expect(goalDeletionStore.goals.has("goal-other-user")).toBe(true);
  });
});
