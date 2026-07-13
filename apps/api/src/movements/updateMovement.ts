import { TransactionType, type Prisma, type Transaction } from "@prisma/client";

import { prisma } from "../prisma.js";

type UpdateMovementInput = {
  tipo: "GASTO" | "INGRESO";
  monto: number;
  accountId: string;
  categoryId: string;
  descripcion?: string;
  fecha: string;
};

type UpdateTransferInput = {
  tipo: "TRANSFERENCIA";
  monto: number;
  fromAccountId: string;
  toAccountId: string;
  descripcion?: string;
  fecha: string;
};

type ParsedUpdateInput = UpdateMovementInput | UpdateTransferInput;

type TransactionClientWithOwnership = Prisma.TransactionClient & {
  account: Prisma.TransactionClient["account"] & {
    findFirst(args: { where: { id: string; activa: true; userId: string } }): Promise<{ id: string } | null>;
  };
  category: Prisma.TransactionClient["category"] & {
    findFirst(args: { where: { id: string; userId: string } }): Promise<{ id: string; nombre: string; tipo: TransactionType | string } | null>;
  };
};

type OwnedTransactionOperations = {
  findFirst(args: { where: { id: string; userId: string } }): Promise<Transaction | null>;
  findMany(args: { where: { transferId: string; userId: string }; orderBy: { tipo: "asc" } }): Promise<Transaction[]>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};

type OwnedAccountBalanceOperations = {
  updateMany(args: { where: { id: string; userId: string }; data: { saldo: { increment: number } } }): Promise<{ count: number }>;
};

export class MovementUpdateNotFoundError extends Error {
  constructor(message = "Movement not found.") {
    super(message);
    this.name = "MovementUpdateNotFoundError";
  }
}

export class MovementUpdateConflictError extends Error {
  constructor(message = "Movement changed while editing. Please reload and try again.") {
    super(message);
    this.name = "MovementUpdateConflictError";
  }
}

export class MovementUpdateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MovementUpdateValidationError";
  }
}

export async function updateMovement(id: string, payload: unknown, userId: string): Promise<Transaction | Transaction[]> {
  const input = parseUpdateInput(payload);
  const fecha = parseMovementDate(input.fecha);

  try {
    return await prisma.$transaction(async (tx) => {
      const ownedTx = tx as TransactionClientWithOwnership;
      const transactionOperations = tx.transaction as unknown as OwnedTransactionOperations;
      const existing = await transactionOperations.findFirst({ where: { id, userId } });

      if (input.tipo === "TRANSFERENCIA" || (existing !== null && (existing.transferId !== null || existing.categoryId === null))) {
        return updateTransferMovement(ownedTx, id, existing, input, fecha, userId);
      }

      if (!existing) {
        throw new MovementUpdateNotFoundError();
      }

      const [account, category] = await Promise.all([
        ownedTx.account.findFirst({ where: { id: input.accountId, activa: true, userId } }),
        ownedTx.category.findFirst({ where: { id: input.categoryId, userId } }),
      ]);

      if (!account) {
        throw new MovementUpdateValidationError("Account not found or inactive.");
      }

      if (!category) {
        throw new MovementUpdateValidationError("Category not found.");
      }

      if (category.tipo !== input.tipo) {
        throw new MovementUpdateValidationError("Category type does not match movement type.");
      }

      const guardedUpdate = await transactionOperations.updateMany({
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
        data: {
          tipo: input.tipo,
          monto: input.monto,
          descripcion: normalizeDescription(input.descripcion, category.nombre),
          fecha,
          accountId: input.accountId,
          categoryId: input.categoryId,
        },
      });

      if (guardedUpdate.count !== 1) {
        throw new MovementUpdateConflictError("Movement changed while editing. Please reload and try again.");
      }

      await adjustBalances(tx, existing, input, userId);

      const updated = await transactionOperations.findFirst({ where: { id, userId } });

      if (!updated) {
        throw new MovementUpdateNotFoundError();
      }

      return updated;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isPrismaTransactionConflictError(error)) {
      throw new MovementUpdateConflictError("Movement changed while editing. Please reload and try again.");
    }

    throw error;
  }
}

async function updateTransferMovement(
  tx: TransactionClientWithOwnership,
  id: string,
  selectedMovement: Transaction | null,
  input: ParsedUpdateInput,
  fecha: Date,
  userId: string,
): Promise<Transaction[]> {
  if (input.tipo !== "TRANSFERENCIA") {
    throw new MovementUpdateConflictError("Transfer movements must be edited as transfers.");
  }

  const transferId = selectedMovement?.transferId ?? id;
  const transactionOperations = tx.transaction as unknown as OwnedTransactionOperations;
  const pair = await transactionOperations.findMany({ where: { transferId, userId }, orderBy: { tipo: "asc" } });

  if (pair.length === 0) {
    throw new MovementUpdateNotFoundError();
  }

  const salida = pair.find((transaction) => transaction.tipo === TransactionType.GASTO);
  const entrada = pair.find((transaction) => transaction.tipo === TransactionType.INGRESO);

  if (pair.length !== 2 || !salida || !entrada) {
    throw new MovementUpdateConflictError("Transfer pair is invalid. Please reload and try again.");
  }

  if (!hasConsistentTransferPair(salida, entrada)) {
    throw new MovementUpdateConflictError("Transfer pair is inconsistent. Please reload and try again.");
  }

  const [fromAccount, toAccount] = await Promise.all([
    tx.account.findFirst({ where: { id: input.fromAccountId, activa: true, userId } }),
    tx.account.findFirst({ where: { id: input.toAccountId, activa: true, userId } }),
  ]);

  if (!fromAccount) {
    throw new MovementUpdateValidationError("Origin account not found or inactive.");
  }

  if (!toAccount) {
    throw new MovementUpdateValidationError("Destination account not found or inactive.");
  }

  const descripcion = normalizeDescription(input.descripcion, "Transferencia");
  const guardedUpdate = await transactionOperations.updateMany({
    where: {
      transferId,
      userId,
      OR: [
        { id: salida.id, tipo: salida.tipo, monto: salida.monto, accountId: salida.accountId, categoryId: null, updatedAt: salida.updatedAt },
        { id: entrada.id, tipo: entrada.tipo, monto: entrada.monto, accountId: entrada.accountId, categoryId: null, updatedAt: entrada.updatedAt },
      ],
    },
    data: { monto: input.monto, descripcion, fecha },
  });

  if (guardedUpdate.count !== 2) {
    throw new MovementUpdateConflictError();
  }

  await tx.transaction.update({ where: { id: salida.id }, data: { accountId: input.fromAccountId } });
  await tx.transaction.update({ where: { id: entrada.id }, data: { accountId: input.toAccountId } });
  await adjustTransferBalances(tx, salida, entrada, input, userId);

  return transactionOperations.findMany({ where: { transferId, userId }, orderBy: { tipo: "asc" } });
}

function isPrismaTransactionConflictError(error: unknown) {
  return isRecord(error) && error.code === "P2034";
}

async function adjustBalances(tx: Prisma.TransactionClient, existing: Transaction, input: UpdateMovementInput, userId: string) {
  const reverseOldEffect = existing.tipo === TransactionType.INGRESO ? -existing.monto : existing.monto;
  const applyNewEffect = input.tipo === "INGRESO" ? input.monto : -input.monto;

  if (existing.accountId === input.accountId) {
    await updateOwnedAccountBalance(tx, existing.accountId, userId, reverseOldEffect + applyNewEffect);
    return;
  }

  await updateOwnedAccountBalance(tx, existing.accountId, userId, reverseOldEffect);
  await updateOwnedAccountBalance(tx, input.accountId, userId, applyNewEffect);
}

function parseUpdateInput(payload: unknown): ParsedUpdateInput {
  if (!isRecord(payload)) {
    throw new MovementUpdateValidationError("Request body must be an object.");
  }

  const tipo = payload.tipo;

  if (tipo !== "GASTO" && tipo !== "INGRESO" && tipo !== "TRANSFERENCIA") {
    throw new MovementUpdateValidationError("Invalid movement type.");
  }

  const monto = payload.monto;

  if (typeof monto !== "number" || !Number.isInteger(monto) || monto <= 0) {
    throw new MovementUpdateValidationError("Amount must be an integer greater than zero.");
  }

  if (tipo === "TRANSFERENCIA") {
    const fromAccountId = requiredString(payload.fromAccountId, "fromAccountId");
    const toAccountId = requiredString(payload.toAccountId, "toAccountId");

    if (fromAccountId === toAccountId) {
      throw new MovementUpdateValidationError("Transfer accounts must be different.");
    }

    return {
      tipo,
      monto,
      fromAccountId,
      toAccountId,
      descripcion: optionalString(payload.descripcion, "descripcion"),
      fecha: requiredString(payload.fecha, "fecha"),
    };
  }

  return {
    tipo,
    monto,
    accountId: requiredString(payload.accountId, "accountId"),
    categoryId: requiredString(payload.categoryId, "categoryId"),
    descripcion: optionalString(payload.descripcion, "descripcion"),
    fecha: requiredString(payload.fecha, "fecha"),
  };
}

async function adjustTransferBalances(
  tx: Prisma.TransactionClient,
  salida: Transaction,
  entrada: Transaction,
  input: UpdateTransferInput,
  userId: string,
) {
  const deltas = new Map<string, number>();
  addBalanceDelta(deltas, salida.accountId, salida.monto);
  addBalanceDelta(deltas, entrada.accountId, -entrada.monto);
  addBalanceDelta(deltas, input.fromAccountId, -input.monto);
  addBalanceDelta(deltas, input.toAccountId, input.monto);

  for (const [accountId, delta] of deltas) {
    if (delta !== 0) {
      await updateOwnedAccountBalance(tx, accountId, userId, delta);
    }
  }
}

async function updateOwnedAccountBalance(tx: Prisma.TransactionClient, accountId: string, userId: string, increment: number) {
  const accountOperations = tx.account as unknown as OwnedAccountBalanceOperations;
  const updated = await accountOperations.updateMany({
    where: { id: accountId, userId },
    data: { saldo: { increment } },
  });

  if (updated.count !== 1) {
    throw new MovementUpdateConflictError("Movement references an account that is no longer available. Please reload and try again.");
  }
}

function addBalanceDelta(deltas: Map<string, number>, accountId: string, delta: number) {
  deltas.set(accountId, (deltas.get(accountId) ?? 0) + delta);
}

function hasConsistentTransferPair(salida: Transaction, entrada: Transaction) {
  return salida.monto === entrada.monto
    && salida.fecha.getTime() === entrada.fecha.getTime()
    && salida.descripcion === entrada.descripcion;
}

function parseMovementDate(value: string) {
  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const isoDateTimeMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T.+$/);
  const dateParts = isoDateMatch ?? isoDateTimeMatch;

  if (!dateParts || !isValidCalendarDate(dateParts[1], dateParts[2], dateParts[3])) {
    throw new MovementUpdateValidationError("Invalid date.");
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new MovementUpdateValidationError("Invalid date.");
  }

  return date;
}

function isValidCalendarDate(yearValue: string, monthValue: string, dayValue: string) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeDescription(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function requiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MovementUpdateValidationError(`${fieldName} is required.`);
  }

  return value;
}

function optionalString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new MovementUpdateValidationError(`${fieldName} must be a string.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
