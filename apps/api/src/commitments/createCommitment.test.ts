import { CommitmentStatus, CommitmentType, type Commitment } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { CommitmentCreateValidationError, createCommitment } from "./createCommitment.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    commitment: {
      create: vi.fn(),
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

const createCommitmentRecord = prisma.commitment.create as Mock;
const updateAccount = prisma.account.update as Mock;
const createTransaction = prisma.transaction.create as Mock;
const createCommitmentTemplate = prisma.commitmentTemplate.create as Mock;
const updateCommitmentTemplate = prisma.commitmentTemplate.update as Mock;

describe("createCommitment", () => {
  beforeEach(() => {
    createCommitmentRecord.mockReset();
    updateAccount.mockReset();
    createTransaction.mockReset();
    createCommitmentTemplate.mockReset();
    updateCommitmentTemplate.mockReset();
  });

  it("creates a pending selected-month commitment without creating a transaction", async () => {
    createCommitmentRecord.mockResolvedValueOnce(commitment({ id: "commitment-internet", nombre: "Internet", monto: 29_990 }));

    const result = await createCommitment({
      nombre: "Internet",
      tipo: "RECURRENTE",
      monto: 29_990,
      month: "2026-08",
      fechaVencimiento: "2026-08-12",
      notas: "Fibra hogar",
    }, "user-demo");

    expect(result).toMatchObject({ id: "commitment-internet", nombre: "Internet", estado: CommitmentStatus.PENDIENTE });
    expect(createCommitmentRecord).toHaveBeenCalledWith({
      data: {
        nombre: "Internet",
        tipo: CommitmentType.RECURRENTE,
        monto: 29_990,
        estado: CommitmentStatus.PENDIENTE,
        fechaVencimiento: new Date("2026-08-12T00:00:00.000Z"),
        mes: 8,
        anio: 2026,
        notas: "Fibra hogar",
        templateId: null,
        userId: "user-demo",
      },
    });
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("defaults to July 2026 when month is omitted for backward compatibility", async () => {
    createCommitmentRecord.mockResolvedValueOnce(commitment({ id: "commitment-internet", nombre: "Internet", monto: 29_990 }));

    await createCommitment({
      nombre: "Internet",
      tipo: "RECURRENTE",
      monto: 29_990,
      fechaVencimiento: "2026-07-12",
      notas: "Fibra hogar",
    }, "user-demo");

    expect(createCommitmentRecord).toHaveBeenCalledWith({
      data: {
        nombre: "Internet",
        tipo: CommitmentType.RECURRENTE,
        monto: 29_990,
        estado: CommitmentStatus.PENDIENTE,
        fechaVencimiento: new Date("2026-07-12T00:00:00.000Z"),
        mes: 7,
        anio: 2026,
        notas: "Fibra hogar",
        templateId: null,
        userId: "user-demo",
      },
    });
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("accepts an explicit paid state without creating payment side effects", async () => {
    createCommitmentRecord.mockResolvedValueOnce(commitment({ id: "commitment-fee", nombre: "Cuota", tipo: CommitmentType.DEUDA, estado: CommitmentStatus.PAGADO }));

    await createCommitment({
      nombre: "Cuota",
      tipo: "DEUDA",
      monto: 50_000,
      estado: "PAGADO",
      fechaVencimiento: "2026-07-25",
    }, "user-demo");

    expect(createCommitmentRecord).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: CommitmentType.DEUDA, estado: CommitmentStatus.PAGADO, mes: 7, anio: 2026 }),
    }));
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
    { payload: { nombre: "Internet", tipo: "RECURRENTE", monto: 10_000, estado: "ATRASADO", fechaVencimiento: "2026-07-10" }, message: "Invalid commitment status." },
    { payload: { nombre: "Internet", tipo: "RECURRENTE", monto: 10_000, month: "2026-07", fechaVencimiento: "2026-08-10" }, message: "Due date must be in the selected month." },
    { payload: { nombre: "Internet", tipo: "RECURRENTE", monto: 10_000, month: "2026-13", fechaVencimiento: "2026-07-10" }, message: "Invalid commitment month format. Use YYYY-MM." },
    { payload: { nombre: "Internet", tipo: "RECURRENTE", monto: 10_000, fechaVencimiento: "2026-07-32" }, message: "Invalid due date." },
  ])("rejects invalid create payloads", async ({ payload, message }) => {
    await expect(createCommitment(payload, "user-demo")).rejects.toThrow(new CommitmentCreateValidationError(message));

    expect(createCommitmentRecord).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
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
