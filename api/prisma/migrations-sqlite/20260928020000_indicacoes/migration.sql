-- CreateTable
CREATE TABLE "Afiliado" (
    "email" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Indicacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "indicador" TEXT NOT NULL,
    "indicado" TEXT NOT NULL,
    "indicadoCpf" TEXT NOT NULL,
    "indicadoNome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "valorCentavos" INTEGER,
    "liberadaEm" DATETIME,
    "creditadoEm" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN "indicacaoAtiva" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Configuracao" ADD COLUMN "indicacaoCentavos" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "Configuracao" ADD COLUMN "indicacaoMinRodadas" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "Afiliado_codigo_key" ON "Afiliado"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Indicacao_indicado_key" ON "Indicacao"("indicado");

-- CreateIndex
CREATE UNIQUE INDEX "Indicacao_indicadoCpf_key" ON "Indicacao"("indicadoCpf");

-- CreateIndex
CREATE INDEX "Indicacao_indicador_idx" ON "Indicacao"("indicador");

-- CreateIndex
CREATE INDEX "Indicacao_criadoEm_idx" ON "Indicacao"("criadoEm");

