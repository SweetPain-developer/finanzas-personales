import { TransactionType, type Prisma, type Transaction } from "@prisma/client";

import { prisma } from "../prisma.js";

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

export async function deleteMovement(id: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({ where: { id } });

      if (!existing) {
        await deleteTransferMovement(tx, id, null);
        return;
      }

      if (existing.tipo === TransactionType.TRANSFERENCIA || existing.transferId !== null || existing.categoryId === null) {
        if (existing.transferId === null) {
          throw new MovementDeleteConflictError("Transfer pair is invalid. Please reload and try again.");
        }

        await deleteTransferMovement(tx, id, existing);
        return;
      }

      const guardedDelete = await tx.transaction.deleteMany({
        where: {
          id,
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

      await reverseBalanceEffect(tx, existing);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isPrismaTransactionConflictError(error)) {
      throw new MovementDeleteConflictError("Movement changed while deleting. Please reload and try again.");
    }

    throw error;
  }
}

async function reverseBalanceEffect(tx: Prisma.TransactionClient, movement: Transaction) {
  const reverseEffect = movement.tipo === TransactionType.INGRESO ? -movement.monto : movement.monto;

  await tx.account.update({
    where: { id: movement.accountId },
    data: { saldo: { increment: reverseEffect } },
  });
}

async function deleteTransferMovement(tx: Prisma.TransactionClient, id: string, selectedMovement: Transaction | null) {
  const transferId = selectedMovement?.transferId ?? id;
  const pair = await tx.transaction.findMany({ where: { transferId }, orderBy: { tipo: "asc" } });

  if (pair.length === 0) {
    throw new MovementDeleteNotFoundError();
  }

  const salida = pair.find((transaction) => transaction.tipo === TransactionType.GASTO);
  const entrada = pair.find((transaction) => transaction.tipo === TransactionType.INGRESO);

  if (pair.length !== 2 || !salida || !entrada || !hasConsistentTransferPair(salida, entrada)) {
    throw new MovementDeleteConflictError("Transfer pair is invalid. Please reload and try again.");
  }

  const accounts = await tx.account.findMany({
    where: { id: { in: [salida.accountId, entrada.accountId] } },
    select: { id: true },
  });

  if (accounts.length !== 2) {
    throw new MovementDeleteConflictError("Transfer pair references invalid accounts. Please reload and try again.");
  }

  const guardedDelete = await tx.transaction.deleteMany({
    where: {
      transferId,
      OR: [
        { id: salida.id, tipo: salida.tipo, monto: salida.monto, accountId: salida.accountId, categoryId: null, updatedAt: salida.updatedAt },
        { id: entrada.id, tipo: entrada.tipo, monto: entrada.monto, accountId: entrada.accountId, categoryId: null, updatedAt: entrada.updatedAt },
      ],
    },
  });

  if (guardedDelete.count !== 2) {
    throw new MovementDeleteConflictError();
  }

  await tx.account.update({ where: { id: salida.accountId }, data: { saldo: { increment: salida.monto } } });
  await tx.account.update({ where: { id: entrada.accountId }, data: { saldo: { increment: -entrada.monto } } });
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
