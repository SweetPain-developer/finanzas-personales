import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { prisma } from '../prisma.js';
import { createAccount } from './createAccount.js';
import { CreateAccountDTO } from '@finanzas-personales/shared-types';

vi.mock('../prisma.js', () => ({
  prisma: {
    account: {
      create: vi.fn(),
    },
  },
}));

const createMock = prisma.account.create as Mock;

describe('createAccount', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('should call prisma.account.create with correct data', async () => {
    const newAccount: CreateAccountDTO = {
      name: 'Test Account',
      type: 'AHORRO',
      balance: 1000,
    };

    createMock.mockResolvedValueOnce({
      id: '1',
      ...newAccount,
      nombre: newAccount.name,
      tipo: newAccount.type,
      saldo: newAccount.balance,
      activa: true,
      notas: null,
      orden: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await createAccount(newAccount);

    expect(createMock).toHaveBeenCalledWith({
      data: {
        nombre: 'Test Account',
        tipo: 'AHORRO',
        saldo: 1000,
      },
    });
  });
});
