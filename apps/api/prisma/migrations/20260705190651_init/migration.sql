-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('OPERATIVA', 'AHORRO', 'DEUDA', 'RESERVA');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('GASTO', 'INGRESO');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INGRESO', 'GASTO', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "CommitmentType" AS ENUM ('RECURRENTE', 'DEUDA', 'VARIABLE');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('PENDIENTE', 'PAGADO');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVA', 'PAUSADA', 'COMPLETADA');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "AccountType" NOT NULL,
    "saldo" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "icono" TEXT NOT NULL,
    "tipo" "CategoryType" NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "tipo" "TransactionType" NOT NULL,
    "monto" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "transferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitments" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "CommitmentType" NOT NULL,
    "monto" INTEGER NOT NULL,
    "estado" "CommitmentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "fechaVencimiento" TIMESTAMP(3),
    "mes" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment_templates" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "CommitmentType" NOT NULL,
    "montoDefault" INTEGER NOT NULL,
    "diaVencimiento" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "montoObjetivo" INTEGER NOT NULL,
    "estado" "GoalStatus" NOT NULL DEFAULT 'ACTIVA',
    "notas" TEXT,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_nombre_key" ON "categories"("nombre");

-- CreateIndex
CREATE INDEX "transactions_accountId_idx" ON "transactions"("accountId");

-- CreateIndex
CREATE INDEX "transactions_fecha_idx" ON "transactions"("fecha");

-- CreateIndex
CREATE INDEX "transactions_transferId_idx" ON "transactions"("transferId");

-- Enforce the closed schema decision that transaction amounts are always positive.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_monto_positive_check" CHECK ("monto" > 0);

-- CreateIndex
CREATE INDEX "commitments_mes_anio_idx" ON "commitments"("mes", "anio");

-- CreateIndex
CREATE INDEX "commitments_templateId_idx" ON "commitments"("templateId");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "commitment_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
