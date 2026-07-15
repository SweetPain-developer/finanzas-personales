import { GoalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { calculateProgressPercent, getGoals } from "./getGoals.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    goal: { findMany: vi.fn() },
  },
}));

const findManyGoals = prisma.goal.findMany as Mock;

describe("getGoals", () => {
  beforeEach(() => {
    findManyGoals.mockReset();
  });

  it("groups goals by status and derives progress from account saldo", async () => {
    findManyGoals.mockResolvedValueOnce([
      goal({ id: "goal-paused", nombre: "Auto", estado: GoalStatus.PAUSADA, montoObjetivo: 1_000_000, account: account({ saldo: 250_000 }) }),
      goal({ id: "goal-active", nombre: "Vacaciones", estado: GoalStatus.ACTIVA, montoObjetivo: 500_000, account: account({ saldo: 225_000 }) }),
      goal({ id: "goal-complete", nombre: "Notebook", estado: GoalStatus.COMPLETADA, montoObjetivo: 700_000, account: account({ saldo: 750_000 }) }),
    ]);

    const result = await getGoals("user-demo");

    expect(result.groups).toEqual([
      {
        status: "ACTIVA",
        label: "Activas",
        goals: [
          {
            id: "goal-active",
            nombre: "Vacaciones",
            montoObjetivo: 500_000,
            estado: "ACTIVA",
            notas: null,
            account: { id: "account", nombre: "Billetera Demo", saldo: 225_000 },
            progressPercent: 45,
          },
        ],
      },
      {
        status: "PAUSADA",
        label: "Pausadas",
        goals: [
          expect.objectContaining({ id: "goal-paused", progressPercent: 25 }),
        ],
      },
      {
        status: "COMPLETADA",
        label: "Completadas",
        goals: [
          expect.objectContaining({ id: "goal-complete", progressPercent: 100 }),
        ],
      },
    ]);
  });

  it("returns groups in status order while preserving ordered goals within each status", async () => {
    findManyGoals.mockResolvedValueOnce([
      goal({ id: "goal-active-a", nombre: "Ahorro", estado: GoalStatus.ACTIVA }),
      goal({ id: "goal-paused-a", nombre: "Auto", estado: GoalStatus.PAUSADA }),
      goal({ id: "goal-active-b", nombre: "Emergencia", estado: GoalStatus.ACTIVA }),
      goal({ id: "goal-paused-b", nombre: "Hogar", estado: GoalStatus.PAUSADA }),
      goal({ id: "goal-complete-a", nombre: "Notebook", estado: GoalStatus.COMPLETADA }),
      goal({ id: "goal-complete-b", nombre: "Viaje", estado: GoalStatus.COMPLETADA }),
    ]);

    const result = await getGoals("user-demo");

    expect(result.groups.map((group) => group.status)).toEqual(["ACTIVA", "PAUSADA", "COMPLETADA"]);
    expect(result.groups.map((group) => group.goals.map((goal) => goal.id))).toEqual([
      ["goal-active-a", "goal-active-b"],
      ["goal-paused-a", "goal-paused-b"],
      ["goal-complete-a", "goal-complete-b"],
    ]);
  });

  it("returns all status groups when there are no goals", async () => {
    findManyGoals.mockResolvedValueOnce([]);

    const result = await getGoals("user-demo");

    expect(result.groups).toEqual([
      { status: "ACTIVA", label: "Activas", goals: [] },
      { status: "PAUSADA", label: "Pausadas", goals: [] },
      { status: "COMPLETADA", label: "Completadas", goals: [] },
    ]);
  });

  it("handles non-positive target amounts safely", () => {
    expect(calculateProgressPercent(100_000, 0)).toBe(0);
    expect(calculateProgressPercent(100_000, -50_000)).toBe(0);
  });
});

function goal(
  overrides: Partial<{
    id: string;
    nombre: string;
    montoObjetivo: number;
    estado: GoalStatus;
    notas: string | null;
    account: { id: string; nombre: string; saldo: number };
  }>,
) {
  return {
    id: "goal",
    nombre: "Meta",
    montoObjetivo: 100_000,
    estado: GoalStatus.ACTIVA,
    notas: null,
    account: account({}),
    ...overrides,
  };
}

function account(overrides: Partial<{ id: string; nombre: string; saldo: number }>) {
  return { id: "account", nombre: "Billetera Demo", saldo: 0, ...overrides };
}
