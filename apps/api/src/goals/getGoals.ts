import { GoalStatus, type Account, type Goal } from "@prisma/client";

import { prisma } from "../prisma.js";

export type GoalAccount = Pick<Account, "id" | "nombre" | "saldo">;

export type GoalListItem = Pick<Goal, "id" | "nombre" | "montoObjetivo" | "estado" | "notas"> & {
  account: GoalAccount;
  progressPercent: number;
};

export type GoalGroup = {
  status: GoalStatus;
  label: string;
  goals: GoalListItem[];
};

export type GoalsData = {
  groups: GoalGroup[];
};

const GOAL_STATUS_ORDER = [GoalStatus.ACTIVA, GoalStatus.PAUSADA, GoalStatus.COMPLETADA] as const;

const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  [GoalStatus.ACTIVA]: "Activas",
  [GoalStatus.PAUSADA]: "Pausadas",
  [GoalStatus.COMPLETADA]: "Completadas",
};

type GoalWithAccount = Pick<Goal, "id" | "nombre" | "montoObjetivo" | "estado" | "notas"> & {
  account: GoalAccount;
};

export async function getGoals(): Promise<GoalsData> {
  const goals = await prisma.goal.findMany({
    select: goalListSelect,
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
  });

  return {
    groups: GOAL_STATUS_ORDER.map((status) => ({
      status,
      label: GOAL_STATUS_LABELS[status],
      goals: goals.filter((goal) => goal.estado === status).map(toGoalListItem),
    })),
  };
}

export function toGoalListItem(goal: GoalWithAccount): GoalListItem {
  return {
    id: goal.id,
    nombre: goal.nombre,
    montoObjetivo: goal.montoObjetivo,
    estado: goal.estado,
    notas: goal.notas,
    account: goal.account,
    progressPercent: calculateProgressPercent(goal.account.saldo, goal.montoObjetivo),
  };
}

export function calculateProgressPercent(accountBalance: number, targetAmount: number) {
  if (targetAmount <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((accountBalance / targetAmount) * 100)));
}

export const goalListSelect = {
  id: true,
  nombre: true,
  montoObjetivo: true,
  estado: true,
  notas: true,
  account: { select: { id: true, nombre: true, saldo: true } },
} as const;
