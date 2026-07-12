import { GoalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { GoalStatusNotFoundError, updateGoalStatus } from "./updateGoalStatus.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    goal: { update: vi.fn() },
  },
}));

const updateGoalRecord = prisma.goal.update as Mock;

describe("updateGoalStatus", () => {
  beforeEach(() => {
    updateGoalRecord.mockReset();
  });

  it.each([GoalStatus.ACTIVA, GoalStatus.PAUSADA, GoalStatus.COMPLETADA])("updates a goal status to %s and returns derived progress", async (status) => {
    updateGoalRecord.mockResolvedValueOnce(goalRecord({ estado: status }));

    const result = await updateGoalStatus("goal-vacations", { status });

    expect(updateGoalRecord).toHaveBeenCalledWith({
      where: { id: "goal-vacations" },
      data: { estado: status },
      select: expect.any(Object),
    });
    expect(result.estado).toBe(status);
    expect(result.progressPercent).toBe(45);
  });

  it("does not expose account balance or transaction mutations", async () => {
    updateGoalRecord.mockResolvedValueOnce(goalRecord({ estado: GoalStatus.PAUSADA }));

    await updateGoalStatus("goal-vacations", { status: GoalStatus.PAUSADA });

    expect((prisma as unknown as { account?: { update?: Mock } }).account?.update).toBeUndefined();
    expect((prisma as unknown as { transaction?: { create?: Mock; update?: Mock; delete?: Mock } }).transaction?.create).toBeUndefined();
    expect((prisma as unknown as { transaction?: { create?: Mock; update?: Mock; delete?: Mock } }).transaction?.update).toBeUndefined();
    expect((prisma as unknown as { transaction?: { create?: Mock; update?: Mock; delete?: Mock } }).transaction?.delete).toBeUndefined();
  });

  it("returns a not-found error when the goal does not exist", async () => {
    updateGoalRecord.mockRejectedValueOnce({ code: "P2025" });

    await expect(updateGoalStatus("missing", { status: GoalStatus.PAUSADA })).rejects.toThrow(GoalStatusNotFoundError);
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
