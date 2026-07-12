import type { GoalMutationDTO } from "@finanzas-personales/shared-types";

import { prisma } from "../prisma.js";
import { goalListSelect, type GoalListItem, toGoalListItem } from "./getGoals.js";
import { validateGoalAccount } from "./createGoal.js";

export class GoalNotFoundError extends Error {}

export async function updateGoal(id: string, data: GoalMutationDTO): Promise<GoalListItem> {
  const existingGoal = await prisma.goal.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingGoal) {
    throw new GoalNotFoundError("Meta no encontrada.");
  }

  await validateGoalAccount(data.accountId);

  const goal = await prisma.goal.update({
    where: { id },
    data: {
      nombre: data.name,
      montoObjetivo: data.targetAmount,
      ...(Object.prototype.hasOwnProperty.call(data, "notes") ? { notas: data.notes?.trim() || null } : {}),
      accountId: data.accountId,
    },
    select: goalListSelect,
  });

  return toGoalListItem(goal);
}
