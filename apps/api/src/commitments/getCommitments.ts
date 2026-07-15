import { CommitmentStatus, TransactionType, type Commitment, type CommitmentTemplate } from "@prisma/client";

import { prisma } from "../prisma.js";

const commitmentPrisma = prisma as any;

export type CommitmentListItem = Pick<Commitment, "id" | "templateId" | "nombre" | "tipo" | "monto" | "estado" | "notas"> & {
  fechaVencimiento: string | null;
  dueDay: number | null;
  canRevertPayment: boolean;
};

export type CommitmentGroup = {
  status: CommitmentStatus;
  label: string;
  commitments: CommitmentListItem[];
};

export type CommitmentsData = {
  currentMonth: string;
  currentMonthLabel: string;
  summary: {
    pendingCount: number;
    pendingTotal: number;
  };
  groups: CommitmentGroup[];
};

type MonthRange = {
  value: string;
  year: number;
  month: number;
  start: Date;
};

const DEFAULT_MONTH = "2026-07";
const MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;

const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  [CommitmentStatus.PENDIENTE]: "Pendientes",
  [CommitmentStatus.PAGADO]: "Pagados",
};

const monthLabelFormatter = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

type CommitmentRecord = Pick<
  Commitment,
  "id" | "templateId" | "nombre" | "tipo" | "monto" | "estado" | "fechaVencimiento" | "notas" | "createdAt" | "paymentTransactionId"
> & {
  paymentTransaction: {
    tipo: TransactionType;
    monto: number;
    transferId: string | null;
  } | null;
};

export class CommitmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitmentValidationError";
  }
}

export async function getCommitments(userId: string, month = DEFAULT_MONTH): Promise<CommitmentsData> {
  const monthRange = parseCommitmentMonth(month);

  await generateCommitmentsFromActiveTemplates(monthRange, userId);

  const commitments = await commitmentPrisma.commitment.findMany({
    where: { anio: monthRange.year, mes: monthRange.month, userId },
    select: {
      id: true,
      templateId: true,
      nombre: true,
      tipo: true,
      monto: true,
      estado: true,
      fechaVencimiento: true,
      notas: true,
      createdAt: true,
      paymentTransactionId: true,
      paymentTransaction: {
        select: {
          tipo: true,
          monto: true,
          transferId: true,
        },
      },
    },
    orderBy: [{ fechaVencimiento: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  }) as CommitmentRecord[];

  const pendingCommitments = commitments
    .filter((commitment) => commitment.estado === CommitmentStatus.PENDIENTE)
    .sort(compareCommitmentsByDueDate);
  const paidCommitments = commitments.filter((commitment) => commitment.estado === CommitmentStatus.PAGADO);

  return {
    currentMonth: monthRange.value,
    currentMonthLabel: capitalize(monthLabelFormatter.format(monthRange.start)),
    summary: {
      pendingCount: pendingCommitments.length,
      pendingTotal: pendingCommitments.reduce((total, commitment) => total + commitment.monto, 0),
    },
    groups: [
      {
        status: CommitmentStatus.PENDIENTE,
        label: COMMITMENT_STATUS_LABELS[CommitmentStatus.PENDIENTE],
        commitments: pendingCommitments.map(toCommitmentListItem),
      },
      {
        status: CommitmentStatus.PAGADO,
        label: COMMITMENT_STATUS_LABELS[CommitmentStatus.PAGADO],
        commitments: paidCommitments.map(toCommitmentListItem),
      },
    ],
  };
}

async function generateCommitmentsFromActiveTemplates(monthRange: MonthRange, userId: string) {
  const [activeTemplates, existingTemplateCommitments] = await Promise.all([
    commitmentPrisma.commitmentTemplate.findMany({
      where: { activa: true, userId },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        montoDefault: true,
        diaVencimiento: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    commitmentPrisma.commitment.findMany({
      where: {
        anio: monthRange.year,
        mes: monthRange.month,
        userId,
        templateId: { not: null },
      },
      select: { templateId: true },
    }),
  ]) as [Array<Pick<CommitmentTemplate, "id" | "nombre" | "tipo" | "montoDefault" | "diaVencimiento">>, Array<Pick<Commitment, "templateId">>];

  const existingTemplateIds = new Set(existingTemplateCommitments.map((commitment) => commitment.templateId).filter(Boolean));
  const missingTemplates = activeTemplates.filter((template) => !existingTemplateIds.has(template.id));

  if (missingTemplates.length === 0) {
    return;
  }

  await commitmentPrisma.commitment.createMany({
    data: missingTemplates.map((template) => ({
      nombre: template.nombre,
      tipo: template.tipo,
      monto: template.montoDefault,
      estado: CommitmentStatus.PENDIENTE,
      fechaVencimiento: toTemplateDueDate(template, monthRange),
      mes: monthRange.month,
      anio: monthRange.year,
      notas: null,
      templateId: template.id,
      userId,
    })),
    skipDuplicates: true,
  });
}

function toTemplateDueDate(template: Pick<CommitmentTemplate, "diaVencimiento">, monthRange: MonthRange) {
  if (template.diaVencimiento === null) {
    return null;
  }

  const dueDay = Math.min(Math.max(template.diaVencimiento, 1), getDaysInMonth(monthRange));

  return new Date(Date.UTC(monthRange.year, monthRange.month - 1, dueDay));
}

function getDaysInMonth(monthRange: Pick<MonthRange, "year" | "month">) {
  return new Date(Date.UTC(monthRange.year, monthRange.month, 0)).getUTCDate();
}

function parseCommitmentMonth(month: string): MonthRange {
  if (!MONTH_FORMAT.test(month)) {
    throw new CommitmentValidationError("Invalid month format. Use YYYY-MM.");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));

  return { value: month, year, month: monthNumber, start };
}

function toCommitmentListItem(commitment: CommitmentRecord): CommitmentListItem {
  return {
    id: commitment.id,
    templateId: commitment.templateId,
    nombre: commitment.nombre,
    tipo: commitment.tipo,
    monto: commitment.monto,
    estado: commitment.estado,
    fechaVencimiento: commitment.fechaVencimiento ? toIsoDate(commitment.fechaVencimiento) : null,
    dueDay: commitment.fechaVencimiento ? commitment.fechaVencimiento.getUTCDate() : null,
    notas: commitment.notas,
    canRevertPayment: isPaymentReversible(commitment),
  };
}

function isPaymentReversible(commitment: CommitmentRecord) {
  return commitment.estado === CommitmentStatus.PAGADO
    && commitment.paymentTransactionId !== null
    && commitment.paymentTransaction !== null
    && commitment.paymentTransaction.tipo === TransactionType.GASTO
    && commitment.paymentTransaction.transferId === null
    && commitment.paymentTransaction.monto === commitment.monto;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function compareCommitmentsByDueDate(left: CommitmentRecord, right: CommitmentRecord) {
  const leftDueTime = left.fechaVencimiento?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDueTime = right.fechaVencimiento?.getTime() ?? Number.POSITIVE_INFINITY;

  return leftDueTime - rightDueTime;
}

function capitalize(value: string) {
  const normalized = value.replace(" de ", " ");

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
