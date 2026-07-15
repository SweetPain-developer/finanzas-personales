import { prisma } from "../prisma.js";

const goalPrisma = prisma as any;

export class GoalDeleteNotFoundError extends Error {
  constructor(message = "Meta no encontrada.") {
    super(message);
    this.name = "GoalDeleteNotFoundError";
  }
}

export async function deleteGoal(id: string, userId: string): Promise<void> {
  const deletedGoal = await goalPrisma.goal.deleteMany({ where: { id, userId } });

  if (deletedGoal.count === 0) {
    throw new GoalDeleteNotFoundError();
  }
}
