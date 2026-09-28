CREATE TABLE "JogadorRtp" (
    "email" TEXT NOT NULL,
    "jogo" TEXT NOT NULL,
    "rtp" REAL NOT NULL,
    "atualizadoPor" TEXT NOT NULL,
    "atualizadoEm" DATETIME NOT NULL,

    PRIMARY KEY ("email", "jogo")
);

CREATE INDEX "JogadorRtp_jogo_idx" ON "JogadorRtp"("jogo");

CREATE TABLE "JogadorRtpAlteracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "jogo" TEXT NOT NULL,
    "de" REAL,
    "para" REAL,
    "por" TEXT NOT NULL,
    "em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
