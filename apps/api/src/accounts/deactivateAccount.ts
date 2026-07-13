import type { Account } from "@prisma/client";
import { prisma } from "../prisma.js";

const accountWriter = prisma as unknown as {
  account: {
    updateMany(args: { where: { id: string; userId: string }; data: { activa: boolean } }): Promise<{ count: number }>;
    findFirstOrThrow(args: { where: { id: string; userId: string } }): Promise<Account>;
  };
};

export class AccountDeactivateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeactivateNotFoundError";
  }
}

export async function deactivateAccount(id: string, userId: string) {
  const updatedAccount = await accountWriter.account.updateMany({
    where: { id, userId },
    data: { activa: false },
  });

  if (updatedAccount.count === 0) {
    throw new AccountDeactivateNotFoundError("Account not found.");
  }

  try {
    return await accountWriter.account.findFirstOrThrow({ where: { id, userId } });
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
