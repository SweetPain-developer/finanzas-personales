import { GoalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { GoalStatusNotFoundError, updateGoalStatus } from "./updateGoalStatus.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    goal: { findFirstOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

const updateGoalRecord = prisma.goal.update as Mock;
const updateManyGoal = prisma.goal.updateMany as Mock;
const findFirstOrThrowGoal = prisma.goal.findFirstOrThrow as Mock;

describe("updateGoalStatus", () => {
  beforeEach(() => {
    updateGoalRecord.mockReset();
    updateManyGoal.mockReset();
    findFirstOrThrowGoal.mockReset();
  });

  it.each([GoalStatus.ACTIVA, GoalStatus.PAUSADA, GoalStatus.COMPLETADA])("updates a goal status to %s and returns derived progress", async (status) => {
    updateManyGoal.mockResolvedValueOnce({ count: 1 });
    findFirstOrThrowGoal.mockResolvedValueOnce(goalRecord({ estado: status }));

    const result = await updateGoalStatus("goal-vacations", { status }, "user-demo");

    expect(updateManyGoal).toHaveBeenCalledWith({
      where: { id: "goal-vacations", userId: "user-demo" },
      data: { estado: status },
    });
    expect(result.estado).toBe(status);
    expect(result.progressPercent).toBe(45);
  });

  it("does not expose account balance or transaction mutations", async () => {
    updateManyGoal.mockResolvedValueOnce({ count: 1 });
    findFirstOrThrowGoal.mockResolvedValueOnce(goalRecord({ estado: GoalStatus.PAUSADA }));

    await updateGoalStatus("goal-vacations", { status: GoalStatus.PAUSADA }, "user-demo");

    expect((prisma as unknown as { account?: { update?: Mock } }).account?.update).toBeUndefined();
    expect((prisma as unknown as { transaction?: { create?: Mock; update?: Mock; delete?: Mock } }).transaction?.create).toBeUndefined();
    expect((prisma as unknown as { transaction?: { create?: Mock; update?: Mock; delete?: Mock } }).transaction?.update).toBeUndefined();
    expect((prisma as unknown as { transaction?: { create?: Mock; update?: Mock; delete?: Mock } }).transaction?.delete).toBeUndefined();
  });

  it("returns a not-found error when the goal does not exist", async () => {
    updateManyGoal.mockResolvedValueOnce({ count: 0 });

    await expect(updateGoalStatus("missing", { status: GoalStatus.PAUSADA }, "user-demo")).rejects.toThrow(GoalStatusNotFoundError);
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
    nombre: "Vacaciones",
    montoObjetivo: 500_000,
    estado: GoalStatus.ACTIVA,
    notas: null,
    account: { id: "account-demo-wallet", nombre: "Billetera Demo", saldo: 225_000 },
    ...overrides,
  };
}
