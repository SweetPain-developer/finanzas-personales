import { GoalStatus } from "@prisma/client";
import type { GoalStatusUpdateDTO } from "@finanzas-personales/shared-types";

import { prisma } from "../prisma.js";
import { goalListSelect, type GoalListItem, toGoalListItem } from "./getGoals.js";

export class GoalStatusNotFoundError extends Error {}

export async function updateGoalStatus(id: string, data: GoalStatusUpdateDTO): Promise<GoalListItem> {
  const goal = await prisma.goal.update({
    where: { id },
    data: { estado: data.status as GoalStatus },
    select: goalListSelect,
  }).catch((error: unknown) => {
    if (isPrismaNotFoundError(error)) {
      throw new GoalStatusNotFoundError("Meta no encontrada.");
    }

    throw error;
  });

  return toGoalListItem(goal);
}

function isPrismaNotFoundError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}
