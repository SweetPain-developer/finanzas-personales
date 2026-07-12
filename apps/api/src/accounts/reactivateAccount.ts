import { prisma } from "../prisma.js";

export class AccountReactivateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountReactivateNotFoundError";
  }
}

export async function reactivateAccount(id: string) {
  const updatedAccount = await prisma.account.updateMany({
    where: { id },
    data: { activa: true },
  });

  if (updatedAccount.count === 0) {
    throw new AccountReactivateNotFoundError("Account not found.");
  }

  return prisma.account.findUniqueOrThrow({ where: { id } });
}
