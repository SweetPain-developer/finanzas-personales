import { CommitmentStatus, CommitmentType, type Commitment } from "@prisma/client";

import { prisma } from "../prisma.js";

type CreateCommitmentInput = {
  nombre: string;
  tipo: CommitmentType;
  monto: number;
  estado: CommitmentStatus;
  month: MonthParts;
  fechaVencimiento: Date;
  notas?: string;
};

type MonthParts = { value: string; year: number; month: number };

const DEFAULT_MONTH = "2026-07";
const MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CommitmentCreateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentCreateValidationError";
  }
}

export async function createCommitment(payload: unknown): Promise<Commitment> {
  const input = parseCreateCommitmentInput(payload);

  return prisma.commitment.create({
    data: {
      nombre: input.nombre,
      tipo: input.tipo,
      monto: input.monto,
      estado: input.estado,
      fechaVencimiento: input.fechaVencimiento,
      mes: input.month.month,
      anio: input.month.year,
      notas: input.notas,
      templateId: null,
    },
  });
}

function parseCreateCommitmentInput(payload: unknown): CreateCommitmentInput {
  if (!isRecord(payload)) {
    throw new CommitmentCreateValidationError("Request body must be an object.");
  }

  const tipo = payload.tipo;
  if (!isCommitmentType(tipo)) {
    throw new CommitmentCreateValidationError("Invalid commitment type.");
  }

  const monto = payload.monto;
  if (typeof monto !== "number" || !Number.isInteger(monto) || monto <= 0) {
    throw new CommitmentCreateValidationError("Amount must be an integer greater than zero.");
  }

  const month = parseCommitmentMonth(payload.month);

  return {
    nombre: requiredString(payload.nombre, "nombre"),
    tipo,
    monto,
    estado: parseCommitmentStatus(payload.estado),
    month,
    fechaVencimiento: parseDueDate(payload.fechaVencimiento, month),
    notas: optionalString(payload.notas, "notas"),
  };
}

function parseCommitmentStatus(value: unknown): CommitmentStatus {
  if (value === undefined) {
    return CommitmentStatus.PENDIENTE;
  }

  if (value === CommitmentStatus.PENDIENTE || value === CommitmentStatus.PAGADO) {
    return value;
  }

  throw new CommitmentCreateValidationError("Invalid commitment status.");
}

function parseCommitmentMonth(value: unknown): MonthParts {
  const month = value === undefined ? DEFAULT_MONTH : requiredString(value, "month");

  if (!MONTH_FORMAT.test(month)) {
    throw new CommitmentCreateValidationError("Invalid commitment month format. Use YYYY-MM.");
  }

  const [year, monthNumber] = month.split("-").map(Number);

  return { value: month, year, month: monthNumber };
}

function parseDueDate(value: unknown, monthParts: MonthParts) {
  const rawDate = requiredString(value, "fechaVencimiento");
  const dateParts = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!dateParts || !isValidCalendarDate(dateParts[1], dateParts[2], dateParts[3])) {
    throw new CommitmentCreateValidationError("Invalid due date.");
  }

  const year = Number(dateParts[1]);
  const month = Number(dateParts[2]);

  if (year !== monthParts.year || month !== monthParts.month) {
    throw new CommitmentCreateValidationError("Due date must be in the selected month.");
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
    throw new CommitmentCreateValidationError(`${fieldName} is required.`);
  }

  return value.trim();
}

function optionalString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new CommitmentCreateValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
