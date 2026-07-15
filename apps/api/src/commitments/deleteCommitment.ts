import { CommitmentStatus } from "@prisma/client";

import { prisma } from "../prisma.js";

const commitmentPrisma = prisma as any;

export class CommitmentDeleteNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentDeleteNotFoundError";
  }
}

export class CommitmentDeleteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentDeleteConflictError";
  }
}

export async function deleteCommitment(id: string, userId: string): Promise<void> {
  const existingCommitment = await (commitmentPrisma.commitment.findFirst ?? commitmentPrisma.commitment.findUnique)({
    where: { id, userId },
    select: { estado: true },
  });

  if (!existingCommitment) {
    throw new CommitmentDeleteNotFoundError("Commitment not found.");
  }

  if (existingCommitment.estado === CommitmentStatus.PAGADO) {
    throw new CommitmentDeleteConflictError("Paid commitments cannot be deleted.");
  }

  const deletedCommitment = await commitmentPrisma.commitment.deleteMany({
    where: { id, userId, estado: CommitmentStatus.PENDIENTE },
  });

  if (deletedCommitment.count === 0) {
    throw new CommitmentDeleteNotFoundError("Commitment not found.");
  }
}
