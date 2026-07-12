import { CommitmentStatus, CommitmentType, TransactionType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { CommitmentValidationError, getCommitments } from "./getCommitments.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    commitment: { findMany: vi.fn(), createMany: vi.fn() },
    commitmentTemplate: { findMany: vi.fn(), update: vi.fn() },
    account: { update: vi.fn() },
    transaction: { create: vi.fn() },
  },
}));

const findManyCommitments = prisma.commitment.findMany as Mock;
const createManyCommitments = prisma.commitment.createMany as Mock;
const findManyCommitmentTemplates = prisma.commitmentTemplate.findMany as Mock;
const updateCommitmentTemplate = prisma.commitmentTemplate.update as Mock;
const updateAccount = prisma.account.update as Mock;
const createTransaction = prisma.transaction.create as Mock;

describe("getCommitments", () => {
  beforeEach(() => {
    findManyCommitments.mockReset();
    createManyCommitments.mockReset();
    findManyCommitmentTemplates.mockReset();
    updateCommitmentTemplate.mockReset();
    updateAccount.mockReset();
    createTransaction.mockReset();
    findManyCommitmentTemplates.mockResolvedValue([]);
    findManyCommitments.mockResolvedValueOnce([]);
    createManyCommitments.mockResolvedValue({ count: 0 });
  });

  it("separates pending and paid commitments with pending totals", async () => {
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([
      commitment({ id: "rent", nombre: "Arriendo", monto: 350_000, estado: CommitmentStatus.PENDIENTE, fechaVencimiento: new Date("2026-07-05T00:00:00.000Z") }),
      commitment({ id: "phone", nombre: "Plan celular", monto: 15_000, estado: CommitmentStatus.PAGADO, fechaVencimiento: new Date("2026-07-03T00:00:00.000Z"), paymentTransactionId: "transaction-phone", paymentTransaction: paymentTransaction({ monto: 15_000 }) }),
      commitment({ id: "legacy-paid", nombre: "Legacy", monto: 10_000, estado: CommitmentStatus.PAGADO, fechaVencimiento: new Date("2026-07-04T00:00:00.000Z"), paymentTransactionId: null }),
      commitment({ id: "light", nombre: "Luz", tipo: CommitmentType.VARIABLE, monto: 45_000, estado: CommitmentStatus.PENDIENTE, fechaVencimiento: new Date("2026-07-15T00:00:00.000Z") }),
    ]);

    const result = await getCommitments("2026-07");

    expect(result).toEqual({
      currentMonth: "2026-07",
      currentMonthLabel: "Julio 2026",
      summary: { pendingCount: 2, pendingTotal: 395_000 },
      groups: [
        {
          status: "PENDIENTE",
          label: "Pendientes",
          commitments: [
            expect.objectContaining({ id: "rent", dueDay: 5, fechaVencimiento: "2026-07-05" }),
            expect.objectContaining({ id: "light", dueDay: 15, fechaVencimiento: "2026-07-15" }),
          ],
        },
        {
          status: "PAGADO",
          label: "Pagados",
          commitments: [
            expect.objectContaining({ id: "phone", dueDay: 3, fechaVencimiento: "2026-07-03", canRevertPayment: true }),
            expect.objectContaining({ id: "legacy-paid", dueDay: 4, fechaVencimiento: "2026-07-04", canRevertPayment: false }),
          ],
        },
      ],
    });
  });

  it("returns empty groups and zero summary when the month has no commitments", async () => {
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([]);

    const result = await getCommitments("2026-07");

    expect(result.summary).toEqual({ pendingCount: 0, pendingTotal: 0 });
    expect(result.groups).toEqual([
      { status: "PENDIENTE", label: "Pendientes", commitments: [] },
      { status: "PAGADO", label: "Pagados", commitments: [] },
    ]);
  });

  it("returns templateId for generated commitments and null for manual commitments", async () => {
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([
      commitment({
        id: "generated-rent",
        templateId: "template-rent",
        nombre: "Arriendo",
        monto: 350_000,
        fechaVencimiento: new Date("2026-07-05T00:00:00.000Z"),
      }),
      commitment({
        id: "manual-electricity",
        templateId: null,
        nombre: "Luz",
        tipo: CommitmentType.VARIABLE,
        monto: 45_000,
        fechaVencimiento: new Date("2026-07-15T00:00:00.000Z"),
        notas: "Manual",
      }),
    ]);

    const result = await getCommitments("2026-07");

    expect(findManyCommitments).toHaveBeenLastCalledWith(expect.objectContaining({
      select: expect.objectContaining({ templateId: true }),
    }));
    expect(result.groups[0]?.commitments).toEqual([
      {
        id: "generated-rent",
        templateId: "template-rent",
        nombre: "Arriendo",
        tipo: CommitmentType.RECURRENTE,
        monto: 350_000,
        estado: CommitmentStatus.PENDIENTE,
        fechaVencimiento: "2026-07-05",
        dueDay: 5,
        notas: null,
        canRevertPayment: false,
      },
      {
        id: "manual-electricity",
        templateId: null,
        nombre: "Luz",
        tipo: CommitmentType.VARIABLE,
        monto: 45_000,
        estado: CommitmentStatus.PENDIENTE,
        fechaVencimiento: "2026-07-15",
        dueDay: 15,
        notas: "Manual",
        canRevertPayment: false,
      },
    ]);
  });

  it("only marks paid commitments reversible when the linked transaction matches revert invariants", async () => {
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([
      commitment({ id: "safe", monto: 15_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-safe", paymentTransaction: paymentTransaction({ monto: 15_000 }) }),
      commitment({ id: "wrong-type", monto: 15_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-income", paymentTransaction: paymentTransaction({ tipo: TransactionType.INGRESO, monto: 15_000 }) }),
      commitment({ id: "transfer-linked", monto: 15_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-transfer", paymentTransaction: paymentTransaction({ monto: 15_000, transferId: "transfer-1" }) }),
      commitment({ id: "amount-changed", monto: 15_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-changed", paymentTransaction: paymentTransaction({ monto: 20_000 }) }),
      commitment({ id: "missing-linked", monto: 15_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: "transaction-missing", paymentTransaction: null }),
      commitment({ id: "legacy-paid", monto: 15_000, estado: CommitmentStatus.PAGADO, paymentTransactionId: null, paymentTransaction: null }),
    ]);

    const result = await getCommitments("2026-07");

    expect(result.groups[1]?.commitments).toEqual([
      expect.objectContaining({ id: "safe", canRevertPayment: true }),
      expect.objectContaining({ id: "wrong-type", canRevertPayment: false }),
      expect.objectContaining({ id: "transfer-linked", canRevertPayment: false }),
      expect.objectContaining({ id: "amount-changed", canRevertPayment: false }),
      expect.objectContaining({ id: "missing-linked", canRevertPayment: false }),
      expect.objectContaining({ id: "legacy-paid", canRevertPayment: false }),
    ]);
    expect(result.groups[1]?.commitments[0]).not.toHaveProperty("paymentTransaction");
  });

  it("filters the selected month and returns pending commitments ordered by due date", async () => {
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([
      commitment({ id: "late", estado: CommitmentStatus.PENDIENTE, fechaVencimiento: new Date("2026-08-20T00:00:00.000Z") }),
      commitment({ id: "paid", estado: CommitmentStatus.PAGADO, fechaVencimiento: new Date("2026-08-03T00:00:00.000Z") }),
      commitment({ id: "early", estado: CommitmentStatus.PENDIENTE, fechaVencimiento: new Date("2026-08-05T00:00:00.000Z") }),
      commitment({ id: "middle", estado: CommitmentStatus.PENDIENTE, fechaVencimiento: new Date("2026-08-15T00:00:00.000Z") }),
    ]);

    const result = await getCommitments("2026-08");

    expect(findManyCommitments).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { anio: 2026, mes: 8 },
    }));
    expect(result.groups[0]?.commitments).toEqual([
      expect.objectContaining({ id: "early", dueDay: 5, fechaVencimiento: "2026-08-05" }),
      expect.objectContaining({ id: "middle", dueDay: 15, fechaVencimiento: "2026-08-15" }),
      expect.objectContaining({ id: "late", dueDay: 20, fechaVencimiento: "2026-08-20" }),
    ]);
  });

  it("rejects invalid month values", async () => {
    await expect(getCommitments("2026-13")).rejects.toThrow(new CommitmentValidationError("Invalid month format. Use YYYY-MM."));
    expect(findManyCommitments).not.toHaveBeenCalled();
    expect(findManyCommitmentTemplates).not.toHaveBeenCalled();
  });

  it("generates missing pending commitments from active templates before returning the month list", async () => {
    findManyCommitmentTemplates.mockResolvedValueOnce([
      commitmentTemplate({ id: "template-rent", nombre: "Arriendo", tipo: CommitmentType.RECURRENTE, montoDefault: 350_000, diaVencimiento: 5 }),
      commitmentTemplate({ id: "template-card", nombre: "Tarjeta demo", tipo: CommitmentType.DEUDA, montoDefault: 12_345, diaVencimiento: 12 }),
    ]);
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([
      commitment({ id: "rent", nombre: "Arriendo", monto: 350_000, tipo: CommitmentType.RECURRENTE, fechaVencimiento: new Date("2026-07-05T00:00:00.000Z") }),
      commitment({ id: "card", nombre: "Tarjeta demo", monto: 12_345, tipo: CommitmentType.DEUDA, fechaVencimiento: new Date("2026-07-12T00:00:00.000Z") }),
    ]);

    const result = await getCommitments("2026-07");

    expect(findManyCommitmentTemplates).toHaveBeenCalledWith(expect.objectContaining({ where: { activa: true } }));
    expect(createManyCommitments).toHaveBeenCalledWith({
      data: [
        {
          nombre: "Arriendo",
          tipo: CommitmentType.RECURRENTE,
          monto: 350_000,
          estado: CommitmentStatus.PENDIENTE,
          fechaVencimiento: new Date("2026-07-05T00:00:00.000Z"),
          mes: 7,
          anio: 2026,
          notas: null,
          templateId: "template-rent",
        },
        {
          nombre: "Tarjeta demo",
          tipo: CommitmentType.DEUDA,
          monto: 12_345,
          estado: CommitmentStatus.PENDIENTE,
          fechaVencimiento: new Date("2026-07-12T00:00:00.000Z"),
          mes: 7,
          anio: 2026,
          notas: null,
          templateId: "template-card",
        },
      ],
      skipDuplicates: true,
    });
    expect(result.groups[0]?.commitments).toEqual([
      expect.objectContaining({ id: "rent", dueDay: 5 }),
      expect.objectContaining({ id: "card", dueDay: 12 }),
    ]);
  });

  it("does not duplicate commitments already generated for the same template and month", async () => {
    findManyCommitmentTemplates.mockResolvedValueOnce([
      commitmentTemplate({ id: "template-rent", nombre: "Arriendo", montoDefault: 350_000, diaVencimiento: 5 }),
      commitmentTemplate({ id: "template-streaming", nombre: "Streaming", montoDefault: 12_000, diaVencimiento: 20 }),
    ]);
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([{ templateId: "template-rent" }]);
    findManyCommitments.mockResolvedValueOnce([
      commitment({ id: "existing-rent", nombre: "Arriendo", monto: 350_000, fechaVencimiento: new Date("2026-07-05T00:00:00.000Z") }),
      commitment({ id: "streaming", nombre: "Streaming", monto: 12_000, fechaVencimiento: new Date("2026-07-20T00:00:00.000Z") }),
    ]);

    await getCommitments("2026-07");

    expect(createManyCommitments).toHaveBeenCalledWith({
      data: [expect.objectContaining({ nombre: "Streaming", templateId: "template-streaming" })],
      skipDuplicates: true,
    });
  });

  it("uses duplicate-safe generation when concurrent reads retry the same template month", async () => {
    findManyCommitmentTemplates.mockResolvedValue([
      commitmentTemplate({ id: "template-rent", nombre: "Arriendo", montoDefault: 350_000, diaVencimiento: 5 }),
    ]);
    findManyCommitments.mockReset();
    findManyCommitments
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([commitment({ id: "rent", nombre: "Arriendo", monto: 350_000 })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([commitment({ id: "rent", nombre: "Arriendo", monto: 350_000 })]);
    createManyCommitments.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await getCommitments("2026-07");
    await getCommitments("2026-07");

    expect(createManyCommitments).toHaveBeenCalledTimes(2);
    expect(createManyCommitments).toHaveBeenNthCalledWith(1, {
      data: [expect.objectContaining({ templateId: "template-rent", anio: 2026, mes: 7 })],
      skipDuplicates: true,
    });
    expect(createManyCommitments).toHaveBeenNthCalledWith(2, {
      data: [expect.objectContaining({ templateId: "template-rent", anio: 2026, mes: 7 })],
      skipDuplicates: true,
    });
  });

  it("skips inactive templates because only active templates are read for generation", async () => {
    findManyCommitmentTemplates.mockResolvedValueOnce([commitmentTemplate({ id: "template-active", nombre: "Active", montoDefault: 10_000 })]);
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([commitment({ id: "active", nombre: "Active", monto: 10_000 })]);

    await getCommitments("2026-07");

    expect(findManyCommitmentTemplates).toHaveBeenCalledWith(expect.objectContaining({ where: { activa: true } }));
    expect(createManyCommitments).toHaveBeenCalledWith({ data: [expect.objectContaining({ templateId: "template-active" })], skipDuplicates: true });
  });

  it("creates a generated commitment with a null due date when the active template has no due day", async () => {
    findManyCommitmentTemplates.mockResolvedValueOnce([commitmentTemplate({ id: "template-no-due-date", diaVencimiento: null })]);
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([commitment({ id: "no-due-date", fechaVencimiento: null })]);

    const result = await getCommitments("2026-07");

    expect(createManyCommitments).toHaveBeenCalledWith({
      data: [expect.objectContaining({ fechaVencimiento: null, templateId: "template-no-due-date" })],
      skipDuplicates: true,
    });
    expect(result.groups[0]?.commitments).toEqual([expect.objectContaining({ id: "no-due-date", dueDay: null, fechaVencimiento: null })]);
  });

  it.each([
    { month: "2026-02", expectedDueDate: new Date("2026-02-28T00:00:00.000Z") },
    { month: "2026-07", expectedDueDate: new Date("2026-07-31T00:00:00.000Z") },
  ])("keeps generated template due dates inside the selected month for $month", async ({ month, expectedDueDate }) => {
    findManyCommitmentTemplates.mockResolvedValueOnce([commitmentTemplate({ id: "template-end-of-month", diaVencimiento: 31 })]);
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([commitment({ id: "end-of-month", fechaVencimiento: expectedDueDate })]);

    await getCommitments(month);

    expect(createManyCommitments).toHaveBeenCalledWith({
      data: [expect.objectContaining({ fechaVencimiento: expectedDueDate, templateId: "template-end-of-month" })],
      skipDuplicates: true,
    });
  });

  it.each([
    { diaVencimiento: 0, expectedDueDate: new Date("2026-07-01T00:00:00.000Z") },
    { diaVencimiento: -5, expectedDueDate: new Date("2026-07-01T00:00:00.000Z") },
  ])("keeps generated template due dates inside the selected month when the due day is $diaVencimiento", async ({ diaVencimiento, expectedDueDate }) => {
    findManyCommitmentTemplates.mockResolvedValueOnce([commitmentTemplate({ id: "template-start-of-month", diaVencimiento })]);
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([commitment({ id: "start-of-month", fechaVencimiento: expectedDueDate })]);

    await getCommitments("2026-07");

    expect(createManyCommitments).toHaveBeenCalledWith({
      data: [expect.objectContaining({ fechaVencimiento: expectedDueDate, templateId: "template-start-of-month" })],
      skipDuplicates: true,
    });
  });

  it("does not touch transactions, account balances, or templates while generating commitments", async () => {
    findManyCommitmentTemplates.mockResolvedValueOnce([commitmentTemplate({ id: "template-rent" })]);
    findManyCommitments.mockReset();
    findManyCommitments.mockResolvedValueOnce([]);
    findManyCommitments.mockResolvedValueOnce([commitment({ id: "rent" })]);

    await getCommitments("2026-07");

    expect(createManyCommitments).toHaveBeenCalledOnce();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateCommitmentTemplate).not.toHaveBeenCalled();
  });
});

function commitment(
  overrides: Partial<{
    id: string;
    templateId: string | null;
    nombre: string;
    tipo: CommitmentType;
    monto: number;
    estado: CommitmentStatus;
    fechaVencimiento: Date | null;
    notas: string | null;
    createdAt: Date;
    paymentTransactionId: string | null;
    paymentTransaction: ReturnType<typeof paymentTransaction> | null;
  }>,
) {
  return {
    id: "commitment",
    templateId: null,
    nombre: "Compromiso",
    tipo: CommitmentType.RECURRENTE,
    monto: 10_000,
    estado: CommitmentStatus.PENDIENTE,
    fechaVencimiento: new Date("2026-07-10T00:00:00.000Z"),
    notas: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    paymentTransactionId: null,
    paymentTransaction: null,
    ...overrides,
  };
}

function paymentTransaction(
  overrides: Partial<{
    tipo: TransactionType;
    monto: number;
    transferId: string | null;
  }>,
) {
  return {
    tipo: TransactionType.GASTO,
    monto: 10_000,
    transferId: null,
    ...overrides,
  };
}

function commitmentTemplate(
  overrides: Partial<{
    id: string;
    nombre: string;
    tipo: CommitmentType;
    montoDefault: number;
    diaVencimiento: number | null;
  }>,
) {
  return {
    id: "template",
    nombre: "Plantilla",
    tipo: CommitmentType.RECURRENTE,
    montoDefault: 10_000,
    diaVencimiento: 10,
    ...overrides,
  };
}
