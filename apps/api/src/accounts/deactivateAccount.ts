import { prisma } from "../prisma.js";

export class AccountDeactivateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeactivateNotFoundError";
  }
}

export async function deactivateAccount(id: string) {
  const updatedAccount = await prisma.account.updateMany({
    where: { id },
    data: { activa: false },
  });

  if (updatedAccount.count === 0) {
    throw new AccountDeactivateNotFoundError("Account not found.");
  }

  try {
    return await prisma.account.findUniqueOrThrow({ where: { id } });
  } catch (error) {
    if (hasPrismaCode(error, "P2025")) {
      throw new AccountDeactivateNotFoundError("Account not found.");
    }

    throw error;
  }
}

function hasPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
