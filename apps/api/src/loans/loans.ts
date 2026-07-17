import { TransactionType, type LoanStatus, type Prisma } from "@prisma/client";

import { prisma } from "../prisma.js";

const ALLOWED_ACCOUNT_TYPES = ["OPERATIVA", "AHORRO", "RESERVA"];
const PENDING = "PENDIENTE" as LoanStatus;
const SETTLED = "SALDADO" as LoanStatus;
const UNCOLLECTIBLE = "INCOBRABLE" as LoanStatus;

export class LoanValidationError extends Error { constructor(message: string) { super(message); this.name = "LoanValidationError"; } }
export class LoanNotFoundError extends Error { constructor(message = "Loan not found.") { super(message); this.name = "LoanNotFoundError"; } }
export class LoanConflictError extends Error { constructor(message: string) { super(message); this.name = "LoanConflictError"; } }

type LoanInput = { persona: string; montoEntregado: number; accountId: string; fecha?: string; descripcion?: string; notas?: string | null };
type RepaymentInput = { monto: number; accountId: string; fecha?: string; descripcion?: string; notas?: string | null };
type LoanPatch = Partial<LoanInput>;
type StatusInput = { estado: LoanStatus };

const client = prisma as any;

export async function createLoan(payload: unknown, userId: string) {
  const input = parseLoanInput(payload);
  const fecha = parseDate(input.fecha);

  return serializable(async (tx: any) => {
    const account = await findAllowedAccount(tx, input.accountId, userId);
    if (!account) throw new LoanValidationError("Account not found, inactive, or not eligible for loans.");
    const balance = await tx.account.updateMany({ where: { id: input.accountId, userId, activa: true, tipo: { in: ALLOWED_ACCOUNT_TYPES }, saldo: { gte: input.montoEntregado } }, data: { saldo: { decrement: input.montoEntregado } } });
    if (balance.count !== 1) throw new LoanConflictError("Insufficient account balance.");
    const transaction = await tx.transaction.create({ data: { tipo: TransactionType.GASTO, monto: input.montoEntregado, descripcion: input.descripcion?.trim() || `Préstamo a ${input.persona}`, fecha, notas: input.notas ?? null, accountId: input.accountId, categoryId: null, transferId: null, userId } });
    return tx.loan.create({ data: { persona: input.persona, montoEntregado: input.montoEntregado, notas: input.notas ?? null, entregaTransactionId: transaction.id, userId }, include: loanInclude });
  });
}

export async function getLoans(userId: string, estado?: LoanStatus) {
  const loans = await client.loan.findMany({ where: { userId, ...(estado ? { estado } : {}) }, include: loanInclude, orderBy: [{ estado: "asc" }, { createdAt: "desc" }] });
  const items = loans.map(toLoanDTO);
  const pending = items.filter((loan: LoanDTO) => loan.estado === PENDING);
  return { loans: items, summary: { pendingLoansTotal: pending.reduce((sum: number, loan: LoanDTO) => sum + loan.saldoPendiente, 0), pendingLoansCount: pending.length } };
}

export async function getLoanById(id: string, userId: string) {
  const loan = await client.loan.findFirst({ where: { id, userId }, include: loanInclude });
  if (!loan) throw new LoanNotFoundError();
  return toLoanDTO(loan);
}

export async function repayLoan(id: string, payload: unknown, userId: string) {
  const input = parseRepaymentInput(payload);
  const fecha = parseDate(input.fecha);
  return serializable(async (tx: any) => {
    const loan = await tx.loan.findFirst({ where: { id, userId }, include: { devoluciones: { include: repaymentInclude } } });
    if (!loan) throw new LoanNotFoundError();
    if (loan.estado !== PENDING) throw new LoanConflictError("Only pending loans can receive repayments.");
    const balance = loan.montoEntregado - loan.devoluciones.reduce((sum: number, repayment: any) => sum + repayment.monto, 0);
    if (input.monto > balance) throw new LoanValidationError("Repayment exceeds the pending balance.");
    const account = await findAllowedAccount(tx, input.accountId, userId);
    if (!account) throw new LoanValidationError("Account not found, inactive, or not eligible for loans.");
    const accountUpdate = await tx.account.updateMany({ where: { id: input.accountId, userId, activa: true, tipo: { in: ALLOWED_ACCOUNT_TYPES } }, data: { saldo: { increment: input.monto } } });
    if (accountUpdate.count !== 1) throw new LoanConflictError("Destination account is no longer available.");
    const transaction = await tx.transaction.create({ data: { tipo: TransactionType.INGRESO, monto: input.monto, descripcion: input.descripcion?.trim() || `Devolución de préstamo de ${loan.persona}`, fecha, notas: input.notas ?? null, accountId: input.accountId, categoryId: null, transferId: null, userId } });
    const repayment = await tx.loanRepayment.create({ data: { monto: input.monto, loanId: loan.id, transactionId: transaction.id, userId }, include: repaymentInclude });
    if (input.monto === balance) await tx.loan.update({ where: { id: loan.id }, data: { estado: SETTLED } });
    return repayment;
  });
}

export async function updateLoan(id: string, payload: unknown, userId: string) {
  const input = parseLoanPatch(payload);
  return serializable(async (tx: any) => {
    const loan = await tx.loan.findFirst({ where: { id, userId }, include: { entregaTransaction: { include: { account: true } }, devoluciones: true } });
    if (!loan) throw new LoanNotFoundError();
    if (loan.devoluciones.length > 0) throw new LoanConflictError("Loans with repayments cannot be edited.");
    const amount = input.montoEntregado ?? loan.montoEntregado;
    const accountId = input.accountId ?? loan.entregaTransaction.accountId;
    const account = await findAllowedAccount(tx, accountId, userId);
    if (!account) throw new LoanConflictError("Loan-linked account is inactive or no longer eligible for loans.");
    const oldAccountId = loan.entregaTransaction.accountId;
    if (oldAccountId === accountId) {
      const delta = amount - loan.montoEntregado;
      if (delta > 0) {
        const result = await tx.account.updateMany({ where: { id: accountId, userId, activa: true, tipo: { in: ALLOWED_ACCOUNT_TYPES }, saldo: { gte: delta } }, data: { saldo: { decrement: delta } } });
        if (result.count !== 1) throw new LoanConflictError("Insufficient account balance.");
      } else if (delta < 0) await changeAccount(tx, accountId, userId, -delta);
    } else {
      await changeAccount(tx, oldAccountId, userId, loan.montoEntregado);
      const result = await tx.account.updateMany({ where: { id: accountId, userId, activa: true, tipo: { in: ALLOWED_ACCOUNT_TYPES }, saldo: { gte: amount } }, data: { saldo: { decrement: amount } } });
      if (result.count !== 1) throw new LoanConflictError("Insufficient account balance.");
    }
    await tx.transaction.update({ where: { id: loan.entregaTransactionId }, data: { monto: amount, accountId, ...(input.fecha ? { fecha: parseDate(input.fecha) } : {}), ...(input.descripcion !== undefined || input.persona !== undefined ? { descripcion: input.descripcion?.trim() || `Préstamo a ${input.persona ?? loan.persona}` } : {}), ...(input.notas !== undefined ? { notas: input.notas } : {}) } });
    return tx.loan.update({ where: { id: loan.id }, data: { ...(input.persona !== undefined ? { persona: input.persona } : {}), montoEntregado: amount, ...(input.notas !== undefined ? { notas: input.notas } : {}) }, include: loanInclude });
  });
}

export async function deleteLoan(id: string, userId: string) {
  return serializable(async (tx: any) => {
    const loan = await tx.loan.findFirst({ where: { id, userId }, include: { entregaTransaction: true, devoluciones: true } });
    if (!loan) throw new LoanNotFoundError();
    if (loan.devoluciones.length > 0 || loan.estado !== PENDING) throw new LoanConflictError("Only pending loans without repayments can be deleted.");
    await changeAccount(tx, loan.entregaTransaction.accountId, userId, loan.montoEntregado);
    await tx.loan.delete({ where: { id: loan.id } });
    await tx.transaction.delete({ where: { id: loan.entregaTransactionId } });
  });
}

export async function updateLoanStatus(id: string, payload: unknown, userId: string) {
  const input = parseStatusInput(payload);
  return serializable(async (tx: any) => {
    const loan = await tx.loan.findFirst({ where: { id, userId } });
    if (!loan) throw new LoanNotFoundError();
    if (loan.estado === SETTLED || (loan.estado === PENDING && input.estado !== UNCOLLECTIBLE) || (loan.estado === UNCOLLECTIBLE && input.estado !== PENDING)) throw new LoanConflictError("Invalid loan status transition.");
    return tx.loan.update({ where: { id: loan.id }, data: { estado: input.estado }, include: loanInclude });
  });
}

const repaymentInclude = { transaction: { include: { account: { select: { id: true, nombre: true, tipo: true } } } } } as const;
export type LoanDTO = ReturnType<typeof toLoanDTO>;
export const loanInclude = { entregaTransaction: { include: { account: { select: { id: true, nombre: true, tipo: true } } } }, devoluciones: { include: repaymentInclude, orderBy: { createdAt: "asc" } } } as const;

function toLoanDTO(loan: any) {
  const repayments = loan.devoluciones ?? [];
  return { id: loan.id, persona: loan.persona, montoEntregado: loan.montoEntregado, estado: loan.estado, notas: loan.notas, fechaEntrega: loan.entregaTransaction.fecha.toISOString(), cuentaEntrega: loan.entregaTransaction.account, saldoPendiente: loan.montoEntregado - repayments.reduce((sum: number, repayment: any) => sum + repayment.monto, 0), devoluciones: repayments.map((repayment: any) => ({ id: repayment.id, monto: repayment.monto, fecha: repayment.transaction.fecha.toISOString(), notas: repayment.transaction.notas, cuentaDestino: repayment.transaction.account })) };
}

async function findAllowedAccount(tx: any, accountId: string, userId: string) { return tx.account.findFirst({ where: { id: accountId, userId, activa: true, tipo: { in: ALLOWED_ACCOUNT_TYPES } } }); }
async function changeAccount(tx: any, accountId: string, userId: string, increment: number) {
  const account = await findAllowedAccount(tx, accountId, userId);
  if (!account) throw new LoanConflictError("Loan-linked account is inactive or no longer eligible for loans.");
  const result = await tx.account.updateMany({ where: { id: accountId, userId, activa: true, tipo: { in: ALLOWED_ACCOUNT_TYPES } }, data: { saldo: { increment } } });
  if (result.count !== 1) throw new LoanConflictError("Loan-linked account is no longer available.");
}
async function serializable<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) { try { return await client.$transaction(callback, { isolationLevel: "Serializable" }); } catch (error: any) { if (error?.code === "P2034") throw new LoanConflictError("Loan changed concurrently. Please retry."); throw error; } }
function parseLoanInput(payload: unknown): LoanInput { if (!isRecord(payload)) throw new LoanValidationError("Request body must be an object."); return { persona: requiredString(payload.persona, "persona"), montoEntregado: positiveInt(payload.montoEntregado, "montoEntregado"), accountId: requiredString(payload.accountId, "accountId"), fecha: optionalString(payload.fecha, "fecha"), descripcion: optionalString(payload.descripcion, "descripcion"), notas: optionalNullableString(payload.notas, "notas") }; }
function parseLoanPatch(payload: unknown): LoanPatch { if (!isRecord(payload)) throw new LoanValidationError("Request body must be an object."); const result: LoanPatch = {}; if (payload.persona !== undefined) result.persona = requiredString(payload.persona, "persona"); if (payload.montoEntregado !== undefined) result.montoEntregado = positiveInt(payload.montoEntregado, "montoEntregado"); if (payload.accountId !== undefined) result.accountId = requiredString(payload.accountId, "accountId"); if (payload.fecha !== undefined) result.fecha = requiredString(payload.fecha, "fecha"); if (payload.descripcion !== undefined) result.descripcion = requiredString(payload.descripcion, "descripcion"); if (payload.notas !== undefined) result.notas = optionalNullableString(payload.notas, "notas"); if (Object.keys(result).length === 0) throw new LoanValidationError("At least one field is required."); return result; }
function parseRepaymentInput(payload: unknown): RepaymentInput { if (!isRecord(payload)) throw new LoanValidationError("Request body must be an object."); return { monto: positiveInt(payload.monto, "monto"), accountId: requiredString(payload.accountId, "accountId"), fecha: optionalString(payload.fecha, "fecha"), descripcion: optionalString(payload.descripcion, "descripcion"), notas: optionalNullableString(payload.notas, "notas") }; }
function parseStatusInput(payload: unknown): StatusInput { if (!isRecord(payload) || (payload.estado !== PENDING && payload.estado !== UNCOLLECTIBLE)) throw new LoanValidationError("Invalid loan status."); return { estado: payload.estado }; }
function positiveInt(value: unknown, field: string) { if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new LoanValidationError(`${field} must be an integer greater than zero.`); return value; }
function requiredString(value: unknown, field: string) { if (typeof value !== "string" || value.trim() === "") throw new LoanValidationError(`${field} is required.`); return value.trim(); }
function optionalString(value: unknown, field: string) { if (value === undefined) return undefined; return requiredString(value, field); }
function optionalNullableString(value: unknown, field: string) { if (value === null) return null; return optionalString(value, field); }
function parseDate(value?: string) { if (!value) return new Date(); const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(T.*)?$/); if (!match) throw new LoanValidationError("Invalid date."); const date = new Date(value); const calendar = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))); if (Number.isNaN(date.getTime()) || calendar.getUTCFullYear() !== Number(match[1]) || calendar.getUTCMonth() !== Number(match[2]) - 1 || calendar.getUTCDate() !== Number(match[3])) throw new LoanValidationError("Invalid date."); return date; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
