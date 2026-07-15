import { CommitmentStatus, CommitmentType, type Commitment } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { CommitmentUpdateConflictError, CommitmentUpdateNotFoundError, CommitmentUpdateValidationError, updateCommitment } from "./updateCommitment.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    commitment: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
    commitmentTemplate: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const updateCommitmentRecord = prisma.commitment.updateMany as Mock;
const findExistingCommitment = prisma.commitment.findUnique as Mock;
const findUpdatedCommitment = prisma.commitment.findUniqueOrThrow as Mock;
const updateAccount = prisma.account.update as Mock;
const createTransaction = prisma.transaction.create as Mock;
const createCommitmentTemplate = prisma.commitmentTemplate.create as Mock;
const updateCommitmentTemplate = prisma.commitmentTemplate.update as Mock;

describe("updateCommitment", () => {
  beforeEach(() => {
    updateCommitmentRecord.mockReset();
    findExistingCommitment.mockReset();
    findUpdatedCommitment.mockReset();
    updateAccount.mockReset();
    createTransaction.mockReset();
    createCommitmentTemplate.mockReset();
    updateCommitmentTemplate.mockReset();
  });

  it("updates an existing selected-month commitment without payment or template side effects", async () => {
    updateCommitmentRecord.mockResolvedValueOnce({ count: 1 });
    findExistingCommitment.mockResolvedValueOnce({ estado: CommitmentStatus.PENDIENTE });
    findUpdatedCommitment.mockResolvedValueOnce(commitment({ id: "commitment-light", nombre: "Luz casa", monto: 52_000, tipo: CommitmentType.VARIABLE }));

    const result = await updateCommitment("commitment-light", {
      nombre: "Luz casa",
      tipo: "VARIABLE",
      monto: 52_000,
      month: "2026-08",
      fechaVencimiento: "2026-08-18",
      notas: "Boleta ajustada",
    }, "user-demo");

    expect(result).toMatchObject({ id: "commitment-light", nombre: "Luz casa", monto: 52_000 });
    expect(updateCommitmentRecord).toHaveBeenCalledWith({
      where: { id: "commitment-light", userId: "user-demo", estado: CommitmentStatus.PENDIENTE },
      data: {
        nombre: "Luz casa",
        tipo: CommitmentType.VARIABLE,
        monto: 52_000,
        fechaVencimiento: new Date("2026-08-18T00:00:00.000Z"),
        notas: "Boleta ajustada",
        mes: 8,
        anio: 2026,
      },
    });
    expect(findUpdatedCommitment).toHaveBeenCalledWith({ where: { id: "commitment-light", userId: "user-demo" } });
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(createCommitmentTemplate).not.toHaveBeenCalled();
    expect(updateCommitmentTemplate).not.toHaveBeenCalled();
  });

  it("defaults to July 2026 when month is omitted for backward compatibility", async () => {
    updateCommitmentRecord.mockResolvedValueOnce({ count: 1 });
    findExistingCommitment.mockResolvedValueOnce({ estado: CommitmentStatus.PENDIENTE });
    findUpdatedCommitment.mockResolvedValueOnce(commitment({ id: "commitment-light", nombre: "Luz casa" }));

    await updateCommitment("commitment-light", {
      nombre: "Luz casa",
      tipo: "VARIABLE",
      monto: 52_000,
      fechaVencimiento: "2026-07-18",
    }, "user-demo");

    expect(updateCommitmentRecord).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mes: 7, anio: 2026 }),
    }));
  });

  it("stores empty notes as null", async () => {
    updateCommitmentRecord.mockResolvedValueOnce({ count: 1 });
    findExistingCommitment.mockResolvedValueOnce({ estado: CommitmentStatus.PENDIENTE });
    findUpdatedCommitment.mockResolvedValueOnce(commitment({ id: "commitment-rent", nombre: "Arriendo" }));

    await updateCommitment("commitment-rent", {
      nombre: "Arriendo",
      tipo: "RECURRENTE",
      monto: 350_000,
      fechaVencimiento: "2026-07-05",
      notas: " ",
    }, "user-demo");

    expect(updateCommitmentRecord).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ notas: null }),
    }));
  });

  it.each(["2026-07-01", "2026-07-31"])("accepts July 2026 boundary due date %s for edit", async (fechaVencimiento) => {
    updateCommitmentRecord.mockResolvedValueOnce({ count: 1 });
    findExistingCommitment.mockResolvedValueOnce({ estado: CommitmentStatus.PENDIENTE });
    findUpdatedCommitment.mockResolvedValueOnce(commitment({ id: "commitment-internet", nombre: "Internet" }));

    await updateCommitment("commitment-internet", {
      nombre: "Internet",
      tipo: "RECURRENTE",
      monto: 10_000,
      fechaVencimiento,
    }, "user-demo");

    expect(updateCommitmentRecord).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fechaVencimiento: new Date(`${fechaVencimiento}T00:00:00.000Z`),
        mes: 7,
        anio: 2026,
      }),
    }));
    expect(findUpdatedCommitment).toHaveBeenCalledWith({ where: { id: "commitment-internet", userId: "user-demo" } });
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(createCommitmentTemplate).not.toHaveBeenCalled();
    expect(updateCommitmentTemplate).not.toHaveBeenCalled();
  });

  it("rejects a due date outside the selected month for edit", async () => {
    await expect(updateCommitment("commitment-internet", {
      nombre: "Internet",
      tipo: "RECURRENTE",
      monto: 10_000,
      month: "2026-07",
      fechaVencimiento: "2026-06-30",
    }, "user-demo")).rejects.toThrow(new CommitmentUpdateValidationError("Due date must be in the selected month."));

    expect(updateCommitmentRecord).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(createCommitmentTemplate).not.toHaveBeenCalled();
    expect(updateCommitmentTemplate).not.toHaveBeenCalled();
  });

  it("returns a domain not found error for nonexistent commitments", async () => {
    updateCommitmentRecord.mockResolvedValueOnce({ count: 0 });
    findExistingCommitment.mockResolvedValueOnce(null);

    await expect(updateCommitment("missing", {
      nombre: "Internet",
      tipo: "RECURRENTE",
      monto: 29_990,
      fechaVencimiento: "2026-07-12",
    }, "user-demo")).rejects.toThrow(new CommitmentUpdateNotFoundError("Commitment not found."));

    expect(findUpdatedCommitment).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("rejects paid commitment edits without payment, account, transaction, or template side effects", async () => {
    findExistingCommitment.mockResolvedValueOnce({ estado: CommitmentStatus.PAGADO });

    await expect(updateCommitment("commitment-phone", {
      nombre: "Plan celular ajustado",
      tipo: "RECURRENTE",
      monto: 20_000,
      fechaVencimiento: "2026-07-03",
    }, "user-demo")).rejects.toThrow(new CommitmentUpdateConflictError("Paid commitments cannot be edited."));

    expect(updateCommitmentRecord).not.toHaveBeenCalled();
    expect(findUpdatedCommitment).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(createCommitmentTemplate).not.toHaveBeenCalled();
    expect(updateCommitmentTemplate).not.toHaveBeenCalled();
  });

  it.each([
    { payload: null, message: "Request body must be an object." },
    { payload: { tipo: "RECURRENTE", monto: 10_000, fechaVencimiento: "2026-07-10" }, message: "nombre is required." },
    { payload: { nombre: "Internet", tipo: "OTRO", monto: 10_000, fechaVencimiento: "2026-07-10" }, message: "Invalid commitment type." },
    { payload: { nombre: "Internet", tipo: "RECURRENTE", monto: 0, fechaVencimiento: "2026-07-10" }, message: "Amount must be an integer greater than zero." },
    { payload: { nombre: "Internet", tipo: "RECURRENTE", monto: 10_000, month: "2026-07", fechaVencimiento: "2026-08-10" }, message: "Due date must be in the selected month." },
    { payload: { nombre: "Internet", tipo: "RECURRENTE", monto: 10_000, month: "2026-13", fechaVencimiento: "2026-07-10" }, message: "Invalid commitment month format. Use YYYY-MM." },
    { payload: { nombre: "Internet", tipo: "RECURRENTE", monto: 10_000, fechaVencimiento: "2026-07-32" }, message: "Invalid due date." },
  ])("rejects invalid update payloads", async ({ payload, message }) => {
    await expect(updateCommitment("commitment-internet", payload, "user-demo")).rejects.toThrow(new CommitmentUpdateValidationError(message));

    expect(updateCommitmentRecord).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(createCommitmentTemplate).not.toHaveBeenCalled();
    expect(updateCommitmentTemplate).not.toHaveBeenCalled();
  });
});

function commitment(overrides: Partial<Commitment> & { id: string; nombre: string }): Commitment {
  const base: Commitment = {
    id: "commitment",
    nombre: "Compromiso",
    tipo: CommitmentType.RECURRENTE,
    monto: 10_000,
    estado: CommitmentStatus.PENDIENTE,
    fechaVencimiento: new Date("2026-07-10T00:00:00.000Z"),
    mes: 7,
    anio: 2026,
    notas: null,
    userId: "user-demo",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    templateId: null,
    paymentTransactionId: null,
  };

  return { ...base, ...overrides };
}
