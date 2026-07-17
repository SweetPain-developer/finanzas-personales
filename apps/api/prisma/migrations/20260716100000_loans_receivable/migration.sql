-- Structural schema for receivable loans.
-- This migration creates empty objects only; it does not backfill or assign ownership.

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDIENTE', 'SALDADO', 'INCOBRABLE');

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "montoEntregado" INTEGER NOT NULL,
    "estado" "LoanStatus" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "entregaTransactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loans_montoEntregado_positive_check" CHECK ("montoEntregado" > 0)
);

-- CreateTable
CREATE TABLE "loan_repayments" (
    "id" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "loanId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_repayments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loan_repayments_monto_positive_check" CHECK ("monto" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "loans_entregaTransactionId_key" ON "loans"("entregaTransactionId");
CREATE UNIQUE INDEX "loans_id_userId_key" ON "loans"("id", "userId");
CREATE UNIQUE INDEX "loans_entregaTransactionId_userId_key" ON "loans"("entregaTransactionId", "userId");
CREATE INDEX "loans_userId_idx" ON "loans"("userId");
CREATE INDEX "loans_userId_estado_idx" ON "loans"("userId", "estado");

CREATE UNIQUE INDEX "loan_repayments_transactionId_key" ON "loan_repayments"("transactionId");
CREATE INDEX "loan_repayments_userId_idx" ON "loan_repayments"("userId");
CREATE INDEX "loan_repayments_userId_loanId_idx" ON "loan_repayments"("userId", "loanId");
CREATE INDEX "loan_repayments_loanId_idx" ON "loan_repayments"("loanId");
CREATE UNIQUE INDEX "loan_repayments_transactionId_userId_key" ON "loan_repayments"("transactionId", "userId");

CREATE UNIQUE INDEX "transactions_id_userId_key" ON "transactions"("id", "userId");

-- AddForeignKey
ALTER TABLE "loans"
  ADD CONSTRAINT "loans_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loans"
  ADD CONSTRAINT "loans_entregaTransactionId_fkey"
  FOREIGN KEY ("entregaTransactionId", "userId") REFERENCES "transactions"("id", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_repayments"
  ADD CONSTRAINT "loan_repayments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_repayments"
  ADD CONSTRAINT "loan_repayments_loanId_fkey"
  FOREIGN KEY ("loanId", "userId") REFERENCES "loans"("id", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_repayments"
  ADD CONSTRAINT "loan_repayments_transactionId_fkey"
  FOREIGN KEY ("transactionId", "userId") REFERENCES "transactions"("id", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
