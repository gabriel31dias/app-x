// Lógica do "Hipopota do Job": 4 rolos x 5 linhas, 625 caminhos. Rodar `node hipopota.js` = auto-teste e RTP por simulação.
// - Paga da esquerda pra direita: símbolo em rolos vizinhos a partir do 1º (3 ou 4 rolos). Caminhos = produto das
//   quantidades em cada rolo. Prêmio = aposta/25 x tabela x caminhos (x multiplicador nas grátis).
// - WILD (beijo) só nos rolos 2 a 4 e substitui tudo menos o SCATTER (bolsa de grana).
// - Beijo da Hipopota: a qualquer giro do jogo base ela manda beijos e 2 a 5 casas dos rolos 2 a 4 viram WILD.
// - 3+ SCATTER na tela: 8 rodadas grátis (+2 por scatter a mais), redisparam. Nas grátis o Hipopotão joga grana:
//   começa em x2 e cada giro com ganho sobe o multiplicador (x2, x3, x4...) até o fim das grátis.
const H = 5, R = 4;
const WILD = 0, SCATTER = 1;
const SYMBOLS = [
  // pay = [3, 4 rolos] x (aposta / 25); w = peso nos rolos
  { id: 'wild', w: 2.2 }, // só nos rolos 2 a 4
  { id: 'scatter', w: 2.2 },
  { id: 'hipf', w: 3, pay: [11, 44] },
  { id: 'hipm', w: 3.5, pay: [8, 32] },
  { id: 'car', w: 4.5, pay: [5.5, 22] },
  { id: 'champ', w: 5, pay: [4, 16] },
  { id: 'shoe', w: 5.5, pay: [3.2, 13] },
  { id: 'cash', w: 6, pay: [2.7, 11] },
  { id: 'a', w: 8, pay: [1.6, 5.5] },
  { id: 'k', w: 8.5, pay: [1.4, 4.4] },
  { id: 'q', w: 9, pay: [1.1, 3.2] },
  { id: 'j', w: 9, pay: [1.1, 3.2] },
];
const KISS_CHANCE = 1 / 30;     // beijo da hipopota por giro (só no jogo base)
const KISS_WILDS = [2, 5];      // quantas casas viram wild (mín, máx)
const FREE_SPINS = 8, FREE_EXTRA = 2;
const MAX_WIN = 5000;           // teto por giro, em apostas

// RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
// Todos os prêmios escalam por RTP / fábrica; as chances não mudam.
// CAL = acerto da tabela pra dar exatamente a fábrica (medido com `node hipopota.js 4000000`).
const HIPOPOTA_FABRICA = 0.965, CAL = 0.999;
const BASE_PAYS = SYMBOLS.map(s => s.pay && s.pay.slice());
let HIPOPOTA_RTP;
function setRtp(r) {
  HIPOPOTA_RTP = r;
  SYMBOLS.forEach((s, i) => { if (s.pay) s.pay = BASE_PAYS[i].map(p => Math.round(p * CAL * r / HIPOPOTA_FABRICA * 1000) / 1000); });
}
setRtp(globalThis.RTP_JOGOS?.hipopota ?? HIPOPOTA_FABRICA);

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

// rolo 1 sem wild: pesos separados
const TOTAL = [false, true].map(w => SYMBOLS.reduce((a, s, i) => a + (i === WILD && !w ? 0 : s.w), 0));
function drawCell(c) {
  const wildOk = c > 0;
  let r = rand() * TOTAL[+wildOk];
  for (let i = 0; i < SYMBOLS.length; i++) {
    if (i === WILD && !wildOk) continue;
    if ((r -= SYMBOLS[i].w) < 0) return i;
  }
  return SYMBOLS.length - 1;
}
// rolo com pilhas (igual fita de rolo de verdade): cada sorteio ocupa 1 a 3 casas seguidas; scatter no máx. 1 por rolo
const STACK2 = 0.4, STACK3 = 0.18;
function drawCol(c) {
  const col = [];
  while (col.length < H) {
    let s = drawCell(c);
    if (s === SCATTER && col.includes(SCATTER)) continue;
    const k = s === SCATTER ? 1 : 1 + (rand() < STACK2) + (rand() < STACK3);
    for (let i = 0; i < k && col.length < H; i++) col.push(s);
  }
  return col;
}
// grade = colunas, cada uma de cima pra baixo (número do símbolo)
const spinGrid = () => Array.from({ length: R }, (_, c) => drawCol(c));

// caminhos da esquerda pra direita; cells = [coluna, linha] de tudo que fez parte do ganho
function evaluate(grid, unit) {
  const wins = [];
  for (let s = 2; s < SYMBOLS.length; s++) {
    if (!grid[0].includes(s)) continue;
    let ways = 1, n = 0;
    const cells = [];
    for (let c = 0; c < R; c++) {
      const hit = [];
      grid[c].forEach((x, r) => { if (x === s || x === WILD) hit.push([c, r]); });
      if (!hit.length) break;
      ways *= hit.length; n++; cells.push(...hit);
    }
    if (n >= 3) wins.push({ sym: s, reels: n, ways, cells, amount: unit * SYMBOLS[s].pay[n - 3] * ways });
  }
  return wins;
}

const r2 = v => Math.round(v * 100) / 100;
const countScatter = grid => grid.reduce((a, col) => a + col.filter(x => x === SCATTER).length, 0);

// Um giro. start = tela que os rolos mostram ao parar; kisses = casas que viram wild depois (beijo da hipopota).
function playRound(bet, free = false, mult = 1) {
  const unit = bet / 25, start = spinGrid(), grid = start.map(col => col.slice());
  let kisses = null;
  if (!free && rand() < KISS_CHANCE) {
    const pool = [];
    for (let c = 1; c < R; c++) grid[c].forEach((x, r) => { if (x !== SCATTER && x !== WILD) pool.push([c, r]); });
    const k = Math.min(pool.length, KISS_WILDS[0] + randInt(KISS_WILDS[1] - KISS_WILDS[0] + 1));
    kisses = [];
    for (let i = 0; i < k; i++) {
      const [c, r] = pool.splice(randInt(pool.length), 1)[0];
      grid[c][r] = WILD; kisses.push([c, r]);
    }
  }
  const wins = evaluate(grid, unit);
  const base = r2(wins.reduce((a, w) => a + w.amount, 0));
  const total = Math.min(r2(base * mult), bet * MAX_WIN);
  const scat = countScatter(grid);
  const freeSpins = scat >= 3 ? FREE_SPINS + (scat - 3) * FREE_EXTRA : 0;
  return { start, kisses, grid, wins, base, mult, total, scatters: scat, freeSpins };
}

if (typeof module !== 'undefined') {
  module.exports = { get RTP() { return HIPOPOTA_RTP; }, FABRICA: HIPOPOTA_FABRICA, setRtp, SYMBOLS, H, R, WILD, SCATTER, evaluate, playRound, spinGrid };
  if (require.main === module) {
    const assert = require('assert');
    const I = id => SYMBOLS.findIndex(s => s.id === id);
    const [hf, a, k, q, j, cash] = ['hipf', 'a', 'k', 'q', 'j', 'cash'].map(I);
    // hipf em 3 rolos: 1 caminho
    let w = evaluate([[hf, a, a, a, a], [k, hf, k, k, k], [q, q, hf, q, q], [j, j, j, j, j]], 1);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.reels, x.ways]), [['hipf', 3, 1]]);
    assert.strictEqual(w[0].amount, SYMBOLS[hf].pay[0]);
    // wild conta como qualquer símbolo e multiplica caminhos: 2 x (1 wild + 2 cash) x 1 x 1 de cash
    w = evaluate([[cash, cash, a, a, a], [WILD, cash, cash, k, k], [cash, q, q, q, q], [cash, j, j, j, j]], 1);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.reels, x.ways]), [['cash', 4, 6]]);
    // rolo 1 nunca tem wild; multiplicador das grátis entra no total
    for (let i = 0; i < 2e4; i++) {
      const r = playRound(1, i % 2 === 1, 1 + (i % 5));
      assert(!r.start[0].includes(WILD));
      assert(Math.abs(Math.min(r2(r.base * r.mult), MAX_WIN) - r.total) < 1e-9);
      if (r.kisses) assert(r.kisses.every(([c, rr]) => c > 0 && r.grid[c][rr] === WILD));
    }

    // RTP por simulação: giro base + todas as rodadas grátis que ele disparar (multiplicador sobe a cada ganho)
    const N = +process.argv[2] || 1e6, bet = 1;
    let paid = 0, hits = 0, fsTrig = 0, fsPaid = 0, kisses = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const r = playRound(bet);
      let win = r.total, fs = r.freeSpins, mult = 2;
      if (r.total > 0) hits++;
      if (r.kisses) kisses++;
      if (fs) fsTrig++;
      while (fs > 0) {
        fs--;
        const f = playRound(bet, true, mult);
        win += f.total; fsPaid += f.total; fs += f.freeSpins;
        if (f.total > 0) mult++;
      }
      paid += win; max = Math.max(max, win);
    }
    const rtp = paid / N / bet;
    console.log(`RTP ${(rtp * 100).toFixed(2)}% | acerto ${(hits / N * 100).toFixed(1)}% | grátis 1 a cada ${(N / fsTrig).toFixed(0)} giros, pagam ${(fsPaid / fsTrig).toFixed(1)}x | beijo 1/${(N / kisses).toFixed(0)} | maior ${max.toFixed(0)}x`);
    console.log(`CAL p/ ${HIPOPOTA_FABRICA}: ${(CAL * HIPOPOTA_FABRICA / rtp).toFixed(4)}`);
    assert(rtp > 0.94 && rtp < 0.99, 'RTP fora da faixa 94–99%');
  }
}
