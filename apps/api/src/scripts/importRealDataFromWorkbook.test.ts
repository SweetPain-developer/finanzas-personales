import { describe, expect, it, vi } from "vitest";

import { buildImportPlan, executeImportPlan, parseArgs, type ParsedWorkbook, type WorkbookRow } from "./importRealDataFromWorkbook.js";

function row(values: Record<string, string>, headers: string[], rowNumber = 2): WorkbookRow {
  return { __rowNumber: String(rowNumber), __headers: headers, ...values };
}

const headers = {
  accounts: ["id_ref", "nombre", "tipo", "saldo_actual", "activa", "orden", "notas"],
  categories: ["id_ref", "nombre", "tipo", "icono", "orden"],
  movements: ["fecha", "tipo", "monto", "descripcion", "account_ref", "category_ref", "notas"],
  transfers: ["fecha", "monto", "descripcion", "account_origen_ref", "account_destino_ref", "notas"],
  commitmentTemplates: ["id_ref", "nombre", "tipo", "monto_default", "dia_vencimiento", "activa", "notas"],
  commitments: ["nombre", "tipo", "monto", "estado", "fecha_vencimiento", "mes", "anio", "template_ref", "payment_transaction_ref", "notas"],
  goals: ["nombre", "monto_objetivo", "estado", "account_ref", "notas"],
};

function workbook(overrides: Partial<ParsedWorkbook> = {}): ParsedWorkbook {
  return {
    accounts: [
      row({ id_ref: "bank", nombre: "Bank", tipo: "OPERATIVA", saldo_actual: "1000", activa: "1", orden: "1", notas: "" }, headers.accounts, 2),
      row({ id_ref: "cash", nombre: "Cash", tipo: "RESERVA", saldo_actual: "0", activa: "1", orden: "2", notas: "" }, headers.accounts, 3),
    ],
    categories: [row({ id_ref: "food", nombre: "Food", tipo: "GASTO", icono: "🍽️", orden: "1" }, headers.categories, 2)],
    movements: [row({ fecha: "2026-07-10", tipo: "GASTO", monto: "100", descripcion: "Groceries", account_ref: "bank", category_ref: "food", notas: "" }, headers.movements, 2)],
    transfers: [row({ fecha: "2026-07-11", monto: "50", descripcion: "Savings", account_origen_ref: "bank", account_destino_ref: "cash", notas: "" }, headers.transfers, 2)],
    commitmentTemplates: [row({ id_ref: "rent", nombre: "Rent", tipo: "RECURRENTE", monto_default: "500", dia_vencimiento: "5", activa: "1", notas: "" }, headers.commitmentTemplates, 2)],
    commitments: [row({ nombre: "Rent July", tipo: "RECURRENTE", monto: "500", estado: "PENDIENTE", fecha_vencimiento: "2026-07-05", mes: "7", anio: "2026", template_ref: "rent", payment_transaction_ref: "", notas: "" }, headers.commitments, 2)],
    goals: [row({ nombre: "Emergency fund", monto_objetivo: "1000", estado: "ACTIVA", account_ref: "cash", notas: "" }, headers.goals, 2)],
    ...overrides,
  };
}

function fakePrisma(callLog: string[] = []) {
  const model = (name: string) => ({
    count: vi.fn(async () => {
      callLog.push(`${name}.count`);
      return 0;
    }),
    createMany: vi.fn(async () => {
      callLog.push(`${name}.createMany`);
    }),
    deleteMany: vi.fn(async () => {
      callLog.push(`${name}.deleteMany`);
    }),
  });
  const tx = {
    account: model("account"),
    category: model("category"),
    transaction: model("transaction"),
    commitmentTemplate: model("commitmentTemplate"),
    commitment: model("commitment"),
    goal: model("goal"),
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (txClient: typeof tx) => Promise<unknown>) => {
      callLog.push("transaction:start");
      const result = await callback(tx);
      callLog.push("transaction:end");
      return result;
    }),
  };
  return { prisma, tx };
}

describe("real-data workbook importer", () => {
  it("builds a deterministic import plan without requiring apply", () => {
    const args = parseArgs([]);
    const plan = buildImportPlan(workbook());

    expect(args.apply).toBe(false);
    expect(args.reset).toBe(false);
    expect(args.wipeExisting).toBe(false);
    expect(plan.accounts).toHaveLength(2);
    expect(plan.categories).toHaveLength(1);
    expect(plan.movementTransactions).toHaveLength(1);
    expect(plan.transferTransactions).toHaveLength(2);
    expect(plan.commitmentTemplates).toHaveLength(1);
    expect(plan.commitments).toHaveLength(1);
    expect(plan.goals).toHaveLength(1);
  });

  it("rejects reset without apply", () => {
    expect(() => parseArgs(["--reset"])).toThrow("--reset is only allowed together with --apply.");
  });

  it("guards full application wipe behind explicit apply and wipe flags", () => {
    expect(() => parseArgs(["--wipe-existing"])).toThrow("--wipe-existing is only allowed together with --apply.");
    expect(() => parseArgs(["--apply", "--reset", "--wipe-existing"])).toThrow("--reset and --wipe-existing cannot be combined.");

    const args = parseArgs(["--apply", "--wipe-existing"]);

    expect(args.apply).toBe(true);
    expect(args.reset).toBe(false);
    expect(args.wipeExisting).toBe(true);
  });

  it("does not call Prisma transaction, write, or delete methods in dry-run/default mode", async () => {
    const plan = buildImportPlan(workbook());
    const { prisma, tx } = fakePrisma();

    await executeImportPlan(parseArgs([]), plan, prisma);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    for (const delegate of [tx.account, tx.category, tx.transaction, tx.commitmentTemplate, tx.commitment, tx.goal]) {
      expect(delegate.count).not.toHaveBeenCalled();
      expect(delegate.createMany).not.toHaveBeenCalled();
      expect(delegate.deleteMany).not.toHaveBeenCalled();
    }
  });

  it("wipes all application data in dependency order before creating import rows inside one transaction", async () => {
    const plan = buildImportPlan(workbook());
    const callLog: string[] = [];
    const { prisma, tx } = fakePrisma(callLog);

    await executeImportPlan(parseArgs(["--apply", "--wipe-existing"]), plan, prisma);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(callLog).toEqual([
      "transaction:start",
      "goal.deleteMany",
      "commitment.deleteMany",
      "commitmentTemplate.deleteMany",
      "transaction.deleteMany",
      "category.deleteMany",
      "account.deleteMany",
      "account.createMany",
      "category.createMany",
      "commitmentTemplate.createMany",
      "transaction.createMany",
      "commitment.createMany",
      "goal.createMany",
      "transaction:end",
    ]);
    for (const delegate of [tx.account, tx.category, tx.transaction, tx.commitmentTemplate, tx.commitment, tx.goal]) {
      expect(delegate.count).not.toHaveBeenCalled();
    }
  });

  it("rejects movement and transfer dates outside July 2026", () => {
    expect(() =>
      buildImportPlan(workbook({ movements: [row({ fecha: "2026-08-01", tipo: "GASTO", monto: "100", descripcion: "Groceries", account_ref: "bank", category_ref: "food", notas: "" }, headers.movements, 2)] })),
    ).toThrow("Movimientos row 2: Date '2026-08-01' must be in July 2026.");

    expect(() =>
      buildImportPlan(workbook({ transfers: [row({ fecha: "2026-06-30", monto: "50", descripcion: "Savings", account_origen_ref: "bank", account_destino_ref: "cash", notas: "" }, headers.transfers, 2)] })),
    ).toThrow("Transferencias row 2: Date '2026-06-30' must be in July 2026.");
  });

  it("rejects commitments outside July 2026 even when due date is empty", () => {
    expect(() =>
      buildImportPlan(
        workbook({
          commitments: [row({ nombre: "Rent July", tipo: "RECURRENTE", monto: "500", estado: "PENDIENTE", fecha_vencimiento: "", mes: "8", anio: "2026", template_ref: "rent", payment_transaction_ref: "", notas: "" }, headers.commitments, 2)],
        }),
      ),
    ).toThrow("Compromisos manuales row 2: mes/anio must be July 2026.");
  });

  it("rejects commitment due dates that are outside July 2026", () => {
    expect(() =>
      buildImportPlan(
        workbook({
          commitments: [row({ nombre: "Rent July", tipo: "RECURRENTE", monto: "500", estado: "PENDIENTE", fecha_vencimiento: "2026-08-05", mes: "7", anio: "2026", template_ref: "rent", payment_transaction_ref: "", notas: "" }, headers.commitments, 2)],
        }),
      ),
    ).toThrow("Compromisos manuales row 2: Date '2026-08-05' must be in July 2026.");
  });

  it("rejects distinct refs that sanitize to the same database id", () => {
    expect(() =>
      buildImportPlan(
        workbook({
          accounts: [
            row({ id_ref: "cash!box", nombre: "Cash 1", tipo: "RESERVA", saldo_actual: "0", activa: "1", orden: "1", notas: "" }, headers.accounts, 2),
            row({ id_ref: "cash@box", nombre: "Cash 2", tipo: "RESERVA", saldo_actual: "0", activa: "1", orden: "2", notas: "" }, headers.accounts, 3),
          ],
        }),
      ),
    ).toThrow("sanitizes to duplicate database id 'real-account-cash-box'");
  });

  it("rejects duplicate and unexpected headers", () => {
    expect(() => buildImportPlan(workbook({ categories: [row({ id_ref: "food", nombre: "Food", tipo: "GASTO", icono: "🍽️", orden: "1" }, [...headers.categories, "tipo"], 2)] }))).toThrow(
      "Sheet Categorias has duplicate column 'tipo'.",
    );

    expect(() => buildImportPlan(workbook({ goals: [row({ nombre: "Emergency fund", monto_objetivo: "1000", estado: "ACTIVA", account_ref: "cash", notas: "", extra: "no" }, [...headers.goals, "extra"], 2)] }))).toThrow(
      "Sheet Metas has unexpected column 'extra'.",
    );
  });
});
