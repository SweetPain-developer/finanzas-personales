import { GoalStatus } from "@prisma/client";
import type { GoalStatusUpdateDTO } from "@finanzas-personales/shared-types";

import { prisma } from "../prisma.js";
import { goalListSelect, type GoalListItem, toGoalListItem } from "./getGoals.js";

const goalPrisma = prisma as any;

export class GoalStatusNotFoundError extends Error {}

export async function updateGoalStatus(id: string, data: GoalStatusUpdateDTO, userId: string): Promise<GoalListItem> {
  const updatedGoal = await goalPrisma.goal.updateMany({ where: { id, userId }, data: { estado: data.status as GoalStatus } });

  if (updatedGoal.count === 0) {
    throw new GoalStatusNotFoundError("Meta no encontrada.");
  }

  const goal = await goalPrisma.goal.findFirstOrThrow({ where: { id, userId }, select: goalListSelect });
  return toGoalListItem(goal);
}
