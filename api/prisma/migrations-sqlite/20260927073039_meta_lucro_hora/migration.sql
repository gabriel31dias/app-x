-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Configuracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "autoBalanco" BOOLEAN NOT NULL DEFAULT false,
    "janelaHoras" INTEGER NOT NULL DEFAULT 24,
    "metaHoraAtiva" BOOLEAN NOT NULL DEFAULT false,
    "metaHoraCentavos" INTEGER NOT NULL DEFAULT 0,
    "balancoAtivo" BOOLEAN NOT NULL DEFAULT false,
    "motivoBalanco" TEXT,
    "rtpsAntes" TEXT,
    "ativadoEm" DATETIME,
    "atualizadoPor" TEXT,
    "atualizadoEm" DATETIME NOT NULL
);
INSERT INTO "new_Configuracao" ("ativadoEm", "atualizadoEm", "atualizadoPor", "autoBalanco", "balancoAtivo", "id", "janelaHoras", "rtpsAntes") SELECT "ativadoEm", "atualizadoEm", "atualizadoPor", "autoBalanco", "balancoAtivo", "id", "janelaHoras", "rtpsAntes" FROM "Configuracao";
DROP TABLE "Configuracao";
ALTER TABLE "new_Configuracao" RENAME TO "Configuracao";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
