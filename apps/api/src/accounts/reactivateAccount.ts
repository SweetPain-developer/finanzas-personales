import type { Account } from "@prisma/client";
import { prisma } from "../prisma.js";

const accountWriter = prisma as unknown as {
  account: {
    updateMany(args: { where: { id: string; userId: string }; data: { activa: boolean } }): Promise<{ count: number }>;
    findFirstOrThrow(args: { where: { id: string; userId: string } }): Promise<Account>;
  };
};

export class AccountReactivateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountReactivateNotFoundError";
  }
}

export async function reactivateAccount(id: string, userId: string) {
  const updatedAccount = await accountWriter.account.updateMany({
    where: { id, userId },
    data: { activa: true },
  });

  if (updatedAccount.count === 0) {
    throw new AccountReactivateNotFoundError("Account not found.");
  }

  return accountWriter.account.findFirstOrThrow({ where: { id, userId } });
}
