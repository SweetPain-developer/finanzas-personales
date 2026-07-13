import type { Account } from '@prisma/client';
import { prisma } from '../prisma.js';
import { CreateAccountDTO } from '@finanzas-personales/shared-types';

const accountWriter = prisma as unknown as {
  account: {
    create(args: { data: { nombre: string; tipo: string; saldo: number; userId: string } }): Promise<Account>;
  };
};

export async function createAccount(data: CreateAccountDTO, userId: string) {
  const { name, type, balance } = data;

  return await accountWriter.account.create({
    data: {
      nombre: name,
      tipo: type,
      saldo: balance,
      userId,
    },
  });
}
