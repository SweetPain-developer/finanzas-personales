ALTER TABLE "commitments" ADD COLUMN "paymentTransactionId" TEXT;

CREATE UNIQUE INDEX "commitments_paymentTransactionId_key" ON "commitments"("paymentTransactionId");

ALTER TABLE "commitments"
  ADD CONSTRAINT "commitments_paymentTransactionId_fkey"
  FOREIGN KEY ("paymentTransactionId") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
