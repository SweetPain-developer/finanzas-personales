import { AccountType, GoalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { GoalValidationError } from "./createGoal.js";
import { GoalNotFoundError, updateGoal } from "./updateGoal.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    goal: { findUnique: vi.fn(), findFirstOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

const findUniqueGoal = prisma.goal.findUnique as Mock;
const updateGoalRecord = prisma.goal.update as Mock;
const updateManyGoal = prisma.goal.updateMany as Mock;
const findFirstOrThrowGoal = prisma.goal.findFirstOrThrow as Mock;
const findUniqueAccount = prisma.account.findUnique as Mock;

describe("updateGoal", () => {
  beforeEach(() => {
    findUniqueGoal.mockReset();
    updateGoalRecord.mockReset();
    updateManyGoal.mockReset();
    findFirstOrThrowGoal.mockReset();
    findUniqueAccount.mockReset();
  });

  it("updates goal attributes and keeps progress derived from the account balance", async () => {
    findUniqueGoal.mockResolvedValueOnce({ id: "goal-vacations" });
    findUniqueAccount.mockResolvedValueOnce({ activa: true, tipo: AccountType.RESERVA });
    updateManyGoal.mockResolvedValueOnce({ count: 1 });
    findFirstOrThrowGoal.mockResolvedValueOnce(goalRecord({ montoObjetivo: 750_000, account: { id: "account-reserve", nombre: "Reserva", saldo: 375_000 } }));

    const result = await updateGoal("goal-vacations", { name: "Vacaciones 2027", targetAmount: 750_000, accountId: "account-reserve", notes: null }, "user-demo");

    expect(updateManyGoal).toHaveBeenCalledWith({
      where: { id: "goal-vacations", userId: "user-demo" },
      data: {
        nombre: "Vacaciones 2027",
        montoObjetivo: 750_000,
        notas: null,
        accountId: "account-reserve",
      },
    });
    expect(result.progressPercent).toBe(50);
  });

  it("preserves existing notes when notes are omitted", async () => {
    findUniqueGoal.mockResolvedValueOnce({ id: "goal-vacations" });
    findUniqueAccount.mockResolvedValueOnce({ activa: true, tipo: AccountType.RESERVA });
    updateManyGoal.mockResolvedValueOnce({ count: 1 });
    findFirstOrThrowGoal.mockResolvedValueOnce(goalRecord({ notas: "Viaje demo" }));

    await updateGoal("goal-vacations", { name: "Vacaciones 2027", targetAmount: 750_000, accountId: "account-reserve" }, "user-demo");

    expect(updateManyGoal).toHaveBeenCalledWith({
      where: { id: "goal-vacations", userId: "user-demo" },
      data: {
        nombre: "Vacaciones 2027",
        montoObjetivo: 750_000,
        accountId: "account-reserve",
      },
    });
  });

  it.each([{ notes: "" }, { notes: null }])("clears notes when notes are explicit $notes", async ({ notes }) => {
    findUniqueGoal.mockResolvedValueOnce({ id: "goal-vacations" });
    findUniqueAccount.mockResolvedValueOnce({ activa: true, tipo: AccountType.RESERVA });
    updateManyGoal.mockResolvedValueOnce({ count: 1 });
    findFirstOrThrowGoal.mockResolvedValueOnce(goalRecord({ notas: null }));

    await updateGoal("goal-vacations", { name: "Vacaciones 2027", targetAmount: 750_000, accountId: "account-reserve", notes }, "user-demo");

    expect(updateManyGoal).toHaveBeenCalledWith({
      where: { id: "goal-vacations", userId: "user-demo" },
      data: {
        nombre: "Vacaciones 2027",
        montoObjetivo: 750_000,
        notas: null,
        accountId: "account-reserve",
      },
    });
  });

  it("returns a not-found error before validating account association", async () => {
    findUniqueGoal.mockResolvedValueOnce(null);

    await expect(updateGoal("missing", { name: "Auto", targetAmount: 1_000_000, accountId: "account", notes: null }, "user-demo")).rejects.toThrow(GoalNotFoundError);
    expect(findUniqueAccount).not.toHaveBeenCalled();
    expect(updateManyGoal).not.toHaveBeenCalled();
  });

  it("rejects invalid associated accounts", async () => {
    findUniqueGoal.mockResolvedValueOnce({ id: "goal-vacations" });
    findUniqueAccount.mockResolvedValueOnce({ activa: true, tipo: AccountType.OPERATIVA });

    await expect(updateGoal("goal-vacations", { name: "Auto", targetAmount: 1_000_000, accountId: "operative", notes: null }, "user-demo")).rejects.toThrow(GoalValidationError);
    expect(updateGoalRecord).not.toHaveBeenCalled();
  });
});

type GoalRecord = {
  id: string;
  nombre: string;
  montoObjetivo: number;
  estado: GoalStatus;
  notas: string | null;
  account: { id: string; nombre: string; saldo: number };
};

function goalRecord(overrides: Partial<GoalRecord>): GoalRecord {
  return {
    id: "goal-vacations",
    nombre: "Vacaciones 2027",
    montoObjetivo: 500_000,
    estado: GoalStatus.ACTIVA,
    notas: null,
    account: { id: "account-demo-wallet", nombre: "Billetera Demo", saldo: 225_000 },
    ...overrides,
  };
}
