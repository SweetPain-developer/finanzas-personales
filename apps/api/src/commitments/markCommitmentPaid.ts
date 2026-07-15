import { CategoryType, CommitmentStatus, TransactionType, type Commitment } from "@prisma/client";

import { prisma } from "../prisma.js";

const commitmentPrisma = prisma as any;

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

export async function markCommitmentPaid(id: string, payload: unknown, userId: string): Promise<Commitment> {
  const commitment = await (commitmentPrisma.commitment.findFirst ?? commitmentPrisma.commitment.findUnique)({ where: { id, userId } });

  if (!commitment) {
    throw new CommitmentNotFoundError("Commitment not found.");
  }

  if (commitment.estado === CommitmentStatus.PAGADO) {
    return commitment;
  }

  const input = parseMarkCommitmentPaidInput(payload);

  return commitmentPrisma.$transaction(async (tx: any) => {
    const paidUpdate = await tx.commitment.updateMany({
      where: { id, userId, estado: CommitmentStatus.PENDIENTE },
      data: { estado: CommitmentStatus.PAGADO },
    });

    if (paidUpdate.count === 0) {
      return tx.commitment.findFirstOrThrow({ where: { id, userId } });
    }

    await validatePaymentReferences(tx, input, userId);

    const accountUpdate = await tx.account.updateMany({
      where: { id: input.accountId, userId, activa: true },
      data: { saldo: { decrement: commitment.monto } },
    });

    if (accountUpdate.count !== 1) {
      throw new CommitmentPaymentValidationError("Account not found or inactive.");
    }

    const paymentTransaction = await tx.transaction.create({
      data: {
        tipo: TransactionType.GASTO,
        monto: commitment.monto,
        descripcion: `Pago compromiso: ${commitment.nombre}`,
        accountId: input.accountId,
        categoryId: input.categoryId,
        transferId: null,
        userId,
      },
    });

    const paymentLinkUpdate = await tx.commitment.updateMany({
      where: { id, userId, estado: CommitmentStatus.PAGADO, paymentTransactionId: null },
      data: { paymentTransactionId: paymentTransaction.id },
    });

    if (paymentLinkUpdate.count !== 1) {
      throw new CommitmentPaymentConflictError("Commitment changed while recording payment.");
    }

    return (tx.commitment.findFirstOrThrow ?? tx.commitment.findUniqueOrThrow)({ where: { id, userId } });
  });
}

export async function markCommitmentUnpaid(id: string, userId: string): Promise<Commitment> {
  const commitment = await (commitmentPrisma.commitment.findFirst ?? commitmentPrisma.commitment.findUnique)({ where: { id, userId } });

  if (!commitment) {
    throw new CommitmentNotFoundError("Commitment not found.");
  }

  if (commitment.estado === CommitmentStatus.PENDIENTE) {
    throw new CommitmentPaymentValidationError("Only paid commitments can be reverted.");
  }

  try {
    return await commitmentPrisma.$transaction(async (tx: any) => {
      const currentCommitment = await (tx.commitment.findFirst ?? tx.commitment.findUnique)({ where: { id, userId } });

      if (!currentCommitment) {
        throw new CommitmentNotFoundError("Commitment not found.");
      }

      if (currentCommitment.estado === CommitmentStatus.PENDIENTE) {
        throw new CommitmentPaymentValidationError("Only paid commitments can be reverted.");
      }

      if (!currentCommitment.paymentTransactionId) {
        throw new CommitmentPaymentConflictError("Paid commitment has no linked payment transaction.");
      }

      const paymentTransaction = await (tx.transaction.findFirst ?? tx.transaction.findUnique)({ where: { id: currentCommitment.paymentTransactionId, userId } });

      if (!paymentTransaction) {
        throw new CommitmentPaymentConflictError("Linked payment transaction not found.");
      }

      if (paymentTransaction.tipo !== TransactionType.GASTO || paymentTransaction.transferId !== null || paymentTransaction.monto !== currentCommitment.monto) {
        throw new CommitmentPaymentConflictError("Linked payment transaction is not reversible.");
      }

      const unpaidUpdate = await tx.commitment.updateMany({
        where: { id, userId, estado: CommitmentStatus.PAGADO, paymentTransactionId: paymentTransaction.id },
        data: { estado: CommitmentStatus.PENDIENTE, paymentTransactionId: null },
      });

      if (unpaidUpdate.count !== 1) {
        throw new CommitmentPaymentConflictError("Commitment changed while reverting payment.");
      }

      const deletedTransaction = await tx.transaction.deleteMany({
        where: {
          id: paymentTransaction.id,
          userId,
          tipo: TransactionType.GASTO,
          monto: paymentTransaction.monto,
          accountId: paymentTransaction.accountId,
          transferId: null,
        },
      });

      if (deletedTransaction.count !== 1) {
        throw new CommitmentPaymentConflictError("Linked payment transaction changed while reverting payment.");
      }

      const accountUpdate = await tx.account.updateMany({
        where: { id: paymentTransaction.accountId, userId, activa: true },
        data: { saldo: { increment: paymentTransaction.monto } },
      });

      if (accountUpdate.count !== 1) {
        throw new CommitmentPaymentConflictError("Payment account changed while reverting payment.");
      }

      return (tx.commitment.findFirstOrThrow ?? tx.commitment.findUniqueOrThrow)({ where: { id, userId } });
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

async function validatePaymentReferences(tx: any, input: MarkCommitmentPaidInput, userId: string) {
  const [account, category] = await Promise.all([
    tx.account.findFirst({ where: { id: input.accountId, activa: true, userId } }),
    (tx.category.findFirst ?? tx.category.findUnique)({ where: { id: input.categoryId, userId } }),
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
