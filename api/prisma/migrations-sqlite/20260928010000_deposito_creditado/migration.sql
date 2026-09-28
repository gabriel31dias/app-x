-- AlterTable
ALTER TABLE "Deposito" ADD COLUMN "creditadoEm" DATETIME;

-- CreateIndex
CREATE INDEX "Deposito_email_idx" ON "Deposito"("email");

-- os já pagos foram creditados pelo navegador antes desta coluna existir: não entram de novo
UPDATE "Deposito" SET "creditadoEm" = COALESCE("pagoEm", CURRENT_TIMESTAMP) WHERE "status" = 'pago';
