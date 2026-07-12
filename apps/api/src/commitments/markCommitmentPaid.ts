import { CategoryType, CommitmentStatus, TransactionType, type Commitment, type Prisma } from "@prisma/client";

import { prisma } from "../prisma.js";

export class CommitmentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentNotFoundError";
  }
}

export class CommitmentPaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentPaymentValidationError";
  }
}

export class CommitmentPaymentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentPaymentConflictError";
  }
}

type MarkCommitmentPaidInput = {
  accountId: string;
  categoryId: string;
};

export async function markCommitmentPaid(id: string, payload: unknown): Promise<Commitment> {
  const commitment = await prisma.commitment.findUnique({ where: { id } });

  if (!commitment) {
    throw new CommitmentNotFoundError("Commitment not found.");
  }

  if (commitment.estado === CommitmentStatus.PAGADO) {
    return commitment;
  }

  const input = parseMarkCommitmentPaidInput(payload);

  return prisma.$transaction(async (tx) => {
    const paidUpdate = await tx.commitment.updateMany({
      where: { id, estado: CommitmentStatus.PENDIENTE },
      data: { estado: CommitmentStatus.PAGADO },
    });

    if (paidUpdate.count === 0) {
      return tx.commitment.findUniqueOrThrow({ where: { id } });
    }

    await validatePaymentReferences(tx, input);

    await tx.account.update({
      where: { id: input.accountId },
      data: { saldo: { decrement: commitment.monto } },
    });

    const paymentTransaction = await tx.transaction.create({
      data: {
        tipo: TransactionType.GASTO,
        monto: commitment.monto,
        descripcion: `Pago compromiso: ${commitment.nombre}`,
        accountId: input.accountId,
        categoryId: input.categoryId,
        transferId: null,
      },
    });

    await tx.commitment.update({
      where: { id },
      data: { paymentTransactionId: paymentTransaction.id },
    });

    return tx.commitment.findUniqueOrThrow({ where: { id } });
  });
}

export async function markCommitmentUnpaid(id: string): Promise<Commitment> {
  const commitment = await prisma.commitment.findUnique({ where: { id } });

  if (!commitment) {
    throw new CommitmentNotFoundError("Commitment not found.");
  }

  if (commitment.estado === CommitmentStatus.PENDIENTE) {
    throw new CommitmentPaymentValidationError("Only paid commitments can be reverted.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const currentCommitment = await tx.commitment.findUnique({ where: { id } });

      if (!currentCommitment) {
        throw new CommitmentNotFoundError("Commitment not found.");
      }

      if (currentCommitment.estado === CommitmentStatus.PENDIENTE) {
        throw new CommitmentPaymentValidationError("Only paid commitments can be reverted.");
      }

      if (!currentCommitment.paymentTransactionId) {
        throw new CommitmentPaymentConflictError("Paid commitment has no linked payment transaction.");
      }

      const paymentTransaction = await tx.transaction.findUnique({ where: { id: currentCommitment.paymentTransactionId } });

      if (!paymentTransaction) {
        throw new CommitmentPaymentConflictError("Linked payment transaction not found.");
      }

      if (paymentTransaction.tipo !== TransactionType.GASTO || paymentTransaction.transferId !== null || paymentTransaction.monto !== currentCommitment.monto) {
        throw new CommitmentPaymentConflictError("Linked payment transaction is not reversible.");
      }

      const unpaidUpdate = await tx.commitment.updateMany({
        where: { id, estado: CommitmentStatus.PAGADO, paymentTransactionId: paymentTransaction.id },
        data: { estado: CommitmentStatus.PENDIENTE, paymentTransactionId: null },
      });

      if (unpaidUpdate.count !== 1) {
        throw new CommitmentPaymentConflictError("Commitment changed while reverting payment.");
      }

      const deletedTransaction = await tx.transaction.deleteMany({
        where: {
          id: paymentTransaction.id,
          tipo: TransactionType.GASTO,
          monto: paymentTransaction.monto,
          accountId: paymentTransaction.accountId,
          transferId: null,
        },
      });

      if (deletedTransaction.count !== 1) {
        throw new CommitmentPaymentConflictError("Linked payment transaction changed while reverting payment.");
      }

      await tx.account.update({
        where: { id: paymentTransaction.accountId },
        data: { saldo: { increment: paymentTransaction.monto } },
      });

      return tx.commitment.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isPrismaTransactionConflictError(error)) {
      throw new CommitmentPaymentConflictError("Commitment changed while reverting payment. Please reload and try again.");
    }

    throw error;
  }
}

function parseMarkCommitmentPaidInput(payload: unknown): MarkCommitmentPaidInput {
  if (!isRecord(payload)) {
    throw new CommitmentPaymentValidationError("Request body must be an object.");
  }

  return {
    accountId: requiredString(payload.accountId, "accountId"),
    categoryId: requiredString(payload.categoryId, "categoryId"),
  };
}

async function validatePaymentReferences(tx: Prisma.TransactionClient, input: MarkCommitmentPaidInput) {
  const [account, category] = await Promise.all([
    tx.account.findFirst({ where: { id: input.accountId, activa: true } }),
    tx.category.findUnique({ where: { id: input.categoryId } }),
  ]);

  if (!account) {
    throw new CommitmentPaymentValidationError("Account not found or inactive.");
  }

  if (!category) {
    throw new CommitmentPaymentValidationError("Category not found.");
  }

  if (category.tipo !== CategoryType.GASTO) {
    throw new CommitmentPaymentValidationError("Category type must be GASTO.");
  }
}

function requiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CommitmentPaymentValidationError(`${fieldName} is required.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrismaTransactionConflictError(error: unknown) {
  return isRecord(error) && error.code === "P2034";
}
