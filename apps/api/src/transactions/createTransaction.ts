import { randomUUID } from "node:crypto";

import { TransactionType, type Prisma, type Transaction } from "@prisma/client";

import { prisma } from "../prisma.js";

type ExpenseOrIncomeInput = {
  tipo: "GASTO" | "INGRESO";
  monto: number;
  accountId: string;
  categoryId: string;
  descripcion?: string;
  fecha?: string;
};

type TransferInput = {
  tipo: "TRANSFERENCIA";
  monto: number;
  fromAccountId: string;
  toAccountId: string;
  descripcion?: string;
  fecha?: string;
};

type CreateTransactionInput = ExpenseOrIncomeInput | TransferInput;

type TransactionClientWithOwnership = Prisma.TransactionClient & {
  account: Prisma.TransactionClient["account"] & {
    findFirst(args: { where: { id: string; activa: true; userId: string } }): Promise<{ id: string } | null>;
  };
  category: Prisma.TransactionClient["category"] & {
    findFirst(args: { where: { id: string; userId: string } }): Promise<{ id: string; nombre: string; tipo: TransactionType | string } | null>;
  };
  transaction: Prisma.TransactionClient["transaction"] & {
    create(args: { data: Record<string, unknown> }): Promise<Transaction>;
  };
};

export class TransactionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionValidationError";
  }
}

export async function createTransaction(payload: unknown, userId: string): Promise<Transaction[]> {
  const input = parseCreateTransactionInput(payload);
  const fecha = parseTransactionDate(input.fecha);

  return prisma.$transaction(async (tx) => {
    const ownedTx = tx as TransactionClientWithOwnership;

    if (input.tipo === "TRANSFERENCIA") {
      return createTransfer(ownedTx, input, fecha, userId);
    }

    return [await createExpenseOrIncome(ownedTx, input, fecha, userId)];
  });
}

function parseCreateTransactionInput(payload: unknown): CreateTransactionInput {
  if (!isRecord(payload)) {
    throw new TransactionValidationError("Request body must be an object.");
  }

  const tipo = payload.tipo;

  if (tipo !== "GASTO" && tipo !== "INGRESO" && tipo !== "TRANSFERENCIA") {
    throw new TransactionValidationError("Invalid transaction type.");
  }

  const monto = payload.monto;

  if (typeof monto !== "number" || !Number.isInteger(monto) || monto <= 0) {
    throw new TransactionValidationError("Amount must be an integer greater than zero.");
  }

  const descripcion = optionalString(payload.descripcion, "descripcion");
  const fecha = optionalString(payload.fecha, "fecha");

  if (tipo === "TRANSFERENCIA") {
    const fromAccountId = requiredString(payload.fromAccountId, "fromAccountId");
    const toAccountId = requiredString(payload.toAccountId, "toAccountId");

    if (fromAccountId === toAccountId) {
      throw new TransactionValidationError("Transfer accounts must be different.");
    }

    return { tipo, monto, fromAccountId, toAccountId, descripcion, fecha };
  }

  return {
    tipo,
    monto,
    accountId: requiredString(payload.accountId, "accountId"),
    categoryId: requiredString(payload.categoryId, "categoryId"),
    descripcion,
    fecha,
  };
}

async function createExpenseOrIncome(
  tx: TransactionClientWithOwnership,
  input: ExpenseOrIncomeInput,
  fecha: Date,
  userId: string,
): Promise<Transaction> {
  const [account, category] = await Promise.all([
    tx.account.findFirst({ where: { id: input.accountId, activa: true, userId } }),
    tx.category.findFirst({ where: { id: input.categoryId, userId } }),
  ]);

  if (!account) {
    throw new TransactionValidationError("Account not found or inactive.");
  }

  if (!category) {
    throw new TransactionValidationError("Category not found.");
  }

  if (category.tipo !== input.tipo) {
    throw new TransactionValidationError("Category type does not match transaction type.");
  }

  const balanceChange = input.tipo === "INGRESO" ? input.monto : -input.monto;

  await tx.account.update({
    where: { id: input.accountId },
    data: { saldo: { increment: balanceChange } },
  });

  return tx.transaction.create({
    data: {
      tipo: input.tipo,
      monto: input.monto,
      descripcion: normalizeDescription(input.descripcion, category.nombre),
      fecha,
      accountId: input.accountId,
      categoryId: input.categoryId,
      transferId: null,
      userId,
    },
  });
}

async function createTransfer(tx: TransactionClientWithOwnership, input: TransferInput, fecha: Date, userId: string): Promise<Transaction[]> {
  const [fromAccount, toAccount] = await Promise.all([
    tx.account.findFirst({ where: { id: input.fromAccountId, activa: true, userId } }),
    tx.account.findFirst({ where: { id: input.toAccountId, activa: true, userId } }),
  ]);

  if (!fromAccount) {
    throw new TransactionValidationError("Origin account not found or inactive.");
  }

  if (!toAccount) {
    throw new TransactionValidationError("Destination account not found or inactive.");
  }

  const transferId = randomUUID();
  const descripcion = normalizeDescription(input.descripcion, "Transferencia");

  await tx.account.update({
    where: { id: input.fromAccountId },
    data: { saldo: { decrement: input.monto } },
  });
  await tx.account.update({
    where: { id: input.toAccountId },
    data: { saldo: { increment: input.monto } },
  });

  const salida = await tx.transaction.create({
    data: {
      tipo: TransactionType.GASTO,
      monto: input.monto,
      descripcion,
      fecha,
      accountId: input.fromAccountId,
      categoryId: null,
      transferId,
      userId,
    },
  });
  const entrada = await tx.transaction.create({
    data: {
      tipo: TransactionType.INGRESO,
      monto: input.monto,
      descripcion,
      fecha,
      accountId: input.toAccountId,
      categoryId: null,
      transferId,
      userId,
    },
  });

  return [salida, entrada];
}

function parseTransactionDate(value: string | undefined) {
  if (value === undefined) {
    return new Date();
  }

  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const isoDateTimeMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T.+$/);
  const dateParts = isoDateMatch ?? isoDateTimeMatch;

  if (!dateParts || !isValidCalendarDate(dateParts[1], dateParts[2], dateParts[3])) {
    throw new TransactionValidationError("Invalid date.");
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TransactionValidationError("Invalid date.");
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
    throw new TransactionValidationError(`${fieldName} is required.`);
  }

  return value;
}

function optionalString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TransactionValidationError(`${fieldName} must be a string.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
