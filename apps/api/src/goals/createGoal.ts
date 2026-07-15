import { AccountType, GoalStatus } from "@prisma/client";
import type { GoalMutationDTO } from "@finanzas-personales/shared-types";

import { prisma } from "../prisma.js";
import { goalListSelect, type GoalListItem, toGoalListItem } from "./getGoals.js";

const goalPrisma = prisma as any;

const ALLOWED_GOAL_ACCOUNT_TYPES = [AccountType.AHORRO, AccountType.RESERVA] as const;

export class GoalValidationError extends Error {}

export async function createGoal(data: GoalMutationDTO, userId: string): Promise<GoalListItem> {
  await validateGoalAccount(data.accountId, userId);

  const goal = await goalPrisma.goal.create({
    data: {
      nombre: data.name,
      montoObjetivo: data.targetAmount,
      estado: GoalStatus.ACTIVA,
      notas: data.notes?.trim() || null,
      accountId: data.accountId,
      userId,
    },
    select: goalListSelect,
  });

  return toGoalListItem(goal);
}

export async function validateGoalAccount(accountId: string, userId: string) {
  const account = await (goalPrisma.account.findFirst ?? goalPrisma.account.findUnique)({
    where: { id: accountId, userId },
    select: { activa: true, tipo: true },
  });

  if (!account) {
    throw new GoalValidationError("La cuenta asociada no existe.");
  }

  if (!account.activa) {
    throw new GoalValidationError("La cuenta asociada debe estar activa.");
  }

  if (!ALLOWED_GOAL_ACCOUNT_TYPES.includes(account.tipo as (typeof ALLOWED_GOAL_ACCOUNT_TYPES)[number])) {
    throw new GoalValidationError("La cuenta asociada debe ser de tipo ahorro o reserva.");
  }
}
