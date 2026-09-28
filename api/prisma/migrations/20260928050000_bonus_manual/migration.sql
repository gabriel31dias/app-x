-- AlterTable
ALTER TABLE "Bonus" ADD COLUMN "creditadoEm" TIMESTAMP(3),
ADD COLUMN "criadoPor" TEXT,
ADD COLUMN "motivo" TEXT;

-- os bônus que já existem entraram no saldo na hora em que foram criados
UPDATE "Bonus" SET "creditadoEm" = "criadoEm";
