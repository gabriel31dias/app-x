-- CreateTable
CREATE TABLE "Deposito" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "valorCentavos" INTEGER NOT NULL,
    "liquidoCentavos" INTEGER,
    "status" TEXT NOT NULL,
    "statusBruto" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "celular" TEXT NOT NULL,
    "email" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagoEm" DATETIME
);

-- CreateTable
CREATE TABLE "Rodada" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chave" TEXT NOT NULL,
    "jogo" TEXT NOT NULL,
    "apostaCentavos" INTEGER NOT NULL,
    "premioCentavos" INTEGER NOT NULL,
    "jogador" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Deposito_criadoEm_idx" ON "Deposito"("criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Rodada_chave_key" ON "Rodada"("chave");

-- CreateIndex
CREATE INDEX "Rodada_criadoEm_idx" ON "Rodada"("criadoEm");
