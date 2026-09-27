-- CreateTable
CREATE TABLE "GameRtp" (
    "jogo" TEXT NOT NULL PRIMARY KEY,
    "rtp" REAL NOT NULL,
    "atualizadoPor" TEXT NOT NULL,
    "atualizadoEm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RtpAlteracao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jogo" TEXT NOT NULL,
    "de" REAL,
    "para" REAL NOT NULL,
    "por" TEXT NOT NULL,
    "em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
