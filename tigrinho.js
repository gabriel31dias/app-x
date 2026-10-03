// Lógica do "Tigrinho Bolado" (mecânica do tigrinho): 5 rolos x 4 linhas, 20 linhas fixas. Rodar `node tigrinho.js` = auto-teste e RTP.
// - Linha paga da esquerda pra direita, 3+ iguais a partir do 1º rolo. Prêmio = aposta/20 x tabela.
// - WILD (o tigre) substitui tudo e também paga sozinho (é o que paga mais).
// - Rodada do Tigre: a qualquer giro o tigre acorda e escolhe um símbolo. Os rolos regiram de graça e só cai
//   esse símbolo ou WILD; o que cai fica preso. Regira até formar ganho e continua enquanto cair coisa nova.
//   Tela cheia (as 20 casas) = prêmio x10.
const R = 5, H = 4;
const WILD = 0, BLANK = -1;
const SYMBOLS = [
  // pay = [3, 4, 5 na linha] x (aposta / 20); w = peso nos rolos
  { id: 'wild', w: 1.6, pay: [45, 225, 900] },
  { id: 'ingot', w: 3, pay: [36, 135, 540] },
  { id: 'jade', w: 3.6, pay: [27, 90, 360] },
  { id: 'bag', w: 4.2, pay: [21.6, 72, 225] },
  { id: 'env', w: 5, pay: [18, 54, 162] },
  { id: 'fire', w: 5.6, pay: [13.5, 36, 108] },
  { id: 'coin', w: 6.2, pay: [10.8, 27, 72] },
  { id: 'orange', w: 7, pay: [7.2, 18, 45] },
  { id: 'flower', w: 7.6, pay: [5.4, 13.5, 36] },
];
// 20 linhas: linha (de cima pra baixo, 0 a 3) em cada rolo
const LINES = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3],
  [0, 1, 2, 1, 0], [1, 2, 3, 2, 1], [3, 2, 1, 2, 3], [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0], [1, 1, 2, 1, 1], [2, 2, 3, 2, 2], [3, 3, 2, 3, 3], [2, 2, 1, 2, 2], [1, 1, 0, 1, 1],
  [0, 1, 1, 1, 0], [1, 2, 2, 2, 1], [2, 3, 3, 3, 2], [3, 2, 2, 2, 3], [2, 1, 1, 1, 2], [1, 0, 0, 0, 1],
];
const TIGER_CHANCE = 1 / 28;       // rodada do tigre por giro
const TIGER_SYM_W = [0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]; // qual símbolo o tigre escolhe (os baratos saem mais)
const TIGER_P = 0.08, TIGER_PW = 0.02; // chance de cada casa vazia receber o símbolo / o wild em cada regiro
const TIGER_MAX = 8;               // teto de regiros
const FULL_MULT = 10;
const MAX_WIN = 2500;              // teto por giro, em apostas

// RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
// Todos os prêmios escalam por RTP / fábrica; as chances não mudam.
// CAL = acerto da tabela pra dar exatamente a fábrica (medido com `node tigrinho.js 4000000`).
const TIGRINHO_FABRICA = 0.965, CAL = 1.142;
const BASE_PAYS = SYMBOLS.map(s => s.pay.slice());
let TIGRINHO_RTP;
function setRtp(r) {
  TIGRINHO_RTP = r;
  SYMBOLS.forEach((s, i) => { s.pay = BASE_PAYS[i].map(p => Math.round(p * CAL * r / TIGRINHO_FABRICA * 1000) / 1000); });
}
setRtp(globalThis.RTP_JOGOS?.tigrinho ?? TIGRINHO_FABRICA);

// inteiro uniforme [0, n) via crypto, com rejeição para não ter viés
const POOL = new Uint32Array(1024);
let poolAt = POOL.length;
function randInt(n) {
  const lim = Math.floor(2 ** 32 / n) * n;
  let v;
  do {
    if (poolAt === POOL.length) { crypto.getRandomValues(POOL); poolAt = 0; }
    v = POOL[poolAt++];
  } while (v >= lim);
  return v % n;
}
const rand = () => randInt(1e9) / 1e9;
const pick = ws => { let r = rand() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < ws.length; i++) if ((r -= ws[i]) < 0) return i; return ws.length - 1; };

const WS = [SYMBOLS.map((s, i) => (i === WILD ? s.w * .4 : s.w)), SYMBOLS.map(s => s.w)]; // rolo 1 tem menos wild
const drawCell = c => pick(WS[c ? 1 : 0]);
// grade = colunas, cada uma de cima pra baixo; pilhas de 1 a 2 iguais deixam a tela com cara de rolo
function drawCol(c) {
  const col = [];
  while (col.length < H) { const s = drawCell(c); col.push(s); if (col.length < H && rand() < .3) col.push(s); }
  return col;
}
const spinGrid = () => Array.from({ length: R }, (_, c) => drawCol(c));

// melhor prêmio de cada linha: o símbolo (com wilds no lugar) ou só os wilds do começo
function evaluate(grid, unit) {
  const wins = [];
  LINES.forEach((ln, li) => {
    const cells = ln.map((r, c) => grid[c][r]);
    let w = 0; while (w < R && cells[w] === WILD) w++;
    const wildPay = w >= 3 ? SYMBOLS[WILD].pay[w - 3] : 0;
    const s = cells.find(x => x !== WILD);
    let n = 0, symPay = 0;
    if (s !== undefined && s !== BLANK) {
      while (n < R && (cells[n] === s || cells[n] === WILD)) n++;
      if (n >= 3) symPay = SYMBOLS[s].pay[n - 3];
    }
    const best = Math.max(wildPay, symPay);
    if (best > 0) {
      const [sym, len] = symPay >= wildPay ? [s, n] : [WILD, w];
      wins.push({ line: li, sym, len, cells: ln.slice(0, len).map((r, c) => [c, r]), amount: unit * best });
    }
  });
  return wins;
}
const r2 = v => Math.round(v * 100) / 100;
const sum = wins => wins.reduce((a, w) => a + w.amount, 0);

// rodada do tigre: steps = cada regiro com as casas novas que caíram (grid já com elas)
function tigerRound(unit) {
  const sym = pick(TIGER_SYM_W);
  const grid = Array.from({ length: R }, () => Array(H).fill(BLANK));
  const steps = [];
  for (let k = 0; k < TIGER_MAX; k++) {
    const added = [];
    grid.forEach((col, c) => col.forEach((x, r) => {
      if (x !== BLANK) return;
      const v = rand();
      if (v < TIGER_PW) { col[r] = WILD; added.push([c, r]); }
      else if (v < TIGER_PW + TIGER_P) { col[r] = sym; added.push([c, r]); }
    }));
    steps.push({ grid: grid.map(col => col.slice()), added });
    const won = evaluate(grid, unit).length > 0;
    if (won && !added.length) break;
  }
  // garantia do tigrinho: se o teto chegou sem ganho, o 1º rolo, 2º e 3º da linha do meio completam
  if (!evaluate(grid, unit).length) {
    const added = [];
    for (let c = 0; c < 3; c++) if (grid[c][1] === BLANK) { grid[c][1] = sym; added.push([c, 1]); }
    steps.push({ grid: grid.map(col => col.slice()), added });
  }
  const full = grid.every(col => col.every(x => x !== BLANK));
  return { sym, steps, grid, full };
}

// Um giro. tiger = rodada do tigre (a tela final é a dele); senão a tela é o giro normal.
function playRound(bet) {
  const unit = bet / 20;
  let grid, tiger = null;
  if (rand() < TIGER_CHANCE) { tiger = tigerRound(unit); grid = tiger.grid; }
  else grid = spinGrid();
  const wins = evaluate(grid, unit);
  const mult = tiger?.full ? FULL_MULT : 1;
  const total = Math.min(r2(sum(wins) * mult), bet * MAX_WIN);
  return { start: tiger ? null : grid, tiger, grid, wins, mult, total };
}

if (typeof module !== 'undefined') {
  module.exports = { get RTP() { return TIGRINHO_RTP; }, FABRICA: TIGRINHO_FABRICA, setRtp, SYMBOLS, LINES, R, H, WILD, BLANK, evaluate, playRound, spinGrid, drawCell };
  if (require.main === module) {
    const assert = require('assert');
    const [W, ing, , , , , coin, orange, flower] = SYMBOLS.map((_, i) => i);
    const row = (a, b, c, d, e, fill = flower) => [[a, fill, orange, fill], [b, fill, orange, coin], [c, coin, fill, orange], [d, orange, coin, fill], [e, coin, orange, coin]];
    // ingot ingot wild ingot coin na linha de cima: 4 na linha
    let w = evaluate(row(ing, ing, W, ing, coin), 1).filter(x => x.line === 0);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.len]), [['ingot', 4]]);
    // 3 wilds no começo pagam como wild se for maior que o símbolo
    w = evaluate(row(W, W, W, flower, coin), 1).filter(x => x.line === 0);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.len]), [['wild', 3]]);
    // casa vazia quebra a linha
    w = evaluate(row(coin, BLANK, coin, coin, coin), 1).filter(x => x.line === 0);
    assert.strictEqual(w.length, 0);
    // rodada do tigre sempre termina com ganho, só com o símbolo escolhido / wild, e tela cheia = x10
    for (let i = 0; i < 2e4; i++) {
      const r = playRound(1);
      if (r.tiger) {
        assert(r.wins.length > 0);
        assert(r.grid.flat().every(x => x === BLANK || x === WILD || x === r.tiger.sym));
        assert.strictEqual(r.mult, r.tiger.full ? FULL_MULT : 1);
      }
      assert(Math.abs(Math.min(r2(sum(r.wins) * r.mult), MAX_WIN) - r.total) < 1e-9);
    }

    const N = +process.argv[2] || 1e6, bet = 1;
    let paid = 0, hits = 0, tigers = 0, tigerPaid = 0, fulls = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const r = playRound(bet);
      paid += r.total; if (r.total > 0) hits++;
      if (r.tiger) { tigers++; tigerPaid += r.total; if (r.tiger.full) fulls++; }
      max = Math.max(max, r.total);
    }
    const rtp = paid / N / bet;
    console.log(`RTP ${(rtp * 100).toFixed(2)}% | acerto ${(hits / N * 100).toFixed(1)}% | tigre 1/${(N / tigers).toFixed(0)} paga ${(tigerPaid / tigers).toFixed(1)}x (${(tigerPaid / paid * 100).toFixed(0)}% do RTP) | tela cheia 1/${(N / Math.max(fulls, 1)).toFixed(0)} | maior ${max.toFixed(0)}x`);
    console.log(`CAL p/ ${TIGRINHO_FABRICA}: ${(CAL * TIGRINHO_FABRICA / rtp).toFixed(4)}`);
    assert(rtp > 0.94 && rtp < 0.99, 'RTP fora da faixa 94–99%');
  }
}
