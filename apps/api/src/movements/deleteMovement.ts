import { TransactionType, type Prisma, type Transaction } from "@prisma/client";

import { prisma } from "../prisma.js";

type OwnedTransactionOperations = {
  findFirst(args: { where: { id: string; userId: string }; include?: { loanDelivery: boolean; loanRepayment: boolean } }): Promise<(Transaction & { loanDelivery?: unknown; loanRepayment?: unknown }) | null>;
  findMany(args: { where: { transferId: string; userId: string }; orderBy: { tipo: "asc" } }): Promise<Transaction[]>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
};

type OwnedAccountOperations = {
  findMany(args: {
    where: { id: { in: string[] }; userId: string };
    select: { id: true };
  }): Promise<Array<{ id: string }>>;
  updateMany(args: { where: { id: string; userId: string }; data: { saldo: { increment: number } } }): Promise<{ count: number }>;
};

export class MovementDeleteNotFoundError extends Error {
  constructor(message = "Movement not found.") {
    super(message);
    this.name = "MovementDeleteNotFoundError";
  }
}

export class MovementDeleteConflictError extends Error {
  constructor(message = "Movement changed while deleting. Please reload and try again.") {
    super(message);
    this.name = "MovementDeleteConflictError";
  }
}

export async function deleteMovement(id: string, userId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const transactionOperations = tx.transaction as unknown as OwnedTransactionOperations;
       const existing = await transactionOperations.findFirst({ where: { id, userId } });

       if (!existing) {
        await deleteTransferMovement(tx, id, null, userId);
        return;
       }

       const linked = existing.categoryId === null
         ? await transactionOperations.findFirst({ where: { id, userId }, include: { loanDelivery: true, loanRepayment: true } })
         : existing;
       if (linked?.loanDelivery || linked?.loanRepayment) {
         throw new MovementDeleteConflictError("Loan-linked transactions must be deleted through the loan endpoint.");
       }

      if (existing.tipo === TransactionType.TRANSFERENCIA || existing.transferId !== null || existing.categoryId === null) {
        if (existing.transferId === null) {
          throw new MovementDeleteConflictError("Transfer pair is invalid. Please reload and try again.");
        }

        await deleteTransferMovement(tx, id, existing, userId);
        return;
      }

      const guardedDelete = await transactionOperations.deleteMany({
        where: {
          id,
          userId,
          tipo: existing.tipo,
          monto: existing.monto,
          accountId: existing.accountId,
          categoryId: existing.categoryId,
          transferId: null,
          updatedAt: existing.updatedAt,
        },
      });

      if (guardedDelete.count !== 1) {
        throw new MovementDeleteConflictError("Movement changed while deleting. Please reload and try again.");
      }

      await reverseBalanceEffect(tx, existing, userId);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isPrismaTransactionConflictError(error)) {
      throw new MovementDeleteConflictError("Movement changed while deleting. Please reload and try again.");
    }

    throw error;
  }
}

async function reverseBalanceEffect(tx: Prisma.TransactionClient, movement: Transaction, userId: string) {
  const reverseEffect = movement.tipo === TransactionType.INGRESO ? -movement.monto : movement.monto;

  await updateOwnedAccountBalance(tx, movement.accountId, userId, reverseEffect);
}

async function deleteTransferMovement(tx: Prisma.TransactionClient, id: string, selectedMovement: Transaction | null, userId: string) {
  const transferId = selectedMovement?.transferId ?? id;
  const transactionOperations = tx.transaction as unknown as OwnedTransactionOperations;
  const accountOperations = tx.account as unknown as OwnedAccountOperations;
  const pair = await transactionOperations.findMany({ where: { transferId, userId }, orderBy: { tipo: "asc" } });

  if (pair.length === 0) {
    throw new MovementDeleteNotFoundError();
  }

  const salida = pair.find((transaction) => transaction.tipo === TransactionType.GASTO);
  const entrada = pair.find((transaction) => transaction.tipo === TransactionType.INGRESO);

  if (pair.length !== 2 || !salida || !entrada || !hasConsistentTransferPair(salida, entrada)) {
    throw new MovementDeleteConflictError("Transfer pair is invalid. Please reload and try again.");
  }

  const accounts = await accountOperations.findMany({
    where: { id: { in: [salida.accountId, entrada.accountId] }, userId },
    select: { id: true },
  });

  if (accounts.length !== 2) {
    throw new MovementDeleteConflictError("Transfer pair references invalid accounts. Please reload and try again.");
  }

  const guardedDelete = await transactionOperations.deleteMany({
    where: {
      transferId,
      userId,
      OR: [
        { id: salida.id, tipo: salida.tipo, monto: salida.monto, accountId: salida.accountId, categoryId: null, updatedAt: salida.updatedAt },
        { id: entrada.id, tipo: entrada.tipo, monto: entrada.monto, accountId: entrada.accountId, categoryId: null, updatedAt: entrada.updatedAt },
      ],
    },
  });

  if (guardedDelete.count !== 2) {
    throw new MovementDeleteConflictError();
  }

  await updateOwnedAccountBalance(tx, salida.accountId, userId, salida.monto);
  await updateOwnedAccountBalance(tx, entrada.accountId, userId, -entrada.monto);
}

async function updateOwnedAccountBalance(tx: Prisma.TransactionClient, accountId: string, userId: string, increment: number) {
  const accountOperations = tx.account as unknown as OwnedAccountOperations;
  const updated = await accountOperations.updateMany({
    where: { id: accountId, userId },
    data: { saldo: { increment } },
  });

  if (updated.count !== 1) {
    throw new MovementDeleteConflictError("Movement references an account that is no longer available. Please reload and try again.");
  }
}

function hasConsistentTransferPair(salida: Transaction, entrada: Transaction) {
  return salida.transferId !== null
    && salida.transferId === entrada.transferId
    && salida.categoryId === null
    && entrada.categoryId === null
    && salida.accountId !== entrada.accountId
    && salida.monto === entrada.monto
    && salida.fecha.getTime() === entrada.fecha.getTime()
    && salida.descripcion === entrada.descripcion;
}

function isPrismaTransactionConflictError(error: unknown) {
  return isRecord(error) && error.code === "P2034";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
