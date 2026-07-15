import { CommitmentStatus, CommitmentType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { CommitmentDeleteConflictError, CommitmentDeleteNotFoundError, deleteCommitment } from "./deleteCommitment.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    commitment: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    commitmentTemplate: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const findCommitment = prisma.commitment.findUnique as Mock;
const deleteCommitmentRecord = prisma.commitment.deleteMany as Mock;
const updateAccount = prisma.account.update as Mock;
const createTransaction = prisma.transaction.create as Mock;
const deleteTransaction = prisma.transaction.delete as Mock;
const deleteManyTransactions = prisma.transaction.deleteMany as Mock;
const createCommitmentTemplate = prisma.commitmentTemplate.create as Mock;
const updateCommitmentTemplate = prisma.commitmentTemplate.update as Mock;
const deleteCommitmentTemplate = prisma.commitmentTemplate.delete as Mock;
const deleteManyCommitmentTemplates = prisma.commitmentTemplate.deleteMany as Mock;

describe("deleteCommitment", () => {
  beforeEach(() => {
    findCommitment.mockReset();
    deleteCommitmentRecord.mockReset();
    updateAccount.mockReset();
    createTransaction.mockReset();
    deleteTransaction.mockReset();
    deleteManyTransactions.mockReset();
    createCommitmentTemplate.mockReset();
    updateCommitmentTemplate.mockReset();
    deleteCommitmentTemplate.mockReset();
    deleteManyCommitmentTemplates.mockReset();
  });

  it("deletes an existing pending commitment without transaction, account, or template side effects", async () => {
    findCommitment.mockResolvedValueOnce({ estado: CommitmentStatus.PENDIENTE });
    deleteCommitmentRecord.mockResolvedValueOnce({ count: 1 });

    await deleteCommitment("commitment-light", "user-demo");

    expect(findCommitment).toHaveBeenCalledWith({
      where: { id: "commitment-light", userId: "user-demo" },
      select: { estado: true },
    });
    expect(deleteCommitmentRecord).toHaveBeenCalledWith({
      where: { id: "commitment-light", userId: "user-demo", estado: CommitmentStatus.PENDIENTE },
    });
    expect(createTransaction).not.toHaveBeenCalled();
    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(deleteManyTransactions).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(createCommitmentTemplate).not.toHaveBeenCalled();
    expect(updateCommitmentTemplate).not.toHaveBeenCalled();
    expect(deleteCommitmentTemplate).not.toHaveBeenCalled();
    expect(deleteManyCommitmentTemplates).not.toHaveBeenCalled();
  });

  it("returns a domain not found error for nonexistent commitments", async () => {
    findCommitment.mockResolvedValueOnce(null);

    await expect(deleteCommitment("missing", "user-demo")).rejects.toThrow(new CommitmentDeleteNotFoundError("Commitment not found."));

    expect(deleteCommitmentRecord).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(createCommitmentTemplate).not.toHaveBeenCalled();
  });

  it("rejects paid commitment deletion without transaction, account, or template side effects", async () => {
    findCommitment.mockResolvedValueOnce({ estado: CommitmentStatus.PAGADO });

    await expect(deleteCommitment("commitment-phone", "user-demo")).rejects.toThrow(new CommitmentDeleteConflictError("Paid commitments cannot be deleted."));

    expect(deleteCommitmentRecord).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(deleteManyTransactions).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(createCommitmentTemplate).not.toHaveBeenCalled();
    expect(updateCommitmentTemplate).not.toHaveBeenCalled();
    expect(deleteCommitmentTemplate).not.toHaveBeenCalled();
    expect(deleteManyCommitmentTemplates).not.toHaveBeenCalled();
  });

  it("returns not found if the pending delete guard does not remove a record", async () => {
    findCommitment.mockResolvedValueOnce({ estado: CommitmentStatus.PENDIENTE, tipo: CommitmentType.RECURRENTE });
    deleteCommitmentRecord.mockResolvedValueOnce({ count: 0 });

    await expect(deleteCommitment("commitment-race", "user-demo")).rejects.toThrow(new CommitmentDeleteNotFoundError("Commitment not found."));

    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(createCommitmentTemplate).not.toHaveBeenCalled();
  });

  it("scopes deletion lookup and mutation to the current user", async () => {
    findCommitment.mockResolvedValueOnce(null);

    await expect(deleteCommitment("commitment-other-user", "user-demo")).rejects.toThrow(CommitmentDeleteNotFoundError);
    expect(findCommitment).toHaveBeenCalledWith({
      where: { id: "commitment-other-user", userId: "user-demo" },
      select: { estado: true },
    });
    expect(deleteCommitmentRecord).not.toHaveBeenCalled();
  });
});
