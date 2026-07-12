import { CommitmentStatus, CommitmentType, type Commitment } from "@prisma/client";

import { prisma } from "../prisma.js";

type UpdateCommitmentInput = {
  nombre: string;
  tipo: CommitmentType;
  monto: number;
  month: MonthParts;
  fechaVencimiento: Date;
  notas?: string | null;
};

type MonthParts = { value: string; year: number; month: number };

const DEFAULT_MONTH = "2026-07";
const MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CommitmentUpdateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentUpdateValidationError";
  }
}

export class CommitmentUpdateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentUpdateNotFoundError";
  }
}

export class CommitmentUpdateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentUpdateConflictError";
  }
}

export async function updateCommitment(id: string, payload: unknown): Promise<Commitment> {
  const input = parseUpdateCommitmentInput(payload);

  const existingCommitment = await prisma.commitment.findUnique({
    where: { id },
    select: { estado: true },
  });

  if (!existingCommitment) {
    throw new CommitmentUpdateNotFoundError("Commitment not found.");
  }

  if (existingCommitment.estado === CommitmentStatus.PAGADO) {
    throw new CommitmentUpdateConflictError("Paid commitments cannot be edited.");
  }

  const updatedCommitment = await prisma.commitment.updateMany({
    where: { id, estado: CommitmentStatus.PENDIENTE },
    data: {
      nombre: input.nombre,
      tipo: input.tipo,
      monto: input.monto,
      fechaVencimiento: input.fechaVencimiento,
      notas: input.notas,
      mes: input.month.month,
      anio: input.month.year,
    },
  });

  if (updatedCommitment.count === 0) {
    throw new CommitmentUpdateNotFoundError("Commitment not found.");
  }

  return prisma.commitment.findUniqueOrThrow({ where: { id } });
}

function parseUpdateCommitmentInput(payload: unknown): UpdateCommitmentInput {
  if (!isRecord(payload)) {
    throw new CommitmentUpdateValidationError("Request body must be an object.");
  }

  const tipo = payload.tipo;
  if (!isCommitmentType(tipo)) {
    throw new CommitmentUpdateValidationError("Invalid commitment type.");
  }

  const monto = payload.monto;
  if (typeof monto !== "number" || !Number.isInteger(monto) || monto <= 0) {
    throw new CommitmentUpdateValidationError("Amount must be an integer greater than zero.");
  }

  const month = parseCommitmentMonth(payload.month);

  return {
    nombre: requiredString(payload.nombre, "nombre"),
    tipo,
    monto,
    month,
    fechaVencimiento: parseDueDate(payload.fechaVencimiento, month),
    notas: optionalString(payload.notas, "notas"),
  };
}

function parseCommitmentMonth(value: unknown): MonthParts {
  const month = value === undefined ? DEFAULT_MONTH : requiredString(value, "month");

  if (!MONTH_FORMAT.test(month)) {
    throw new CommitmentUpdateValidationError("Invalid commitment month format. Use YYYY-MM.");
  }

  const [year, monthNumber] = month.split("-").map(Number);

  return { value: month, year, month: monthNumber };
}

function parseDueDate(value: unknown, monthParts: MonthParts) {
  const rawDate = requiredString(value, "fechaVencimiento");
  const dateParts = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!dateParts || !isValidCalendarDate(dateParts[1], dateParts[2], dateParts[3])) {
    throw new CommitmentUpdateValidationError("Invalid due date.");
  }

  const year = Number(dateParts[1]);
  const month = Number(dateParts[2]);

  if (year !== monthParts.year || month !== monthParts.month) {
    throw new CommitmentUpdateValidationError("Due date must be in the selected month.");
  }

  return new Date(`${rawDate}T00:00:00.000Z`);
}

function isValidCalendarDate(yearValue: string, monthValue: string, dayValue: string) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isCommitmentType(value: unknown): value is CommitmentType {
  return value === CommitmentType.RECURRENTE || value === CommitmentType.DEUDA || value === CommitmentType.VARIABLE;
}

function requiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CommitmentUpdateValidationError(`${fieldName} is required.`);
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
    throw new CommitmentUpdateValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
