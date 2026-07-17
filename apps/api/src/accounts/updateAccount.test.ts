import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { prisma } from '../prisma.js';
import { AccountUpdateNotFoundError, LoanAccountConflictError, updateAccount } from './updateAccount.js';
import { UpdateAccountDTO } from '@finanzas-personales/shared-types';

vi.mock('../prisma.js', () => ({
    prisma: {
    account: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      },
      transaction: { findFirst: vi.fn().mockResolvedValue(null) },
    },
}));

const updateManyMock = prisma.account.updateMany as Mock;
const findFirstOrThrowMock = prisma.account.findFirstOrThrow as Mock;
const findFirstMock = prisma.account.findFirst as Mock;
const findLoanTransactionMock = prisma.transaction.findFirst as Mock;

describe('updateAccount', () => {
  beforeEach(() => {
    updateManyMock.mockReset();
    findFirstOrThrowMock.mockReset();
    findFirstMock.mockReset();
    findFirstMock.mockResolvedValue({ tipo: "OPERATIVA" });
    findLoanTransactionMock.mockReset();
    findLoanTransactionMock.mockResolvedValue(null);
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
    findFirstOrThrowMock.mockResolvedValueOnce(persistedAccount);

    await expect(updateAccount('account-demo-primary', accountUpdate, 'user-demo')).resolves.toEqual(persistedAccount);

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 'account-demo-primary', userId: 'user-demo' },
      data: {
        nombre: 'Cuenta principal',
        tipo: 'OPERATIVA',
        saldo: 460000,
      },
    });
    expect(findFirstOrThrowMock).toHaveBeenCalledWith({ where: { id: 'account-demo-primary', userId: 'user-demo' } });
  });

  it('throws when the account does not exist', async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(
      updateAccount('missing-account', {
        name: 'Cuenta inexistente',
        type: 'AHORRO',
        balance: 0,
      }, 'user-demo'),
    ).rejects.toBeInstanceOf(AccountUpdateNotFoundError);

    expect(findFirstOrThrowMock).not.toHaveBeenCalled();
  });

  it('returns not found for accounts owned by another user', async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });

    await expect(
      updateAccount('account-other-user', {
        name: 'Cuenta ajena',
        type: 'AHORRO',
        balance: 0,
      }, 'user-owner'),
    ).rejects.toBeInstanceOf(AccountUpdateNotFoundError);

    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'account-other-user', userId: 'user-owner' },
    }));
    expect(findFirstOrThrowMock).not.toHaveBeenCalled();
  });

  it("does not change the type of an account referenced by a loan transaction", async () => {
    findFirstMock.mockResolvedValueOnce({ tipo: "OPERATIVA" });
    findLoanTransactionMock.mockResolvedValueOnce({ id: "loan-delivery-tx" });

    await expect(updateAccount("account-demo-primary", { name: "Cuenta", type: "DEUDA", balance: 0 }, "user-demo"))
      .rejects.toBeInstanceOf(LoanAccountConflictError);
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
