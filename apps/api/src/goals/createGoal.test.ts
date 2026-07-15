import { AccountType, GoalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { createGoal, GoalValidationError } from "./createGoal.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    goal: { create: vi.fn() },
  },
}));

const findUniqueAccount = prisma.account.findUnique as Mock;
const createGoalRecord = prisma.goal.create as Mock;

describe("createGoal", () => {
  beforeEach(() => {
    findUniqueAccount.mockReset();
    createGoalRecord.mockReset();
  });

  it("creates a goal for an active savings account without mutating account balances", async () => {
    findUniqueAccount.mockResolvedValueOnce({ activa: true, tipo: AccountType.AHORRO });
    createGoalRecord.mockResolvedValueOnce(goalRecord({}));

    const result = await createGoal({ name: "Vacaciones", targetAmount: 500_000, accountId: "account-demo-wallet", notes: "Viaje" }, "user-demo");

    expect(createGoalRecord).toHaveBeenCalledWith({
      data: {
        nombre: "Vacaciones",
        montoObjetivo: 500_000,
        estado: GoalStatus.ACTIVA,
        notas: "Viaje",
        accountId: "account-demo-wallet",
        userId: "user-demo",
      },
      select: expect.any(Object),
    });
    expect(result.progressPercent).toBe(45);
    expect((prisma.account as unknown as { update?: Mock }).update).toBeUndefined();
  });

  it("rejects missing, inactive, and non-savings goal accounts", async () => {
    findUniqueAccount.mockResolvedValueOnce(null);
    await expect(createGoal({ name: "Auto", targetAmount: 1_000_000, accountId: "missing", notes: null }, "user-demo")).rejects.toThrow(GoalValidationError);

    findUniqueAccount.mockResolvedValueOnce({ activa: false, tipo: AccountType.AHORRO });
    await expect(createGoal({ name: "Auto", targetAmount: 1_000_000, accountId: "inactive", notes: null }, "user-demo")).rejects.toThrow("La cuenta asociada debe estar activa.");

    findUniqueAccount.mockResolvedValueOnce({ activa: true, tipo: AccountType.OPERATIVA });
    await expect(createGoal({ name: "Auto", targetAmount: 1_000_000, accountId: "operative", notes: null }, "user-demo")).rejects.toThrow("La cuenta asociada debe ser de tipo ahorro o reserva.");
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
    notas: "Viaje",
    account: { id: "account-demo-wallet", nombre: "Billetera Demo", saldo: 225_000 },
    ...overrides,
  };
}
