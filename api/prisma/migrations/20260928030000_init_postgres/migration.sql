-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "celular" TEXT NOT NULL,
    "nascimento" TIMESTAMP(3) NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "termosAceitosEm" TIMESTAMP(3) NOT NULL,
    "ultimoLoginEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRtp" (
    "jogo" TEXT NOT NULL,
    "rtp" DOUBLE PRECISION NOT NULL,
    "atualizadoPor" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRtp_pkey" PRIMARY KEY ("jogo")
);

-- CreateTable
CREATE TABLE "JogadorRtp" (
    "email" TEXT NOT NULL,
    "jogo" TEXT NOT NULL,
    "rtp" DOUBLE PRECISION NOT NULL,
    "atualizadoPor" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JogadorRtp_pkey" PRIMARY KEY ("email","jogo")
);

-- CreateTable
CREATE TABLE "RtpAlteracao" (
    "id" SERIAL NOT NULL,
    "jogo" TEXT NOT NULL,
    "de" DOUBLE PRECISION,
    "para" DOUBLE PRECISION NOT NULL,
    "por" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RtpAlteracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JogadorRtpAlteracao" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "jogo" TEXT NOT NULL,
    "de" DOUBLE PRECISION,
    "para" DOUBLE PRECISION,
    "por" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JogadorRtpAlteracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposito" (
    "id" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "liquidoCentavos" INTEGER,
    "status" TEXT NOT NULL,
    "statusBruto" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "celular" TEXT NOT NULL,
    "email" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagoEm" TIMESTAMP(3),
    "creditadoEm" TIMESTAMP(3),

    CONSTRAINT "Deposito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rodada" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "jogo" TEXT NOT NULL,
    "apostaCentavos" INTEGER NOT NULL,
    "premioCentavos" INTEGER NOT NULL,
    "jogador" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rodada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jogador" (
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "saldoCentavos" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jogador_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "autoBalanco" BOOLEAN NOT NULL DEFAULT false,
    "janelaHoras" INTEGER NOT NULL DEFAULT 24,
    "metaHoraAtiva" BOOLEAN NOT NULL DEFAULT false,
    "metaHoraCentavos" INTEGER NOT NULL DEFAULT 0,
    "saqueExigeDeposito" BOOLEAN NOT NULL DEFAULT false,
    "saqueMinimoCentavos" INTEGER NOT NULL DEFAULT 1000,
    "bonusDiarioAtivo" BOOLEAN NOT NULL DEFAULT false,
    "bonusDiarioCentavos" INTEGER NOT NULL DEFAULT 500,
    "indicacaoAtiva" BOOLEAN NOT NULL DEFAULT true,
    "indicacaoCentavos" INTEGER NOT NULL DEFAULT 500,
    "indicacaoMinRodadas" INTEGER NOT NULL DEFAULT 1,
    "balancoAtivo" BOOLEAN NOT NULL DEFAULT false,
    "motivoBalanco" TEXT,
    "rtpsAntes" TEXT,
    "ativadoEm" TIMESTAMP(3),
    "atualizadoPor" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Saque" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "chavePix" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "motivo" TEXT,
    "saldoInformado" INTEGER,
    "decididoPor" TEXT,
    "decididoEm" TIMESTAMP(3),
    "estornadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Saque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bonus" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "jogador" TEXT NOT NULL,
    "nome" TEXT,
    "valorCentavos" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Afiliado" (
    "email" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Afiliado_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "Indicacao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "indicador" TEXT NOT NULL,
    "indicado" TEXT NOT NULL,
    "indicadoCpf" TEXT NOT NULL,
    "indicadoNome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "valorCentavos" INTEGER,
    "liberadaEm" TIMESTAMP(3),
    "creditadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Indicacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_cpf_key" ON "User"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "JogadorRtp_jogo_idx" ON "JogadorRtp"("jogo");

-- CreateIndex
CREATE INDEX "Deposito_criadoEm_idx" ON "Deposito"("criadoEm");

-- CreateIndex
CREATE INDEX "Deposito_email_idx" ON "Deposito"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Rodada_chave_key" ON "Rodada"("chave");

-- CreateIndex
CREATE INDEX "Rodada_criadoEm_idx" ON "Rodada"("criadoEm");

-- CreateIndex
CREATE INDEX "Saque_status_criadoEm_idx" ON "Saque"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "Saque_email_idx" ON "Saque"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Bonus_chave_key" ON "Bonus"("chave");

-- CreateIndex
CREATE INDEX "Bonus_criadoEm_idx" ON "Bonus"("criadoEm");

-- CreateIndex
CREATE INDEX "Bonus_jogador_idx" ON "Bonus"("jogador");

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

