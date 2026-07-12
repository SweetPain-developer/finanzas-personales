import { prisma } from "../prisma.js";
import { UpdateAccountDTO } from "@finanzas-personales/shared-types";

export class AccountUpdateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountUpdateNotFoundError";
  }
}

export async function updateAccount(id: string, data: UpdateAccountDTO) {
  const updatedAccount = await prisma.account.updateMany({
    where: { id },
    data: {
      nombre: data.name,
      tipo: data.type,
      saldo: data.balance,
    },
  });

  if (updatedAccount.count === 0) {
    throw new AccountUpdateNotFoundError("Account not found.");
  }

  return prisma.account.findUniqueOrThrow({ where: { id } });
}
