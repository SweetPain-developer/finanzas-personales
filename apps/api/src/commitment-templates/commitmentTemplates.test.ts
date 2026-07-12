import { CommitmentType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import {
  CommitmentTemplateDeleteConflictError,
  CommitmentTemplateNotFoundError,
  CommitmentTemplateValidationError,
  createCommitmentTemplate,
  deleteCommitmentTemplate,
  getCommitmentTemplates,
  updateCommitmentTemplate,
  updateCommitmentTemplateActive,
} from "./commitmentTemplates.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    commitmentTemplate: { create: vi.fn(), delete: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    commitment: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    transaction: { create: vi.fn() },
    account: { update: vi.fn() },
  },
}));

const runTransaction = prisma.$transaction as Mock;
const executeRaw = prisma.$executeRaw as Mock;
const findManyCommitmentTemplates = prisma.commitmentTemplate.findMany as Mock;
const createCommitmentTemplateRecord = prisma.commitmentTemplate.create as Mock;
const deleteCommitmentTemplateRecord = prisma.commitmentTemplate.delete as Mock;
const findUniqueCommitmentTemplate = prisma.commitmentTemplate.findUnique as Mock;
const updateCommitmentTemplateRecord = prisma.commitmentTemplate.update as Mock;
const countCommitments = prisma.commitment.count as Mock;
const findManyCommitments = prisma.commitment.findMany as Mock;
const createManyCommitments = prisma.commitment.createMany as Mock;
const updateCommitment = prisma.commitment.update as Mock;
const deleteCommitment = prisma.commitment.delete as Mock;
const createTransaction = prisma.transaction.create as Mock;
const updateAccount = prisma.account.update as Mock;

describe("commitment templates", () => {
  beforeEach(() => {
    runTransaction.mockReset();
    runTransaction.mockImplementation(async (callback) => callback(prisma));
    executeRaw.mockReset();
    findManyCommitmentTemplates.mockReset();
    createCommitmentTemplateRecord.mockReset();
    deleteCommitmentTemplateRecord.mockReset();
    findUniqueCommitmentTemplate.mockReset();
    updateCommitmentTemplateRecord.mockReset();
    countCommitments.mockReset();
    findManyCommitments.mockReset();
    createManyCommitments.mockReset();
    updateCommitment.mockReset();
    deleteCommitment.mockReset();
    createTransaction.mockReset();
    updateAccount.mockReset();
  });

  it("lists templates with the public management fields", async () => {
    findManyCommitmentTemplates.mockResolvedValueOnce([
      commitmentTemplate({ id: "template-rent", nombre: "Arriendo", activa: true }),
      commitmentTemplate({ id: "template-play", nombre: "Play", montoDefault: 7_000, diaVencimiento: 20, activa: false }),
    ]);

    const result = await getCommitmentTemplates();

    expect(findManyCommitmentTemplates).toHaveBeenCalledWith({
      select: { id: true, nombre: true, tipo: true, montoDefault: true, diaVencimiento: true, activa: true, notas: true },
      orderBy: [{ activa: "desc" }, { nombre: "asc" }, { id: "asc" }],
    });
    expect(result).toEqual([
      { id: "template-rent", nombre: "Arriendo", tipo: CommitmentType.RECURRENTE, montoDefault: 10_000, diaVencimiento: 10, activa: true, notas: null },
      { id: "template-play", nombre: "Play", tipo: CommitmentType.RECURRENTE, montoDefault: 7_000, diaVencimiento: 20, activa: false, notas: null },
    ]);
  });

  it("creates a template without touching commitments, transactions, or account balances", async () => {
    const payload = { nombre: "Internet", tipo: CommitmentType.RECURRENTE, montoDefault: 29_990, diaVencimiento: 12, notas: "Fibra hogar" };
    createCommitmentTemplateRecord.mockResolvedValueOnce(commitmentTemplate({ id: "template-internet", ...payload }));

    const result = await createCommitmentTemplate(payload);

    expect(result.nombre).toBe("Internet");
    expect(createCommitmentTemplateRecord).toHaveBeenCalledWith({
      data: { ...payload, activa: true },
      select: { id: true, nombre: true, tipo: true, montoDefault: true, diaVencimiento: true, activa: true, notas: true },
    });
    expect(findManyCommitments).not.toHaveBeenCalled();
    expect(createManyCommitments).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
    expect(deleteCommitment).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it.each([
    { payload: null, message: "Request body must be an object." },
    { payload: { nombre: " ", tipo: CommitmentType.RECURRENTE, montoDefault: 10_000, diaVencimiento: 10 }, message: "nombre is required." },
    { payload: { nombre: "Internet", tipo: "OTRO", montoDefault: 10_000, diaVencimiento: 10 }, message: "Invalid commitment type." },
    { payload: { nombre: "Internet", tipo: CommitmentType.RECURRENTE, montoDefault: 0, diaVencimiento: 10 }, message: "montoDefault must be an integer greater than zero." },
    { payload: { nombre: "Internet", tipo: CommitmentType.RECURRENTE, montoDefault: 10_000, diaVencimiento: 32 }, message: "diaVencimiento must be an integer between 1 and 31 or null." },
  ])("rejects invalid create payloads", async ({ payload, message }) => {
    await expect(createCommitmentTemplate(payload)).rejects.toThrow(new CommitmentTemplateValidationError(message));
    expect(createCommitmentTemplateRecord).not.toHaveBeenCalled();
  });

  it("toggles a template inactive without touching commitments, transactions, or account balances", async () => {
    findUniqueCommitmentTemplate.mockResolvedValueOnce({ id: "template-rent" });
    updateCommitmentTemplateRecord.mockResolvedValueOnce(commitmentTemplate({ id: "template-rent", activa: false }));

    const result = await updateCommitmentTemplateActive("template-rent", { activa: false });

    expect(result.activa).toBe(false);
    expect(updateCommitmentTemplateRecord).toHaveBeenCalledWith({
      where: { id: "template-rent" },
      data: { activa: false },
      select: { id: true, nombre: true, tipo: true, montoDefault: true, diaVencimiento: true, activa: true, notas: true },
    });
    expect(findManyCommitments).not.toHaveBeenCalled();
    expect(createManyCommitments).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
    expect(deleteCommitment).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("toggles a template active", async () => {
    findUniqueCommitmentTemplate.mockResolvedValueOnce({ id: "template-play" });
    updateCommitmentTemplateRecord.mockResolvedValueOnce(commitmentTemplate({ id: "template-play", activa: true }));

    const result = await updateCommitmentTemplateActive("template-play", { activa: true });

    expect(result.activa).toBe(true);
    expect(updateCommitmentTemplateRecord).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "template-play" },
      data: { activa: true },
    }));
  });

  it("returns a not-found error for missing template IDs", async () => {
    findUniqueCommitmentTemplate.mockResolvedValueOnce(null);

    await expect(updateCommitmentTemplateActive("missing", { activa: false })).rejects.toThrow(
      new CommitmentTemplateNotFoundError("Commitment template not found."),
    );
    expect(updateCommitmentTemplateRecord).not.toHaveBeenCalled();
  });

  it.each([
    { payload: null, message: "Request body must be an object." },
    { payload: { activa: "false" }, message: "activa must be a boolean." },
    { payload: {}, message: "activa must be a boolean." },
  ])("rejects invalid toggle payloads", async ({ payload, message }) => {
    await expect(updateCommitmentTemplateActive("template-rent", payload as { activa?: unknown })).rejects.toThrow(
      new CommitmentTemplateValidationError(message),
    );
    expect(findUniqueCommitmentTemplate).not.toHaveBeenCalled();
    expect(updateCommitmentTemplateRecord).not.toHaveBeenCalled();
  });

  it("edits a template without mutating already generated commitments", async () => {
    const payload = { nombre: "Arriendo casa", tipo: CommitmentType.RECURRENTE, montoDefault: 360_000, diaVencimiento: 8, notas: "Reajuste", activa: false };
    findUniqueCommitmentTemplate.mockResolvedValueOnce({ id: "template-rent" });
    updateCommitmentTemplateRecord.mockResolvedValueOnce(commitmentTemplate({ id: "template-rent", ...payload }));

    const result = await updateCommitmentTemplate("template-rent", payload);

    expect(result.nombre).toBe("Arriendo casa");
    expect(updateCommitmentTemplateRecord).toHaveBeenCalledWith({
      where: { id: "template-rent" },
      data: payload,
      select: { id: true, nombre: true, tipo: true, montoDefault: true, diaVencimiento: true, activa: true, notas: true },
    });
    expect(findManyCommitments).not.toHaveBeenCalled();
    expect(createManyCommitments).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
    expect(deleteCommitment).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("returns a not-found error when editing a missing template", async () => {
    findUniqueCommitmentTemplate.mockResolvedValueOnce(null);

    await expect(updateCommitmentTemplate("missing", { nombre: "Internet", tipo: CommitmentType.RECURRENTE, montoDefault: 29_990, diaVencimiento: null })).rejects.toThrow(
      new CommitmentTemplateNotFoundError("Commitment template not found."),
    );
    expect(updateCommitmentTemplateRecord).not.toHaveBeenCalled();
  });

  it.each([
    { payload: null, message: "Request body must be an object." },
    { payload: { nombre: "Internet", tipo: CommitmentType.RECURRENTE, montoDefault: 10_000, diaVencimiento: 0 }, message: "diaVencimiento must be an integer between 1 and 31 or null." },
    { payload: { nombre: "Internet", tipo: CommitmentType.RECURRENTE, montoDefault: 10_000, diaVencimiento: null, activa: "true" }, message: "activa must be a boolean." },
  ])("rejects invalid edit payloads", async ({ payload, message }) => {
    await expect(updateCommitmentTemplate("template-rent", payload)).rejects.toThrow(new CommitmentTemplateValidationError(message));
    expect(findUniqueCommitmentTemplate).not.toHaveBeenCalled();
    expect(updateCommitmentTemplateRecord).not.toHaveBeenCalled();
  });

  it("deletes a template that has not generated commitments without side effects", async () => {
    executeRaw.mockResolvedValueOnce(1);

    await deleteCommitmentTemplate("template-play");

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.calls[0]?.[0].join(" ")).toContain("DELETE FROM \"commitment_templates\" AS ct");
    expect(executeRaw.mock.calls[0]?.[0].join(" ")).toContain("NOT EXISTS");
    expect(executeRaw.mock.calls[0]?.[0].join(" ")).toContain("FROM \"commitments\" AS c");
    expect(executeRaw.mock.calls[0]?.slice(1)).toEqual(["template-play", "template-play"]);
    expect(runTransaction).not.toHaveBeenCalled();
    expect(findUniqueCommitmentTemplate).not.toHaveBeenCalled();
    expect(countCommitments).not.toHaveBeenCalled();
    expect(deleteCommitmentTemplateRecord).not.toHaveBeenCalled();
    expect(findManyCommitments).not.toHaveBeenCalled();
    expect(createManyCommitments).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
    expect(deleteCommitment).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("returns a not-found error when deleting a missing template", async () => {
    executeRaw.mockResolvedValueOnce(0);
    findUniqueCommitmentTemplate.mockResolvedValueOnce(null);

    await expect(deleteCommitmentTemplate("missing")).rejects.toThrow(
      new CommitmentTemplateNotFoundError("Commitment template not found."),
    );

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(runTransaction).not.toHaveBeenCalled();
    expect(findUniqueCommitmentTemplate).toHaveBeenCalledWith({
      where: { id: "missing" },
      select: { id: true },
    });
    expect(countCommitments).not.toHaveBeenCalled();
    expect(deleteCommitmentTemplateRecord).not.toHaveBeenCalled();
  });

  it("blocks deleting a template that has generated commitments without side effects", async () => {
    executeRaw.mockResolvedValueOnce(0);
    findUniqueCommitmentTemplate.mockResolvedValueOnce({ id: "template-rent" });

    await expect(deleteCommitmentTemplate("template-rent")).rejects.toThrow(
      new CommitmentTemplateDeleteConflictError("Commitment template has generated commitments."),
    );

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(runTransaction).not.toHaveBeenCalled();
    expect(findUniqueCommitmentTemplate).toHaveBeenCalledWith({
      where: { id: "template-rent" },
      select: { id: true },
    });
    expect(countCommitments).not.toHaveBeenCalled();
    expect(deleteCommitmentTemplateRecord).not.toHaveBeenCalled();
    expect(findManyCommitments).not.toHaveBeenCalled();
    expect(createManyCommitments).not.toHaveBeenCalled();
    expect(updateCommitment).not.toHaveBeenCalled();
    expect(deleteCommitment).not.toHaveBeenCalled();
    expect(createTransaction).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
  });
});

function commitmentTemplate(overrides: Partial<{ id: string; nombre: string; tipo: CommitmentType; montoDefault: number; diaVencimiento: number | null; activa: boolean; notas: string | null }>) {
  return {
    id: "template",
    nombre: "Plantilla",
    tipo: CommitmentType.RECURRENTE,
    montoDefault: 10_000,
    diaVencimiento: 10,
    activa: true,
    notas: null,
    ...overrides,
  };
}
