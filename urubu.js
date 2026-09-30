// Motor do slot "Urubuzinho Carioca": grade 5x3, 10 linhas, wild, scatter e giros grátis
// "Rodadas Grátis" com ganhos x3. Rodar `node urubu.js` = auto-teste de RTP.
const UR = (() => {
  const COLS = 5, ROWS = 3, BASE = 0.96;
  // pays = multiplicador da aposta por linha (aposta total / 10) para 3, 4 e 5 iguais.
  // Tabela calibrada por simulação (node urubu.js) pra dar RTP BASE.
  const SYMBOLS = [
    { id: 'wild', w: 3, pays: [100, 500, 2000] },     // Urubu WILD: substitui tudo menos o scatter
    { id: 'scatter', w: 3, pays: [0, 0, 0] },         // scatter: 3+ em qualquer lugar = giros grátis
    { id: 'urubu', w: 5, pays: [60, 250, 1200] },
    { id: 'saco', w: 6, pays: [45, 180, 800] },
    { id: 'dinheiro', w: 7, pays: [30, 120, 500] },
    { id: 'praia', w: 9, pays: [20, 80, 320] },
    { id: 'chope', w: 11, pays: [14, 50, 200] },
    { id: 'coco', w: 13, pays: [9.2, 30, 120] },
    { id: 'futebol', w: 14, pays: [6, 22, 90] },
    { id: 'chinelo', w: 15, pays: [6, 22, 90] },
  ];
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
  // Todos os prêmios escalam por RTP / fábrica; as chances e o teto não mudam.
  const PAYS = SYMBOLS.map(s => s.pays);
  let RTP;
  function setRtp(r) {
    RTP = r;
    SYMBOLS.forEach((s, i) => { s.pays = PAYS[i].map(p => Math.round(p * r / BASE * 100) / 100); });
  }
  setRtp(globalThis.RTP_JOGOS?.urubu ?? BASE);
  const WILD = 0, SCATTER = 1;
  // posições: índice = linha * 5 + coluna
  const LINES = [
    [5, 6, 7, 8, 9], [0, 1, 2, 3, 4], [10, 11, 12, 13, 14],
    [0, 6, 12, 8, 4], [10, 6, 2, 8, 14],
    [0, 1, 7, 3, 4], [10, 11, 7, 13, 14],
    [5, 1, 2, 3, 9], [5, 11, 12, 13, 9],
    [0, 6, 7, 8, 4],
  ];
  const FREE_SPINS = { 3: 8, 4: 10, 5: 15 }, FREE_MULT = 3;
  const MAX_WIN = 2000; // teto por rodada, em vezes a aposta
  const TOTAL_W = SYMBOLS.reduce((a, s) => a + s.w, 0);

  // inteiro uniforme [0, n) via crypto, com rejeição pra não ter viés
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

  /** melhor prêmio de uma linha (da esquerda pra direita, wild substitui, scatter quebra) */
  function lineWin(syms) {
    const tryBase = base => {
      let n = 0;
      while (n < syms.length && (syms[n] === base || syms[n] === WILD)) n++;
      const pay = n >= 3 ? SYMBOLS[base].pays[n - 3] : 0;
      return pay ? { sym: base, count: n, pay } : null;
    };
    if (syms[0] === SCATTER) return null;
    const firstReal = syms.find(s => s !== WILD);
    const opts = [tryBase(WILD), firstReal !== undefined && firstReal !== SCATTER ? tryBase(firstReal) : null].filter(Boolean);
    return opts.sort((a, b) => b.pay - a.pay)[0] || null;
  }

  function evaluate(grid, lineBet, mult = 1) {
    const wins = [];
    LINES.forEach((line, li) => {
      const w = lineWin(line.map(i => grid[i]));
      if (w) wins.push({ line: li, cells: line.slice(0, w.count), sym: w.sym, count: w.count, amount: lineBet * w.pay * mult });
    });
    return wins;
  }
  const scatters = g => g.map((s, i) => (s === SCATTER ? i : -1)).filter(i => i >= 0);
  const r2 = x => Math.round(x * 100) / 100;

  function spin(bet, mult) {
    const grid = newGrid(), wins = evaluate(grid, bet / LINES.length, mult);
    return { grid, wins, win: wins.reduce((a, w) => a + w.amount, 0), scatters: scatters(grid) };
  }

  /** rodada completa: giro pago + giros grátis se cair 3+ scatters (sem redisparo) */
  function playRound(bet) {
    const base = spin(bet, 1), free = [];
    let total = base.win;
    const n = FREE_SPINS[Math.min(base.scatters.length, 5)] || 0;
    for (let k = 0; k < n; k++) { const s = spin(bet, FREE_MULT); free.push(s); total += s.win; }
    const capped = total > bet * MAX_WIN;
    return { base, free, total: r2(Math.min(total, bet * MAX_WIN)), capped };
  }

  return { get RTP() { return RTP; }, BASE, FABRICA: BASE, setRtp, SYMBOLS, LINES, COLS, ROWS, WILD, SCATTER, FREE_SPINS, FREE_MULT, MAX_WIN, drawSymbol, lineWin, evaluate, playRound };
})();

if (typeof module !== 'undefined') {
  module.exports = UR;
  if (require.main === module) {
    const assert = require('assert');
    const { lineWin, evaluate, playRound, WILD, SCATTER, SYMBOLS } = UR;
    const A = 7, K = 8, Q = 9, $ = 2;
    assert.deepStrictEqual(lineWin([A, A, A, K, Q]), { sym: A, count: 3, pay: SYMBOLS[A].pays[0] });
    assert.deepStrictEqual(lineWin([$, WILD, $, $, $]), { sym: $, count: 5, pay: SYMBOLS[$].pays[2] });
    assert.deepStrictEqual(lineWin([WILD, WILD, WILD, K, Q]), { sym: WILD, count: 3, pay: SYMBOLS[WILD].pays[0] });
    assert.strictEqual(lineWin([SCATTER, SCATTER, SCATTER, A, A]), null);
    assert.strictEqual(lineWin([A, A, SCATTER, A, A]), null);
    // linha do meio com 3 A paga pays[0] x aposta por linha
    const g = [K, Q, K, Q, K, A, A, A, Q, K, Q, K, Q, K, Q];
    assert.strictEqual(evaluate(g, 1).reduce((a, w) => a + w.amount, 0), SYMBOLS[A].pays[0]);

    // RTP exato: as 15 casas são independentes, então soma as 12^5 combinações de uma linha
    // e multiplica pelos giros grátis esperados (binomial dos scatters em 15 casas)
    const TW = SYMBOLS.reduce((a, s) => a + s.w, 0), p = SYMBOLS.map(s => s.w / TW), n = SYMBOLS.length;
    let lineEV = 0;
    for (let c = 0; c < n ** 5; c++) {
      let x = c, pr = 1; const syms = [];
      for (let k = 0; k < 5; k++) { const s = x % n; x = (x / n) | 0; syms.push(s); pr *= p[s]; }
      const w = lineWin(syms); if (w) lineEV += pr * w.pay;
    }
    const C = (a, b) => { let r = 1; for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1); return r; };
    let freeEV = 0;
    for (let k = 3; k <= 15; k++) freeEV += C(15, k) * p[SCATTER] ** k * (1 - p[SCATTER]) ** (15 - k) * UR.FREE_SPINS[Math.min(k, 5)];
    const exact = lineEV * (1 + UR.FREE_MULT * freeEV); // ignora o teto de 2000x (quase nunca bate)
    console.log(`RTP exato: ${(exact * 100).toFixed(2)}% (jogo normal ${(lineEV * 100).toFixed(1)}% + giros grátis ${(lineEV * UR.FREE_MULT * freeEV * 100).toFixed(1)}%)`);
    assert(Math.abs(exact - UR.RTP) < 0.002, 'RTP exato fora');

    // simulação: confere o motor de verdade (slot oscila bastante, então a faixa é larga)
    const N = +(process.argv[2] || 3e5), bet = 1;
    let paid = 0, hits = 0, freeHits = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const r = playRound(bet);
      paid += r.total; if (r.total > 0) hits++; if (r.free.length) freeHits++; max = Math.max(max, r.total);
    }
    const rtp = paid / N / bet;
    console.log(`simulação (${N}): ${(rtp * 100).toFixed(2)}% | ganha algo 1 a cada ${(N / hits).toFixed(1)} giros | Rodadas Grátis 1 a cada ${Math.round(N / freeHits)} | maior prêmio ${max}x`);
    assert(Math.abs(rtp - exact) < 0.05, 'simulação muito longe do exato');
  }
}
