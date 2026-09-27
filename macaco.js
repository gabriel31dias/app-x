// Motor do slot "Macaco Pelado": grade 5x3, 10 linhas, WILD que expande na coluna,
// bônus por 3+ macacos pelados (placar 10x–1000x). Rodar `node macaco.js` = auto-teste de RTP.
const MP = (() => {
  const COLS = 5, ROWS = 3;
  // pays = multiplicador da aposta por linha (aposta total / 10) para 3, 4 e 5 iguais
  const SYMBOLS = [
    { id: 'wild', w: 3, pays: [20, 78, 390] },      // macaco de óculos: expande a coluna, substitui tudo menos o pelado
    { id: 'pelado', w: 2, pays: [0, 0, 0] },         // scatter: 3+ em qualquer lugar = bônus
    { id: 'macaco', w: 6, pays: [16, 62, 234] },
    { id: 'coroa', w: 8, pays: [12, 39, 156] },
    { id: 'diamante', w: 9, pays: [8, 27, 94] },
    { id: 'saco', w: 11, pays: [6, 20, 62] },
    { id: 'coco', w: 14, pays: [4, 12, 39] },
    { id: 'banana', w: 16, pays: [2.5, 9, 25] },
    { id: 'folha', w: 18, pays: [2, 7, 22] },
  ];
  const WILD = 0, SCATTER = 1;
  const LINES = [
    [5, 6, 7, 8, 9], [0, 1, 2, 3, 4], [10, 11, 12, 13, 14],
    [0, 6, 12, 8, 4], [10, 6, 2, 8, 14],
    [0, 1, 7, 3, 4], [10, 11, 7, 13, 14],
    [5, 1, 2, 3, 9], [5, 11, 12, 13, 9],
    [0, 6, 7, 8, 4],
  ];
  // placar do bônus: multiplicador da aposta total e peso do sorteio
  const BONUS = [
    { mult: 10, w: 595 }, { mult: 50, w: 270 }, { mult: 100, w: 110 }, { mult: 500, w: 20 }, { mult: 1000, w: 5 },
  ];
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
  // Todos os prêmios (linhas e placar do bônus) escalam por RTP / fábrica; as chances não mudam.
  const FABRICA = 0.95, PAYS = SYMBOLS.map(s => s.pays), MULTS = BONUS.map(b => b.mult);
  let RTP;
  function setRtp(r) {
    RTP = r;
    const k = r / FABRICA;
    SYMBOLS.forEach((s, i) => { s.pays = PAYS[i].map(p => Math.round(p * k * 100) / 100); });
    BONUS.forEach((b, i) => { b.mult = Math.round(MULTS[i] * k * 100) / 100; });
  }
  setRtp(globalThis.RTP_JOGOS?.macaco ?? FABRICA);
  const BONUS_W = BONUS.reduce((a, b) => a + b.w, 0);
  const MAX_WIN = 2000;
  const TOTAL_W = SYMBOLS.reduce((a, s) => a + s.w, 0);

  // inteiro uniforme [0, n) via crypto, com rejeição para não ter viés
  function randInt(n) {
    const buf = new Uint32Array(1), lim = Math.floor(2 ** 32 / n) * n;
    do crypto.getRandomValues(buf); while (buf[0] >= lim);
    return buf[0] % n;
  }

  function drawSymbol() {
    let r = randInt(TOTAL_W);
    for (let i = 0; i < SYMBOLS.length; i++) if ((r -= SYMBOLS[i].w) < 0) return i;
  }

  const newGrid = () => Array.from({ length: COLS * ROWS }, drawSymbol);

  /** colunas com WILD viram WILD inteiras (o pelado não é coberto) */
  function expand(grid) {
    const g = grid.slice(), cols = [];
    for (let c = 0; c < COLS; c++) {
      if ([0, 1, 2].some(r => grid[r * COLS + c] === WILD)) {
        cols.push(c);
        for (let r = 0; r < ROWS; r++) if (g[r * COLS + c] !== SCATTER) g[r * COLS + c] = WILD;
      }
    }
    return { grid: g, cols };
  }

  function lineWin(syms) {
    if (syms[0] === SCATTER) return null;
    let best = null;
    const tryBase = base => {
      let n = 0;
      while (n < COLS && (syms[n] === base || syms[n] === WILD)) n++;
      const pay = n >= 3 ? SYMBOLS[base].pays[n - 3] : 0;
      if (pay && (!best || pay > best.pay)) best = { sym: base, count: n, pay };
    };
    const firstReal = syms.find(s => s !== WILD);
    if (firstReal !== undefined && firstReal !== SCATTER) tryBase(firstReal);
    tryBase(WILD);
    return best;
  }

  function evaluate(grid, lineBet) {
    const wins = [];
    LINES.forEach((line, li) => {
      const w = lineWin(line.map(i => grid[i]));
      if (w) wins.push({ line: li, cells: line.slice(0, w.count), sym: w.sym, count: w.count, amount: w.pay * lineBet });
    });
    return wins;
  }

  function drawBonus() {
    let r = randInt(BONUS_W);
    for (let i = 0; i < BONUS.length; i++) if ((r -= BONUS[i].w) < 0) return i;
  }

  const r2 = x => Math.round(x * 100) / 100;

  function playRound(bet) {
    const raw = newGrid(), { grid, cols } = expand(raw);
    const wins = evaluate(grid, bet / LINES.length);
    const lineTotal = wins.reduce((a, w) => a + w.amount, 0);
    const scatters = raw.filter(s => s === SCATTER).length;
    const bonus = scatters >= 3 ? drawBonus() : null;
    const bonusWin = bonus === null ? 0 : BONUS[bonus].mult * bet;
    const total = lineTotal + bonusWin, capped = total > bet * MAX_WIN;
    return { raw, grid, cols, wins, lineTotal: r2(lineTotal), scatters, bonus, bonusWin, total: r2(Math.min(total, bet * MAX_WIN)), capped };
  }

  return { get RTP() { return RTP; }, FABRICA, setRtp, SYMBOLS, LINES, COLS, ROWS, WILD, SCATTER, BONUS, MAX_WIN, drawSymbol, expand, lineWin, evaluate, playRound };
})();

if (typeof module !== 'undefined') {
  module.exports = MP;
  if (require.main === module) {
    const assert = require('assert');
    const { lineWin, expand, playRound, WILD, SCATTER } = MP;
    assert.deepStrictEqual(lineWin([2, 2, 2, 7, 8]), { sym: 2, count: 3, pay: 16 });
    assert.deepStrictEqual(lineWin([2, WILD, 2, 2, 2]), { sym: 2, count: 5, pay: 234 });
    assert.strictEqual(lineWin([SCATTER, SCATTER, SCATTER, 2, 2]), null);
    // WILD no meio da coluna 1 cobre a coluna, mas não o pelado
    const e = expand([7, WILD, 7, 7, 7, 8, 5, 8, 8, 8, 6, SCATTER, 6, 6, 6]);
    assert.deepStrictEqual(e.cols, [1]);
    assert.deepStrictEqual([e.grid[1], e.grid[6], e.grid[11]], [WILD, WILD, SCATTER]);

    const N = +(process.argv[2] || 1e6), bet = 1;
    let paid = 0, lines = 0, bonusPaid = 0, hits = 0, bonuses = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const r = playRound(bet);
      paid += r.total; lines += r.lineTotal; bonusPaid += r.bonusWin;
      if (r.total > 0) hits++; if (r.bonus !== null) bonuses++; max = Math.max(max, r.total);
    }
    const rtp = paid / N;
    console.log(`RTP: ${(rtp * 100).toFixed(2)}% (linhas ${(lines / N * 100).toFixed(2)}% + bônus ${(bonusPaid / N * 100).toFixed(2)}%)`);
    console.log(`Ganha algo: 1 a cada ${(N / hits).toFixed(1)} giros | Bônus: 1 a cada ${Math.round(N / bonuses)} | maior: ${max}x`);
    assert(rtp > 0.95 && rtp < 0.98, 'RTP fora da faixa 95–98%');
  }
}
