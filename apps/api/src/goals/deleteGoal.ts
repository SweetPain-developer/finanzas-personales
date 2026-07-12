import { prisma } from "../prisma.js";

export class GoalDeleteNotFoundError extends Error {
  constructor(message = "Meta no encontrada.") {
    super(message);
    this.name = "GoalDeleteNotFoundError";
  }
}

export async function deleteGoal(id: string): Promise<void> {
  try {
    await prisma.goal.delete({
      where: { id },
      select: { id: true },
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2025")) {
      throw new GoalDeleteNotFoundError();
    }

    throw error;
  }
}

function hasPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
