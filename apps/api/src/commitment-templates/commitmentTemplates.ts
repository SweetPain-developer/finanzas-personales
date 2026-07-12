import { CommitmentType, type CommitmentTemplate } from "@prisma/client";

import { prisma } from "../prisma.js";

export type CommitmentTemplateListItem = Pick<
  CommitmentTemplate,
  "id" | "nombre" | "tipo" | "montoDefault" | "diaVencimiento" | "activa" | "notas"
>;

type CommitmentTemplatePayload = {
  nombre?: unknown;
  tipo?: unknown;
  montoDefault?: unknown;
  diaVencimiento?: unknown;
  notas?: unknown;
  activa?: unknown;
};

type CommitmentTemplateInput = {
  nombre: string;
  tipo: CommitmentType;
  montoDefault: number;
  diaVencimiento: number | null;
  notas?: string | null;
  activa?: boolean;
};

export class CommitmentTemplateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentTemplateNotFoundError";
  }
}

export class CommitmentTemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentTemplateValidationError";
  }
}

export class CommitmentTemplateDeleteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentTemplateDeleteConflictError";
  }
}

export async function getCommitmentTemplates(): Promise<CommitmentTemplateListItem[]> {
  return prisma.commitmentTemplate.findMany({
    select: {
      id: true,
      nombre: true,
      tipo: true,
      montoDefault: true,
      diaVencimiento: true,
      activa: true,
      notas: true,
    },
    orderBy: [{ activa: "desc" }, { nombre: "asc" }, { id: "asc" }],
  });
}

export async function createCommitmentTemplate(payload: unknown): Promise<CommitmentTemplateListItem> {
  const input = parseCommitmentTemplateInput(payload, { requireActiva: false });

  return prisma.commitmentTemplate.create({
    data: {
      nombre: input.nombre,
      tipo: input.tipo,
      montoDefault: input.montoDefault,
      diaVencimiento: input.diaVencimiento,
      notas: input.notas,
      activa: input.activa ?? true,
    },
    select: commitmentTemplateListSelect,
  });
}

export async function updateCommitmentTemplateActive(
  id: string,
  payload: CommitmentTemplatePayload,
): Promise<CommitmentTemplateListItem> {
  if (!id.trim()) {
    throw new CommitmentTemplateNotFoundError("Commitment template not found.");
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new CommitmentTemplateValidationError("Request body must be an object.");
  }

  if (typeof payload.activa !== "boolean") {
    throw new CommitmentTemplateValidationError("activa must be a boolean.");
  }

  const existingTemplate = await prisma.commitmentTemplate.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingTemplate) {
    throw new CommitmentTemplateNotFoundError("Commitment template not found.");
  }

  return prisma.commitmentTemplate.update({
    where: { id },
    data: { activa: payload.activa },
    select: commitmentTemplateListSelect,
  });
}

export async function updateCommitmentTemplate(
  id: string,
  payload: unknown,
): Promise<CommitmentTemplateListItem> {
  if (!id.trim()) {
    throw new CommitmentTemplateNotFoundError("Commitment template not found.");
  }

  const input = parseCommitmentTemplateInput(payload, { requireActiva: false });

  const existingTemplate = await prisma.commitmentTemplate.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingTemplate) {
    throw new CommitmentTemplateNotFoundError("Commitment template not found.");
  }

  return prisma.commitmentTemplate.update({
    where: { id },
    data: {
      nombre: input.nombre,
      tipo: input.tipo,
      montoDefault: input.montoDefault,
      diaVencimiento: input.diaVencimiento,
      notas: input.notas,
      ...(input.activa === undefined ? {} : { activa: input.activa }),
    },
    select: commitmentTemplateListSelect,
  });
}

export async function deleteCommitmentTemplate(id: string): Promise<void> {
  if (!id.trim()) {
    throw new CommitmentTemplateNotFoundError("Commitment template not found.");
  }

  const deletedCount = await prisma.$executeRaw`
    DELETE FROM "commitment_templates" AS ct
    WHERE ct."id" = ${id}
      AND NOT EXISTS (
        SELECT 1
        FROM "commitments" AS c
        WHERE c."templateId" = ${id}
      )
  `;

  if (deletedCount === 1) {
    return;
  }

  const existingTemplate = await prisma.commitmentTemplate.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingTemplate) {
    throw new CommitmentTemplateNotFoundError("Commitment template not found.");
  }

  throw new CommitmentTemplateDeleteConflictError("Commitment template has generated commitments.");
}

const commitmentTemplateListSelect = {
  id: true,
  nombre: true,
  tipo: true,
  montoDefault: true,
  diaVencimiento: true,
  activa: true,
  notas: true,
} as const;

function parseCommitmentTemplateInput(payload: unknown, options: { requireActiva: boolean }): CommitmentTemplateInput {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new CommitmentTemplateValidationError("Request body must be an object.");
  }

  const record = payload as CommitmentTemplatePayload;
  const tipo = record.tipo;

  if (!isCommitmentType(tipo)) {
    throw new CommitmentTemplateValidationError("Invalid commitment type.");
  }

  const montoDefault = record.montoDefault;
  if (typeof montoDefault !== "number" || !Number.isInteger(montoDefault) || montoDefault <= 0) {
    throw new CommitmentTemplateValidationError("montoDefault must be an integer greater than zero.");
  }

  if (options.requireActiva && typeof record.activa !== "boolean") {
    throw new CommitmentTemplateValidationError("activa must be a boolean.");
  }

  if (record.activa !== undefined && typeof record.activa !== "boolean") {
    throw new CommitmentTemplateValidationError("activa must be a boolean.");
  }

  return {
    nombre: requiredString(record.nombre, "nombre"),
    tipo,
    montoDefault,
    diaVencimiento: parseDueDay(record.diaVencimiento),
    notas: optionalString(record.notas, "notas"),
    activa: record.activa,
  };
}

function parseDueDay(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 31) {
    throw new CommitmentTemplateValidationError("diaVencimiento must be an integer between 1 and 31 or null.");
  }

  return value;
}

function isCommitmentType(value: unknown): value is CommitmentType {
  return value === CommitmentType.RECURRENTE || value === CommitmentType.DEUDA || value === CommitmentType.VARIABLE;
}

function requiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CommitmentTemplateValidationError(`${fieldName} is required.`);
  }

  return value.trim();
}

function optionalString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new CommitmentTemplateValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}
