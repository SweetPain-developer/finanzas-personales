import type { Account } from "@prisma/client";
import { prisma } from "../prisma.js";
import { UpdateAccountDTO } from "@finanzas-personales/shared-types";

const accountWriter = prisma as unknown as {
  account: {
    updateMany(args: { where: { id: string; userId: string }; data: { nombre: string; tipo: string; saldo: number } }): Promise<{ count: number }>;
    findFirstOrThrow(args: { where: { id: string; userId: string } }): Promise<Account>;
  };
};

export class AccountUpdateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountUpdateNotFoundError";
  }
}

export async function updateAccount(id: string, data: UpdateAccountDTO, userId: string) {
  const updatedAccount = await accountWriter.account.updateMany({
    where: { id, userId },
    data: {
      nombre: data.name,
      tipo: data.type,
      saldo: data.balance,
    },
  });

  if (updatedAccount.count === 0) {
    throw new AccountUpdateNotFoundError("Account not found.");
  }

  return accountWriter.account.findFirstOrThrow({ where: { id, userId } });
}
