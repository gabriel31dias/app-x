-- CreateTable
CREATE TABLE "Saque" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "chavePix" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "motivo" TEXT,
    "saldoInformado" INTEGER,
    "decididoPor" TEXT,
    "decididoEm" DATETIME,
    "estornadoEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Saque_status_criadoEm_idx" ON "Saque"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "Saque_email_idx" ON "Saque"("email");
