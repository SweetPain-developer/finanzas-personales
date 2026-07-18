import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(currentDir, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(currentDir, "migrations/20260716100000_loans_receivable/migration.sql"),
  "utf8",
);

function modelBlock(modelName: string) {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) {
    throw new Error(`Model ${modelName} not found.`);
  }

  return match[1];
}

describe("Préstamos por cobrar schema", () => {
  it("models an owned loan with one delivery transaction and derived repayments", () => {
    const loan = modelBlock("Loan");

    expect(loan).toMatch(/persona\s+String/);
    expect(loan).toMatch(/montoEntregado\s+Int/);
    expect(loan).toMatch(/estado\s+LoanStatus\s+@default\(PENDIENTE\)/);
    expect(loan).toMatch(/notas\s+String\?/);
    expect(loan).toContain("userId");
    expect(loan).toMatch(/user\s+User\s+@relation\("UserLoans", fields: \[userId\], references: \[id\], onDelete: Restrict, onUpdate: Cascade\)/);
    expect(loan).toMatch(/entregaTransactionId\s+String\s+@unique/);
    expect(loan).toMatch(
      /entregaTransaction\s+Transaction\s+@relation\("LoanDelivery", fields: \[entregaTransactionId, userId\], references: \[id, userId\]/,
    );
    expect(loan).toMatch(/devoluciones\s+LoanRepayment\[\]/);
    expect(loan).not.toContain("montoDevuelto");
    expect(loan).not.toMatch(/\btransferId\b|\bcategoryId\b|\bcategory\b/);
    expect(loan).toContain("@@unique([id, userId])");
    expect(loan).toContain("@@unique([entregaTransactionId, userId])");
  });

  it("models each repayment as an owned, uniquely linked transaction", () => {
    const repayment = modelBlock("LoanRepayment");

    expect(repayment).toMatch(/monto\s+Int/);
    expect(repayment).toMatch(/loanId\s+String/);
    expect(repayment).toMatch(
      /loan\s+Loan\s+@relation\("LoanRepaymentLoan", fields: \[loanId, userId\], references: \[id, userId\]/,
    );
    expect(repayment).toMatch(/transactionId\s+String\s+@unique/);
    expect(repayment).toMatch(
      /transaction\s+Transaction\s+@relation\("LoanRepaymentTransaction", fields: \[transactionId, userId\], references: \[id, userId\]/,
    );
    expect(repayment).toMatch(
      /user\s+User\s+@relation\("UserLoanRepayments", fields: \[userId\], references: \[id\], onDelete: Restrict, onUpdate: Cascade\)/,
    );
    expect(repayment).toContain("@@unique([transactionId, userId])");
  });

  it("adds reverse relations and the loan status enum", () => {
    const user = modelBlock("User");
    const transaction = modelBlock("Transaction");

    expect(user).toMatch(/loans\s+Loan\[\]/);
    expect(user).toMatch(/loanRepayments\s+LoanRepayment\[\]/);
    expect(transaction).toMatch(/loanDelivery\s+Loan\?\s+@relation\("LoanDelivery"\)/);
    expect(transaction).toMatch(/loanRepayment\s+LoanRepayment\?\s+@relation\("LoanRepaymentTransaction"\)/);
    expect(schema).toMatch(/enum LoanStatus \{\s*PENDIENTE\s+SALDADO\s+INCOBRABLE\s*\}/);
  });

  it("defines a structural migration with positive checks and restricted foreign keys only", () => {
    expect(migration).toContain('CREATE TYPE "LoanStatus" AS ENUM');
    expect(migration).toContain('CREATE TABLE "loans"');
    expect(migration).toContain('CREATE TABLE "loan_repayments"');
    expect(migration).toContain('CONSTRAINT "loans_montoEntregado_positive_check" CHECK ("montoEntregado" > 0)');
    expect(migration).toContain('CONSTRAINT "loan_repayments_monto_positive_check" CHECK ("monto" > 0)');
    expect(migration).toContain('CREATE UNIQUE INDEX "loans_id_userId_key" ON "loans"("id", "userId")');
    expect(migration).toContain('CREATE UNIQUE INDEX "transactions_id_userId_key" ON "transactions"("id", "userId")');
    expect(migration).toContain(
      'CONSTRAINT "loans_entregaTransactionId_fkey"\n  FOREIGN KEY ("entregaTransactionId", "userId") REFERENCES "transactions"("id", "userId")',
    );
    expect(migration).toContain(
      'CONSTRAINT "loan_repayments_loanId_fkey"\n  FOREIGN KEY ("loanId", "userId") REFERENCES "loans"("id", "userId")',
    );
    expect(migration).toContain(
      'CONSTRAINT "loan_repayments_transactionId_fkey"\n  FOREIGN KEY ("transactionId", "userId") REFERENCES "transactions"("id", "userId")',
    );
    expect(migration).toContain('CONSTRAINT "loans_userId_fkey"\n  FOREIGN KEY ("userId") REFERENCES "users"("id")\n  ON DELETE RESTRICT');
    expect(migration).toContain('CONSTRAINT "loan_repayments_userId_fkey"\n  FOREIGN KEY ("userId") REFERENCES "users"("id")\n  ON DELETE RESTRICT');
    expect(migration).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
  });
});
