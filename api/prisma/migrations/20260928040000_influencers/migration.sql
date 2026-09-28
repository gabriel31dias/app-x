-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "infCadastroCentavos" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "infComissaoBp" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "infPrimeiroDepositoCentavos" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "infSaqueMinimoCentavos" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "Influencer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "chavePix" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Influencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfluencerIndicado" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfluencerIndicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfluencerComissao" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "indicado" TEXT NOT NULL,
    "depositoId" TEXT,
    "baseCentavos" INTEGER,
    "valorCentavos" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfluencerComissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfluencerSaque" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "chavePix" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "motivo" TEXT,
    "decididoPor" TEXT,
    "decididoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfluencerSaque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_userId_key" ON "Influencer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_codigo_key" ON "Influencer"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_email_key" ON "Influencer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InfluencerIndicado_email_key" ON "InfluencerIndicado"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InfluencerIndicado_cpf_key" ON "InfluencerIndicado"("cpf");

-- CreateIndex
CREATE INDEX "InfluencerIndicado_influencerId_criadoEm_idx" ON "InfluencerIndicado"("influencerId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "InfluencerComissao_chave_key" ON "InfluencerComissao"("chave");

-- CreateIndex
CREATE INDEX "InfluencerComissao_influencerId_criadoEm_idx" ON "InfluencerComissao"("influencerId", "criadoEm");

-- CreateIndex
CREATE INDEX "InfluencerSaque_status_criadoEm_idx" ON "InfluencerSaque"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "InfluencerSaque_influencerId_idx" ON "InfluencerSaque"("influencerId");

