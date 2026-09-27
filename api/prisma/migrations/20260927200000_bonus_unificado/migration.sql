-- CreateTable
CREATE TABLE "Bonus" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "jogador" TEXT NOT NULL,
    "nome" TEXT,
    "valorCentavos" INTEGER NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Bonus_chave_key" ON "Bonus"("chave");

-- CreateIndex
CREATE INDEX "Bonus_criadoEm_idx" ON "Bonus"("criadoEm");

-- CreateIndex
CREATE INDEX "Bonus_jogador_idx" ON "Bonus"("jogador");

-- os bônus diários já resgatados passam pra tabela única
INSERT INTO "Bonus" ("chave", "tipo", "jogador", "valorCentavos", "criadoEm")
SELECT 'diario:' || "jogador" || ':' || "dia", 'diario', "jogador", "valorCentavos", "criadoEm" FROM "BonusResgate";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "BonusResgate";
PRAGMA foreign_keys=on;
