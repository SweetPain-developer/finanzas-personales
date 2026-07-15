import type { GoalMutationDTO } from "@finanzas-personales/shared-types";

import { prisma } from "../prisma.js";
import { goalListSelect, type GoalListItem, toGoalListItem } from "./getGoals.js";
import { validateGoalAccount } from "./createGoal.js";

const goalPrisma = prisma as any;

export class GoalNotFoundError extends Error {}

export async function updateGoal(id: string, data: GoalMutationDTO, userId: string): Promise<GoalListItem> {
  const existingGoal = await (goalPrisma.goal.findFirst ?? goalPrisma.goal.findUnique)({
    where: { id, userId },
    select: { id: true },
  });

  if (!existingGoal) {
    throw new GoalNotFoundError("Meta no encontrada.");
  }

  await validateGoalAccount(data.accountId, userId);

  const updatedGoal = await goalPrisma.goal.updateMany({
    where: { id, userId },
    data: {
      nombre: data.name,
      montoObjetivo: data.targetAmount,
      ...(Object.prototype.hasOwnProperty.call(data, "notes") ? { notas: data.notes?.trim() || null } : {}),
      accountId: data.accountId,
    },
  });

  if (updatedGoal.count === 0) {
    throw new GoalNotFoundError("Meta no encontrada.");
  }

  const goal = await (goalPrisma.goal.findFirstOrThrow ?? goalPrisma.goal.findUniqueOrThrow)({ where: { id, userId }, select: goalListSelect });

  return toGoalListItem(goal);
}
