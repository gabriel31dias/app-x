// Motor do slot "Papagaio Gay": grade 5x3, 10 linhas, cascata com multiplicador,
// giros grátis ("Parada do Orgulho") por 3+ baús. Rodar `node papagaio.js` = auto-teste de RTP.
const PG = (() => {
  const COLS = 5, ROWS = 3;
  // pays = multiplicador da aposta por linha (aposta total / 10) para 3, 4 e 5 iguais
  // calibrado por simulação: jogo normal ~72% + Parada do Orgulho ~25% = RTP ~97%
  const SYMBOLS = [
    { id: 'wild', w: 6, pays: [65, 330, 1300] },  // wild: substitui tudo menos o baú
    { id: 'bau', w: 3, pays: [0, 0, 0] },          // scatter: 3+ em qualquer lugar = Parada do Orgulho
    { id: 'papagaio', w: 8, pays: [33, 130, 650] },
    { id: 'piscadinha', w: 10, pays: [26, 100, 400] },
    { id: 'coroa', w: 12, pays: [20, 65, 265] },
    { id: 'coracao', w: 14, pays: [13, 40, 165] },
    { id: 'pena', w: 18, pays: [6.5, 26, 100] },
    { id: 'drink', w: 20, pays: [6.5, 20, 65] },
    { id: 'abacaxi', w: 22, pays: [3.3, 13, 53] },
    { id: 'melancia', w: 22, pays: [3.3, 13, 53] },
  ];
  const WILD = 0, SCATTER = 1;
  // posições: índice = linha * 5 + coluna
  const LINES = [
    [5, 6, 7, 8, 9], [0, 1, 2, 3, 4], [10, 11, 12, 13, 14],
    [0, 6, 12, 8, 4], [10, 6, 2, 8, 14],
    [0, 1, 7, 3, 4], [10, 11, 7, 13, 14],
    [5, 1, 2, 3, 9], [5, 11, 12, 13, 9],
    [0, 6, 7, 8, 4],
  ];
  const MULT_BASE = [1, 2, 3, 5];   // cada cascata seguida sobe um degrau
  const MULT_FREE = [6, 9, 12, 16]; // na Parada do Orgulho começa bem mais alto
  const FREE_SPINS = { 3: 12, 4: 15, 5: 20 };
  const MAX_WIN = 2000;             // teto por rodada, em vezes a aposta
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

  // melhor prêmio de uma linha: sequência a partir da esquerda (wild completa)
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
    tryBase(WILD); // só wilds na frente também pagam como wild
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

  // símbolos premiados somem, o resto cai, entram novos por cima
  function tumble(grid, remove) {
    const next = grid.slice();
    for (let c = 0; c < COLS; c++) {
      const kept = [];
      for (let r = ROWS - 1; r >= 0; r--) if (!remove.has(r * COLS + c)) kept.push(grid[r * COLS + c]);
      for (let r = ROWS - 1, k = 0; r >= 0; r--, k++) next[r * COLS + c] = k < kept.length ? kept[k] : drawSymbol();
    }
    return next;
  }

  const countScatter = g => g.filter(s => s === SCATTER).length;

  // um giro com todas as cascatas. steps[i] = { grid, wins, mult, win }
  function spinOnce(bet, ladder) {
    const lineBet = bet / LINES.length, steps = [];
    let grid = newGrid(), total = 0, i = 0;
    for (;;) {
      const wins = evaluate(grid, lineBet), mult = ladder[Math.min(i, ladder.length - 1)];
      const win = wins.reduce((a, w) => a + w.amount, 0) * mult;
      steps.push({ grid, wins, mult, win });
      if (!wins.length) break;
      total += win;
      grid = tumble(grid, new Set(wins.flatMap(w => w.cells)));
      i++;
    }
    return { steps, total, scatters: countScatter(grid) };
  }

  const r2 = x => Math.round(x * 100) / 100;

  // rodada completa: giro pago + Parada do Orgulho se cair 3+ baús
  function playRound(bet) {
    const base = spinOnce(bet, MULT_BASE);
    let total = base.total, free = [];
    const n = FREE_SPINS[Math.min(base.scatters, 5)] || 0;
    for (let k = 0; k < n; k++) {
      const s = spinOnce(bet, MULT_FREE);
      free.push(s);
      total += s.total;
    }
    const capped = total > bet * MAX_WIN;
    return { base, free, total: r2(Math.min(total, bet * MAX_WIN)), capped };
  }

  return { SYMBOLS, LINES, COLS, ROWS, WILD, SCATTER, MULT_BASE, MULT_FREE, FREE_SPINS, MAX_WIN,
    drawSymbol, evaluate, tumble, lineWin, playRound };
})();

if (typeof module !== 'undefined') {
  module.exports = PG;
  if (require.main === module) {
    const assert = require('assert');
    const { lineWin, evaluate, tumble, playRound, WILD, SCATTER } = PG;
    // 3 papagaios, 5 papagaios com wild no meio, wilds na frente, baú não paga linha
    assert.deepStrictEqual(lineWin([2, 2, 2, 7, 8]), { sym: 2, count: 3, pay: 33 });
    assert.deepStrictEqual(lineWin([2, WILD, 2, 2, 2]), { sym: 2, count: 5, pay: 650 });
    assert.deepStrictEqual(lineWin([WILD, WILD, WILD, 8, 9]), { sym: WILD, count: 3, pay: 65 });
    assert.strictEqual(lineWin([SCATTER, SCATTER, SCATTER, 2, 2]), null);
    assert.strictEqual(lineWin([2, 2, SCATTER, 2, 2]), null);
    // linha do meio com 3 piscadinhas paga 26 x aposta por linha
    const g = [7, 8, 9, 6, 7, 3, 3, 3, 6, 9, 8, 7, 6, 9, 8];
    assert.strictEqual(evaluate(g, 1).reduce((a, w) => a + w.amount, 0), 26);
    // cascata: removidos somem e o que estava em cima cai
    const t = tumble(g, new Set([5, 6, 7]));
    assert.deepStrictEqual([t[5], t[6], t[7]], [7, 8, 9]);
    assert.deepStrictEqual([t[10], t[11], t[12]], [8, 7, 6]);

    const N = +(process.argv[2] || 1e6), bet = 1;
    let paid = 0, freeHits = 0, hits = 0, max = 0, capped = 0, cascades = 0;
    for (let i = 0; i < N; i++) {
      const r = playRound(bet);
      paid += r.total; if (r.total > 0) hits++; if (r.free.length) freeHits++; if (r.capped) capped++;
      cascades += r.base.steps.length - 1; max = Math.max(max, r.total);
    }
    const rtp = paid / N / bet;
    console.log(`RTP: ${(rtp * 100).toFixed(2)}%  | vantagem da casa: ${((1 - rtp) * 100).toFixed(2)}%`);
    console.log(`Ganha algo: 1 a cada ${(N / hits).toFixed(1)} giros | Parada do Orgulho: 1 a cada ${Math.round(N / freeHits)} | cascatas por giro: ${(cascades / N).toFixed(2)}`);
    console.log(`Maior prêmio: ${max}x | bateu no teto (${PG.MAX_WIN}x): ${capped}`);
    assert(rtp > 0.95 && rtp < 0.98, 'RTP fora da faixa 95–98%');
  }
}
