-- CreateTable
CREATE TABLE "Jogador" (
    "email" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "saldoCentavos" INTEGER NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);
