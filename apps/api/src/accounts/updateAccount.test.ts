import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { prisma } from '../prisma.js';
import { AccountUpdateNotFoundError, updateAccount } from './updateAccount.js';
import { UpdateAccountDTO } from '@finanzas-personales/shared-types';

vi.mock('../prisma.js', () => ({
  prisma: {
    account: {
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

const updateManyMock = prisma.account.updateMany as Mock;
const findUniqueOrThrowMock = prisma.account.findUniqueOrThrow as Mock;

describe('updateAccount', () => {
  beforeEach(() => {
    updateManyMock.mockReset();
    findUniqueOrThrowMock.mockReset();
  });

  it('maps DTO fields to Prisma account fields', async () => {
    const accountUpdate: UpdateAccountDTO = {
      name: 'Cuenta principal',
      type: 'OPERATIVA',
      balance: 460000,
    };
    const persistedAccount = {
      id: 'account-demo-primary',
      nombre: accountUpdate.name,
      tipo: accountUpdate.type,
      saldo: accountUpdate.balance,
      activa: true,
      notas: null,
      orden: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    updateManyMock.mockResolvedValueOnce({ count: 1 });
    findUniqueOrThrowMock.mockResolvedValueOnce(persistedAccount);

    await expect(updateAccount('account-demo-primary', accountUpdate)).resolves.toEqual(persistedAccount);

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 'account-demo-primary' },
      data: {
        nombre: 'Cuenta principal',
        tipo: 'OPERATIVA',
        saldo: 460000,
      },
    });
    expect(findUniqueOrThrowMock).toHaveBeenCalledWith({ where: { id: 'account-demo-primary' } });
  });

  it('throws when the account does not exist', async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(
      updateAccount('missing-account', {
        name: 'Cuenta inexistente',
        type: 'AHORRO',
        balance: 0,
      }),
    ).rejects.toBeInstanceOf(AccountUpdateNotFoundError);

    expect(findUniqueOrThrowMock).not.toHaveBeenCalled();
  });
});
