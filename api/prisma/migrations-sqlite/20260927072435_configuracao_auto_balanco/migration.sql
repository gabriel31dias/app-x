-- CreateTable
CREATE TABLE "Configuracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "autoBalanco" BOOLEAN NOT NULL DEFAULT false,
    "janelaHoras" INTEGER NOT NULL DEFAULT 24,
    "balancoAtivo" BOOLEAN NOT NULL DEFAULT false,
    "rtpsAntes" TEXT,
    "ativadoEm" DATETIME,
    "atualizadoPor" TEXT,
    "atualizadoEm" DATETIME NOT NULL
);
