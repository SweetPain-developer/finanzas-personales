import { prisma } from '../prisma.js';
import { CreateAccountDTO } from '@finanzas-personales/shared-types';

export async function createAccount(data: CreateAccountDTO) {
  const { name, type, balance } = data;

  return await prisma.account.create({
    data: {
      nombre: name,
      tipo: type,
      saldo: balance,
    },
  });
}
