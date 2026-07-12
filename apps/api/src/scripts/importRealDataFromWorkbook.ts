import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

import { PrismaClient, type AccountType, type CategoryType, type CommitmentStatus, type CommitmentType, type GoalStatus, type TransactionType } from "@prisma/client";

const DEFAULT_WORKBOOK_PATH = resolve(process.cwd(), process.env.IMPORT_WORKBOOK_PATH ?? "../../docs/importacion/local-import-workbook.xlsx");
const TECHNICAL_FALLBACK_DATE = "2026-07-01";
const IMPORT_YEAR = 2026;
const IMPORT_MONTH = 7;
const MAX_XLSX_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 200;
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;

const ACCOUNT_TYPES = new Set<AccountType>(["OPERATIVA", "AHORRO", "DEUDA", "RESERVA"]);
const CATEGORY_TYPES = new Set<CategoryType>(["GASTO", "INGRESO"]);
const TRANSACTION_TYPES = new Set<TransactionType>(["GASTO", "INGRESO"]);
const COMMITMENT_TYPES = new Set<CommitmentType>(["RECURRENTE", "DEUDA", "VARIABLE"]);
const COMMITMENT_STATUSES = new Set<CommitmentStatus>(["PENDIENTE", "PAGADO"]);
const GOAL_STATUSES = new Set<GoalStatus>(["ACTIVA", "PAUSADA", "COMPLETADA"]);

export type WorkbookRow = Record<string, string | string[]> & { __rowNumber: string; __headers?: string[] };

type ImportArgs = {
  apply: boolean;
  reset: boolean;
  wipeExisting: boolean;
  workbookPath: string;
};

export type ParsedWorkbook = {
  accounts: WorkbookRow[];
  categories: WorkbookRow[];
  movements: WorkbookRow[];
  transfers: WorkbookRow[];
  commitmentTemplates: WorkbookRow[];
  commitments: WorkbookRow[];
  goals: WorkbookRow[];
};

type ImportPlan = ReturnType<typeof buildImportPlan>;

type ImportModelDelegate = {
  count(args?: unknown): Promise<number>;
  createMany(args: unknown): Promise<unknown>;
  deleteMany(args?: unknown): Promise<unknown>;
};

type ImportTransaction = {
  account: ImportModelDelegate;
  category: ImportModelDelegate;
  transaction: ImportModelDelegate;
  commitmentTemplate: ImportModelDelegate;
  commitment: ImportModelDelegate;
  goal: ImportModelDelegate;
};

type ImportPrisma = {
  $transaction(callback: (tx: ImportTransaction) => Promise<unknown>): Promise<unknown>;
};

type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

async function main() {
  const prisma = new PrismaClient();
  const args = parseArgs(process.argv.slice(2));
  const workbook = readWorkbook(args.workbookPath);
  const plan = buildImportPlan(workbook);

  printPlan(args, plan);

  if (!args.apply) {
    console.log("Dry-run only: no database writes were executed. Use --apply to import.");
    return;
  }

  try {
    await executeImportPlan(args, plan, prisma);
  } finally {
    await prisma.$disconnect();
  }

  console.log("Import applied successfully in a single transaction.");
}

export function parseArgs(argv: string[]): ImportArgs {
  let workbookPath = DEFAULT_WORKBOOK_PATH;
  let apply = false;
  let reset = false;
  let wipeExisting = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--reset") {
      reset = true;
    } else if (arg === "--wipe-existing") {
      wipeExisting = true;
    } else if (arg === "--workbook") {
      const value = argv[index + 1];
      if (!value) throw new Error("--workbook requires a file path.");
      workbookPath = resolve(process.cwd(), value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (reset && !apply) {
    throw new Error("--reset is only allowed together with --apply.");
  }
  if (wipeExisting && !apply) {
    throw new Error("--wipe-existing is only allowed together with --apply.");
  }
  if (reset && wipeExisting) {
    throw new Error("--reset and --wipe-existing cannot be combined.");
  }

  return { apply, reset, wipeExisting, workbookPath };
}

export function readWorkbook(workbookPath: string): ParsedWorkbook {
  const zip = readZipEntries(readFileSync(workbookPath));
  const sharedStrings = readSharedStrings(zip);
  const sheets = readSheetNames(zip);
  const readRows = (sheetName: string) => {
    const path = sheets.get(sheetName);
    if (!path) throw new Error(`Missing required sheet: ${sheetName}`);
    return readSheetRows(zip, path, sharedStrings);
  };

  return {
    accounts: readRows("Cuentas"),
    categories: readRows("Categorias"),
    movements: readRows("Movimientos"),
    transfers: readRows("Transferencias"),
    commitmentTemplates: readRows("Plantillas recurrentes"),
    commitments: readRows("Compromisos manuales"),
    goals: readRows("Metas"),
  };
}

export function buildImportPlan(workbook: ParsedWorkbook) {
  const warnings: string[] = [];
  validateHeaders(workbook.accounts, "Cuentas", ["id_ref", "nombre", "tipo", "saldo_actual", "activa", "orden", "notas"]);
  validateHeaders(workbook.categories, "Categorias", ["id_ref", "nombre", "tipo", "icono", "orden"]);
  validateHeaders(workbook.movements, "Movimientos", ["fecha", "tipo", "monto", "descripcion", "account_ref", "category_ref", "notas"]);
  validateHeaders(workbook.transfers, "Transferencias", ["fecha", "monto", "descripcion", "account_origen_ref", "account_destino_ref", "notas"]);
  validateHeaders(workbook.commitmentTemplates, "Plantillas recurrentes", ["id_ref", "nombre", "tipo", "monto_default", "dia_vencimiento", "activa", "notas"]);
  validateHeaders(workbook.commitments, "Compromisos manuales", ["nombre", "tipo", "monto", "estado", "fecha_vencimiento", "mes", "anio", "template_ref", "payment_transaction_ref", "notas"]);
  validateHeaders(workbook.goals, "Metas", ["nombre", "monto_objetivo", "estado", "account_ref", "notas"]);

  const accountRefs = uniqueRefs(workbook.accounts, "Cuentas", "id_ref");
  const categoryRefs = uniqueRefs(workbook.categories, "Categorias", "id_ref");
  const templateRefs = uniqueRefs(workbook.commitmentTemplates, "Plantillas recurrentes", "id_ref");
  validateUniqueSanitizedIds(workbook.accounts, "Cuentas", "id_ref", "real-account");
  validateUniqueSanitizedIds(workbook.categories, "Categorias", "id_ref", "real-category");
  validateUniqueSanitizedIds(workbook.commitmentTemplates, "Plantillas recurrentes", "id_ref", "real-commitment-template");

  const accounts = workbook.accounts.map((row) => ({
    id: idFromRef("real-account", required(row, "id_ref", "Cuentas")),
    nombre: required(row, "nombre", "Cuentas"),
    tipo: enumValue(row, "tipo", ACCOUNT_TYPES, "Cuentas"),
    saldo: integer(row, "saldo_actual", "Cuentas", { allowNegative: true }),
    activa: booleanValue(row, "activa", "Cuentas"),
    orden: integer(row, "orden", "Cuentas"),
    notas: nullable(row.notas),
  }));

  const categories = workbook.categories.map((row) => ({
    id: idFromRef("real-category", required(row, "id_ref", "Categorias")),
    nombre: required(row, "nombre", "Categorias"),
    tipo: enumValue(row, "tipo", CATEGORY_TYPES, "Categorias"),
    icono: required(row, "icono", "Categorias"),
    orden: integer(row, "orden", "Categorias"),
  }));
  const categoryTypeByRef = new Map(workbook.categories.map((row) => [required(row, "id_ref", "Categorias"), enumValue(row, "tipo", CATEGORY_TYPES, "Categorias")]));

  let fallbackMovementDates = 0;
  let fallbackTransferDates = 0;
  const movementTransactions = workbook.movements.map((row) => {
    const accountRef = ref(row, "account_ref", accountRefs, "Movimientos");
    const categoryRef = ref(row, "category_ref", categoryRefs, "Movimientos");
    const tipo = enumValue(row, "tipo", TRANSACTION_TYPES, "Movimientos");
    if (categoryTypeByRef.get(categoryRef) !== tipo) {
      throw rowError(row, "Movimientos", `category_ref '${categoryRef}' has type ${categoryTypeByRef.get(categoryRef)} but movement type is ${tipo}.`);
    }
    const rawDate = cellString(row.fecha).trim();
    if (!rawDate || rawDate === TECHNICAL_FALLBACK_DATE) fallbackMovementDates += 1;
    return {
      id: `real-transaction-movement-${row.__rowNumber}`,
      tipo,
      monto: integer(row, "monto", "Movimientos"),
      descripcion: required(row, "descripcion", "Movimientos"),
      fecha: july2026DateValue(rawDate || TECHNICAL_FALLBACK_DATE, "Movimientos", row),
      notas: nullable(row.notas),
      accountId: idFromRef("real-account", accountRef),
      categoryId: idFromRef("real-category", categoryRef),
      transferId: null,
    };
  });

  const transferTransactions = workbook.transfers.flatMap((row) => {
    const originRef = ref(row, "account_origen_ref", accountRefs, "Transferencias");
    const destinationRef = ref(row, "account_destino_ref", accountRefs, "Transferencias");
    if (originRef === destinationRef) throw rowError(row, "Transferencias", "Origin and destination accounts must be different.");
    const rawDate = cellString(row.fecha).trim();
    if (!rawDate || rawDate === TECHNICAL_FALLBACK_DATE) fallbackTransferDates += 1;
    const transferId = `real-transfer-${row.__rowNumber}`;
    const common = {
      monto: integer(row, "monto", "Transferencias"),
      descripcion: required(row, "descripcion", "Transferencias"),
      fecha: july2026DateValue(rawDate || TECHNICAL_FALLBACK_DATE, "Transferencias", row),
      notas: nullable(row.notas),
      categoryId: null,
      transferId,
    };
    return [
      { ...common, id: `real-transaction-transfer-${row.__rowNumber}-out`, tipo: "GASTO" as const, accountId: idFromRef("real-account", originRef) },
      { ...common, id: `real-transaction-transfer-${row.__rowNumber}-in`, tipo: "INGRESO" as const, accountId: idFromRef("real-account", destinationRef) },
    ];
  });

  const commitmentTemplates = workbook.commitmentTemplates.map((row) => {
    const dueDay = optionalInteger(row, "dia_vencimiento", "Plantillas recurrentes");
    if (dueDay === null) warnings.push(`Plantillas recurrentes row ${row.__rowNumber}: empty due day preserved as null.`);
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) throw rowError(row, "Plantillas recurrentes", "dia_vencimiento must be between 1 and 31.");
    return {
      id: idFromRef("real-commitment-template", required(row, "id_ref", "Plantillas recurrentes")),
      nombre: required(row, "nombre", "Plantillas recurrentes"),
      tipo: enumValue(row, "tipo", COMMITMENT_TYPES, "Plantillas recurrentes"),
      montoDefault: integer(row, "monto_default", "Plantillas recurrentes"),
      diaVencimiento: dueDay,
      activa: booleanValue(row, "activa", "Plantillas recurrentes"),
      notas: nullable(row.notas),
    };
  });

  const paymentTransactionIds = new Set(movementTransactions.map((transaction) => transaction.id));
  const commitments = workbook.commitments.map((row) => {
    const dueDate = nullable(row.fecha_vencimiento);
    const month = integer(row, "mes", "Compromisos manuales");
    const year = integer(row, "anio", "Compromisos manuales");
    if (month < 1 || month > 12) throw rowError(row, "Compromisos manuales", "mes must be between 1 and 12.");
    if (month !== IMPORT_MONTH || year !== IMPORT_YEAR) throw rowError(row, "Compromisos manuales", "mes/anio must be July 2026.");
    if (dueDate) {
      validateJuly2026DateString(dueDate, "Compromisos manuales", row);
      const parsed = new Date(`${dueDate}T00:00:00.000Z`);
      if (parsed.getUTCMonth() + 1 !== month || parsed.getUTCFullYear() !== year) {
        throw rowError(row, "Compromisos manuales", "fecha_vencimiento must match mes/anio.");
      }
    } else {
      warnings.push(`Compromisos manuales row ${row.__rowNumber}: empty due date preserved as null.`);
    }
    const templateRef = nullable(row.template_ref);
    if (templateRef && !templateRefs.has(templateRef)) throw rowError(row, "Compromisos manuales", `Unknown template_ref '${templateRef}'.`);
    const paymentRef = nullable(row.payment_transaction_ref);
    if (paymentRef && !paymentTransactionIds.has(paymentRef)) throw rowError(row, "Compromisos manuales", `Unknown payment_transaction_ref '${paymentRef}'.`);
    if (!paymentRef) warnings.push(`Compromisos manuales row ${row.__rowNumber}: empty payment link preserved as null.`);
    return {
      id: `real-commitment-${row.__rowNumber}`,
      nombre: required(row, "nombre", "Compromisos manuales"),
      tipo: enumValue(row, "tipo", COMMITMENT_TYPES, "Compromisos manuales"),
      monto: integer(row, "monto", "Compromisos manuales"),
      estado: enumValue(row, "estado", COMMITMENT_STATUSES, "Compromisos manuales"),
      fechaVencimiento: dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null,
      mes: month,
      anio: year,
      notas: nullable(row.notas),
      templateId: templateRef ? idFromRef("real-commitment-template", templateRef) : null,
      paymentTransactionId: paymentRef,
    };
  });

  const goals = workbook.goals.map((row) => ({
    id: `real-goal-${row.__rowNumber}`,
    nombre: required(row, "nombre", "Metas"),
    montoObjetivo: integer(row, "monto_objetivo", "Metas"),
    estado: enumValue(row, "estado", GOAL_STATUSES, "Metas"),
    notas: nullable(row.notas),
    accountId: idFromRef("real-account", ref(row, "account_ref", accountRefs, "Metas")),
  }));

  if (fallbackMovementDates > 0) warnings.push(`${fallbackMovementDates} movement date(s) use technical fallback ${TECHNICAL_FALLBACK_DATE}.`);
  if (fallbackTransferDates > 0) warnings.push(`${fallbackTransferDates} transfer date(s) use technical fallback ${TECHNICAL_FALLBACK_DATE}.`);

  return {
    accounts,
    categories,
    transactions: [...movementTransactions, ...transferTransactions],
    movementTransactions,
    transferTransactions,
    commitmentTemplates,
    commitments,
    goals,
    warnings,
  };
}

export async function executeImportPlan(args: Pick<ImportArgs, "apply" | "reset" | "wipeExisting">, plan: ImportPlan, prisma: ImportPrisma) {
  if (!args.apply) return;

  await prisma.$transaction(async (tx) => {
    if (args.reset) {
      await deletePriorImportedRows(tx);
    } else if (args.wipeExisting) {
      await deleteAllApplicationData(tx);
    } else {
      const existingImportedRows = await countExistingImportedRows(tx);
      if (existingImportedRows > 0) {
        throw new Error(`Found ${existingImportedRows} previously imported rows. Re-run with --reset --apply to replace only real-data import rows.`);
      }
    }

    await tx.account.createMany({ data: plan.accounts });
    await tx.category.createMany({ data: plan.categories });
    await tx.commitmentTemplate.createMany({ data: plan.commitmentTemplates });
    await tx.transaction.createMany({ data: plan.transactions });
    await tx.commitment.createMany({ data: plan.commitments });
    await tx.goal.createMany({ data: plan.goals });
  });
}

async function countExistingImportedRows(tx: ImportTransaction) {
  const counts = await Promise.all([
    tx.account.count({ where: { id: { startsWith: "real-account-" } } }),
    tx.category.count({ where: { id: { startsWith: "real-category-" } } }),
    tx.transaction.count({ where: { id: { startsWith: "real-transaction-" } } }),
    tx.commitmentTemplate.count({ where: { id: { startsWith: "real-commitment-template-" } } }),
    tx.commitment.count({ where: { id: { startsWith: "real-commitment-" } } }),
    tx.goal.count({ where: { id: { startsWith: "real-goal-" } } }),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

async function deletePriorImportedRows(tx: ImportTransaction) {
  await tx.goal.deleteMany({ where: { id: { startsWith: "real-goal-" } } });
  await tx.commitment.deleteMany({ where: { id: { startsWith: "real-commitment-" } } });
  await tx.commitmentTemplate.deleteMany({ where: { id: { startsWith: "real-commitment-template-" } } });
  await tx.transaction.deleteMany({ where: { id: { startsWith: "real-transaction-" } } });
  await tx.category.deleteMany({ where: { id: { startsWith: "real-category-" } } });
  await tx.account.deleteMany({ where: { id: { startsWith: "real-account-" } } });
}

async function deleteAllApplicationData(tx: ImportTransaction) {
  await tx.goal.deleteMany();
  await tx.commitment.deleteMany();
  await tx.commitmentTemplate.deleteMany();
  await tx.transaction.deleteMany();
  await tx.category.deleteMany();
  await tx.account.deleteMany();
}

function printPlan(args: ImportArgs, plan: ImportPlan) {
  console.log(`Workbook: ${args.workbookPath}`);
  console.log(`Mode: ${args.apply ? "APPLY" : "DRY-RUN"}${args.reset ? " with reset of prior real-data import rows" : ""}${args.wipeExisting ? " with full application data wipe" : ""}`);
  console.log("Import plan:");
  console.log(`- Accounts: ${plan.accounts.length}`);
  console.log(`- Categories: ${plan.categories.length}`);
  console.log(`- Movements: ${plan.movementTransactions.length}`);
  console.log(`- Transfers: ${plan.transferTransactions.length / 2} (${plan.transferTransactions.length} transaction rows)`);
  console.log(`- Commitment templates: ${plan.commitmentTemplates.length}`);
  console.log(`- Manual commitments: ${plan.commitments.length}`);
  console.log(`- Goals: ${plan.goals.length}`);
  if (plan.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of plan.warnings) console.log(`- ${warning}`);
  }
}

function validateHeaders(rows: WorkbookRow[], sheetName: string, expected: string[]) {
  if (rows.length === 0) throw new Error(`Sheet ${sheetName} has no data rows.`);
  const headers = rows[0]!.__headers ?? Object.keys(rows[0]!).filter((header) => !header.startsWith("__"));
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) throw new Error(`Sheet ${sheetName} has duplicate column '${header}'.`);
    seen.add(header);
  }
  for (const header of expected) {
    if (!seen.has(header)) throw new Error(`Sheet ${sheetName} is missing required column '${header}'.`);
  }
  const unexpected = headers.filter((header) => !expected.includes(header));
  if (unexpected.length > 0) throw new Error(`Sheet ${sheetName} has unexpected column '${unexpected[0]}'.`);
}

function uniqueRefs(rows: WorkbookRow[], sheetName: string, field: string) {
  const refs = new Set<string>();
  for (const row of rows) {
    const value = required(row, field, sheetName);
    if (refs.has(value)) throw rowError(row, sheetName, `Duplicate ${field} '${value}'.`);
    refs.add(value);
  }
  return refs;
}

function validateUniqueSanitizedIds(rows: WorkbookRow[], sheetName: string, field: string, prefix: string) {
  const ids = new Map<string, string>();
  for (const row of rows) {
    const value = required(row, field, sheetName);
    const id = idFromRef(prefix, value);
    const previousRef = ids.get(id);
    if (previousRef && previousRef !== value) {
      throw rowError(row, sheetName, `${field} '${value}' sanitizes to duplicate database id '${id}' already used by '${previousRef}'.`);
    }
    ids.set(id, value);
  }
}

function required(row: WorkbookRow, field: string, sheetName: string) {
  const rawValue = row[field];
  const value = typeof rawValue === "string" ? rawValue.trim() : undefined;
  if (!value) throw rowError(row, sheetName, `${field} is required.`);
  return value;
}

function ref(row: WorkbookRow, field: string, refs: Set<string>, sheetName: string) {
  const value = required(row, field, sheetName);
  if (!refs.has(value)) throw rowError(row, sheetName, `Unknown ${field} '${value}'.`);
  return value;
}

function nullable(value: string | string[] | undefined) {
  const trimmed = cellString(value).trim();
  return trimmed ? trimmed : null;
}

function integer(row: WorkbookRow, field: string, sheetName: string, options: { allowNegative?: boolean } = {}) {
  const value = required(row, field, sheetName);
  if (!/^-?\d+$/.test(value)) throw rowError(row, sheetName, `${field} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw rowError(row, sheetName, `${field} is outside the safe integer range.`);
  if (!options.allowNegative && parsed < 0) throw rowError(row, sheetName, `${field} must be zero or greater.`);
  return parsed;
}

function optionalInteger(row: WorkbookRow, field: string, sheetName: string) {
  if (!cellString(row[field]).trim()) return null;
  return integer(row, field, sheetName);
}

function cellString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function enumValue<T extends string>(row: WorkbookRow, field: string, allowed: Set<T>, sheetName: string) {
  const value = required(row, field, sheetName);
  if (!allowed.has(value as T)) throw rowError(row, sheetName, `${field} has invalid value '${value}'.`);
  return value as T;
}

function booleanValue(row: WorkbookRow, field: string, sheetName: string) {
  const value = required(row, field, sheetName);
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  throw rowError(row, sheetName, `${field} must be 1/0 or true/false.`);
}

function dateValue(value: string, sheetName: string, row: WorkbookRow) {
  validateDateString(value, sheetName, row);
  return new Date(`${value}T00:00:00.000Z`);
}

function july2026DateValue(value: string, sheetName: string, row: WorkbookRow) {
  validateJuly2026DateString(value, sheetName, row);
  return new Date(`${value}T00:00:00.000Z`);
}

function validateDateString(value: string, sheetName: string, row: WorkbookRow) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw rowError(row, sheetName, `Invalid date '${value}'. Expected YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3])) {
    throw rowError(row, sheetName, `Invalid calendar date '${value}'.`);
  }
}

function validateJuly2026DateString(value: string, sheetName: string, row: WorkbookRow) {
  validateDateString(value, sheetName, row);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.getUTCFullYear() !== IMPORT_YEAR || date.getUTCMonth() + 1 !== IMPORT_MONTH) {
    throw rowError(row, sheetName, `Date '${value}' must be in July 2026.`);
  }
}

function idFromRef(prefix: string, refValue: string) {
  return `${prefix}-${refValue.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function rowError(row: WorkbookRow, sheetName: string, message: string) {
  return new Error(`${sheetName} row ${row.__rowNumber}: ${message}`);
}

function readZipEntries(buffer: Buffer) {
  if (buffer.length > MAX_XLSX_BYTES) throw new Error(`Invalid XLSX file: file exceeds ${MAX_XLSX_BYTES} bytes.`);
  const eocdOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocdOffset === -1) throw new Error("Invalid XLSX file: ZIP end record not found.");
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, string>();
  const metadata = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  let entryCount = 0;
  let totalUncompressedSize = 0;
  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid XLSX file: malformed central directory.");
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);
    entryCount += 1;
    if (entryCount > MAX_ZIP_ENTRIES) throw new Error(`Invalid XLSX file: ZIP entry count exceeds ${MAX_ZIP_ENTRIES}.`);
    if (uncompressedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) throw new Error(`Invalid XLSX file: ZIP entry ${name} exceeds ${MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES} bytes.`);
    totalUncompressedSize += uncompressedSize;
    if (totalUncompressedSize > MAX_ZIP_UNCOMPRESSED_BYTES) throw new Error(`Invalid XLSX file: uncompressed content exceeds ${MAX_ZIP_UNCOMPRESSED_BYTES} bytes.`);
    metadata.set(name, { compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  for (const [name, entry] of metadata) {
    if (buffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) throw new Error(`Invalid XLSX file: malformed local header for ${name}.`);
    const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
    const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
    const data = entry.compressionMethod === 0 ? compressed : inflateRawSync(compressed, { finishFlush: 2, maxOutputLength: entry.uncompressedSize });
    if (data.length !== entry.uncompressedSize) throw new Error(`Invalid XLSX file: unexpected size for ${name}.`);
    entries.set(name, data.toString("utf8"));
  }
  return entries;
}

function readSharedStrings(zip: Map<string, string>) {
  const xml = zip.get("xl/sharedStrings.xml");
  if (!xml) return [];
  return [...xml.matchAll(/<si[\s\S]*?<\/si>/g)].map(([si]) => [...si.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]!)).join(""));
}

function readSheetNames(zip: Map<string, string>) {
  const workbookXml = requiredZip(zip, "xl/workbook.xml");
  const relsXml = requiredZip(zip, "xl/_rels/workbook.xml.rels");
  const rels = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = parseXmlAttributes(match[1]!);
    const id = attrs.get("Id");
    const target = attrs.get("Target");
    if (id && target) rels.set(id, target.replace(/^\//, ""));
  }
  const sheets = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<x:sheet\b([^>]*)\/>|<sheet\b([^>]*)\/>/g)) {
    const attrs = parseXmlAttributes(match[1] ?? match[2] ?? "");
    const name = attrs.get("name");
    const relationshipId = attrs.get("r:id");
    const target = relationshipId ? rels.get(relationshipId) : undefined;
    if (name && target) sheets.set(decodeXml(name), target.startsWith("xl/") ? target : `xl/${target}`);
  }
  return sheets;
}

function parseXmlAttributes(value: string) {
  return new Map([...value.matchAll(/([\w:]+)="([^"]*)"/g)].map((match) => [match[1]!, decodeXml(match[2]!)]));
}

function readSheetRows(zip: Map<string, string>, path: string, sharedStrings: string[]) {
  const xml = requiredZip(zip, path);
  const matrix = new Map<number, Map<number, string>>();
  for (const rowMatch of xml.matchAll(/<(?:\w+:)?row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const rowNumber = Number(rowMatch[1]);
    const cells = new Map<number, string>();
    for (const cellMatch of rowMatch[2]!.matchAll(/<(?:\w+:)?c\b([^\/>]*?)>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
      const attrs = cellMatch[1]!;
      const address = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!address) continue;
      const column = columnIndex(address);
      const body = cellMatch[2]!;
      const valueMatch = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
      const inlineMatch = body.match(/<(?:\w+:)?t(?: [^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/);
      const rawValue = valueMatch?.[1] ?? inlineMatch?.[1] ?? "";
      const value = attrs.includes('t="s"') && rawValue !== "" ? sharedStrings[Number(rawValue)] ?? "" : decodeXml(rawValue);
      cells.set(column, value.trim());
    }
    matrix.set(rowNumber, cells);
  }
  const headerRow = matrix.get(1);
  if (!headerRow) return [];
  const headers = [...headerRow.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
  const rows: WorkbookRow[] = [];
  for (const [rowNumber, cells] of [...matrix.entries()].sort(([a], [b]) => a - b)) {
    if (rowNumber === 1) continue;
    const row = { __rowNumber: String(rowNumber), __headers: headers } as WorkbookRow;
    headers.forEach((header, index) => {
      row[header] = cells.get(index + 1) ?? "";
    });
    if (headers.some((header) => cellString(row[header]).trim())) rows.push(row);
  }
  return rows;
}

function requiredZip(zip: Map<string, string>, path: string) {
  const value = zip.get(path);
  if (value === undefined) throw new Error(`Invalid XLSX file: missing ${path}.`);
  return value;
}

function columnIndex(column: string) {
  return [...column].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
