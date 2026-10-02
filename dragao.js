// Lógica do "Dragão da Sorte": 5 rolos (4-5-5-5-4 pedras), 2000 caminhos, cascata com multiplicador.
// Rodar `node dragao.js` = auto-teste e RTP por simulação.
// - Paga da esquerda pra direita: símbolo em rolos vizinhos a partir do 1º (3, 4 ou 5 rolos). Caminhos = produto das
//   quantidades em cada rolo. Prêmio = aposta/20 x tabela x caminhos x multiplicador.
// - Ganhou: as pedras somem e caem novas (cascata); cada cascata seguida sobe o multiplicador x1 x2 x3 x5
//   (rodadas grátis: x2 x4 x6 x10). Pedra dourada (rolos 2 a 4) que ganha vira WILD em vez de sumir.
// - 3+ SCATTER na tela: 10 rodadas grátis (+2 por scatter a mais), redisparam dentro das grátis.
// - Sopro do Dragão (igual o tigrinho acordando): a qualquer giro o dragão cospe fogo e vira pedras em WILD.
const H = [4, 5, 5, 5, 4];
const WILD = 0, SCATTER = 1;
const SYMBOLS = [
  // pay = [3, 4, 5 rolos] x (aposta / 20); w = peso nos rolos
  { id: 'wild', w: 0 }, // só nasce de pedra dourada ou do sopro do dragão
  { id: 'scatter', w: 1 },
  { id: 'fa', w: 4, pay: [3, 12, 20] },
  { id: 'zhong', w: 5, pay: [2, 8, 16] },
  { id: 'bag', w: 6, pay: [1.6, 4, 12] },
  { id: 'coin', w: 7, pay: [1.2, 3, 8] },
  { id: 'lotus', w: 8, pay: [1, 2.4, 6] },
  { id: 'wan', w: 9, pay: [0.8, 2, 4] },
  { id: 'dong', w: 9, pay: [0.8, 2, 4] },
  { id: 'dots', w: 11, pay: [0.4, 1, 2] },
  { id: 'bam3', w: 11, pay: [0.4, 1, 2] },
  { id: 'bai', w: 11, pay: [0.4, 1, 2] },
];
const GOLD = 0.10;              // chance de pedra comum sair dourada nos rolos 2 a 4
const GOLD_FREE = 0.16;         // nas rodadas grátis
const MULTS = [1, 2, 3, 5], MULTS_FREE = [2, 4, 6, 10];
const BREATH_CHANCE = 1 / 28;   // sopro do dragão por giro (só no jogo base)
const BREATH_WILDS = [3, 6];    // quantas pedras viram wild (mín, máx)
const FREE_SPINS = 10, FREE_EXTRA = 2;
const MAX_WIN = 5000;           // teto por giro, em apostas

// RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
// Todos os prêmios escalam por RTP / fábrica; as chances não mudam.
// CAL = acerto da tabela pra dar exatamente a fábrica (medido com `node dragao.js`, 4M giros).
const DRAGAO_FABRICA = 0.965, CAL = 1.033;
const BASE_PAYS = SYMBOLS.map(s => s.pay && s.pay.slice());
let DRAGAO_RTP;
function setRtp(r) {
  DRAGAO_RTP = r;
  SYMBOLS.forEach((s, i) => { if (s.pay) s.pay = BASE_PAYS[i].map(p => Math.round(p * CAL * r / DRAGAO_FABRICA * 1000) / 1000); });
}
setRtp(globalThis.RTP_JOGOS?.dragao ?? DRAGAO_FABRICA);

// inteiro uniforme [0, n) via crypto, com rejeição para não ter viés (lote de 1024 por chamada ao crypto: cascata sorteia muito)
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

const TOTAL_W = SYMBOLS.reduce((a, s) => a + s.w, 0);
function drawCell(c, free) {
  let r = rand() * TOTAL_W, s = SYMBOLS.length - 1;
  for (let i = 0; i < SYMBOLS.length; i++) if ((r -= SYMBOLS[i].w) < 0) { s = i; break; }
  const g = s > SCATTER && c >= 1 && c <= 3 && rand() < (free ? GOLD_FREE : GOLD);
  return { s, g };
}
// grade = colunas, cada uma de cima pra baixo: { s: símbolo, g: dourada }
const spinGrid = free => H.map((h, c) => Array.from({ length: h }, () => drawCell(c, free)));
const copy = grid => grid.map(col => col.map(x => ({ ...x })));

// caminhos da esquerda pra direita; cells = [coluna, linha] de tudo que fez parte de algum ganho
function evaluate(grid, unit) {
  const wins = [];
  for (let s = 2; s < SYMBOLS.length; s++) {
    let ways = 1, n = 0;
    const cells = [];
    for (let c = 0; c < 5; c++) {
      const hit = [];
      grid[c].forEach((x, r) => { if (x.s === s || x.s === WILD) hit.push([c, r]); });
      if (!hit.length) break;
      ways *= hit.length; n++; cells.push(...hit);
    }
    if (n >= 3 && grid[0].some(x => x.s === s)) // o 1º rolo não tem wild, mas confere pra não pagar só de wild
      wins.push({ sym: s, reels: n, ways, cells, amount: unit * SYMBOLS[s].pay[n - 3] * ways });
  }
  return wins;
}

const r2 = v => Math.round(v * 100) / 100;
const countScatter = grid => grid.reduce((a, col) => a + col.filter(x => x.s === SCATTER).length, 0);

// Um giro completo. steps = cada tela antes de pagar; a animação mostra a tela, os ganhos, a explosão e a queda.
function playRound(bet, free = false) {
  const unit = bet / 20, mults = free ? MULTS_FREE : MULTS;
  let grid = spinGrid(free), breath = null;
  const start = copy(grid);
  if (!free && rand() < BREATH_CHANCE) {
    // fogo do dragão: pedras dos rolos 2 a 4 viram wild (scatter não queima)
    const pool = [];
    for (let c = 1; c <= 3; c++) grid[c].forEach((x, r) => { if (x.s !== SCATTER) pool.push([c, r]); });
    const k = BREATH_WILDS[0] + randInt(BREATH_WILDS[1] - BREATH_WILDS[0] + 1);
    breath = [];
    for (let i = 0; i < k; i++) {
      const [c, r] = pool.splice(randInt(pool.length), 1)[0];
      grid[c][r] = { s: WILD, g: false }; breath.push([c, r]);
    }
  }
  const steps = [];
  let total = 0;
  for (let k = 0; ; k++) {
    const wins = evaluate(grid, unit), mult = mults[Math.min(k, mults.length - 1)];
    const amount = r2(wins.reduce((a, w) => a + w.amount, 0) * mult);
    const step = { grid: copy(grid), wins, mult, amount, removed: [], gold: [] };
    steps.push(step);
    if (!wins.length) break;
    total += amount;
    // cascata: dourada vira wild, o resto some; o que sobra cai e entra pedra nova por cima
    const hit = new Set(wins.flatMap(w => w.cells.map(([c, r]) => c * 10 + r)));
    for (const key of hit) {
      const c = key / 10 | 0, r = key % 10, x = grid[c][r];
      if (x.g) { grid[c][r] = { s: WILD, g: false }; step.gold.push([c, r]); }
      else { grid[c][r] = null; step.removed.push([c, r]); }
    }
    grid = grid.map((col, c) => {
      const keep = col.filter(Boolean);
      return [...Array.from({ length: H[c] - keep.length }, () => drawCell(c, free)), ...keep];
    });
  }
  total = Math.min(r2(total), bet * MAX_WIN);
  const scat = countScatter(grid);
  const freeSpins = scat >= 3 ? (free ? FREE_SPINS : FREE_SPINS) + (scat - 3) * FREE_EXTRA : 0;
  return { start, breath, steps, total, scatters: scat, freeSpins, final: grid };
}

if (typeof module !== 'undefined') {
  module.exports = { get RTP() { return DRAGAO_RTP; }, FABRICA: DRAGAO_FABRICA, setRtp, SYMBOLS, H, WILD, SCATTER, MULTS, MULTS_FREE, evaluate, playRound, spinGrid };
  if (require.main === module) {
    const assert = require('assert');
    const G = rows => rows.map(col => col.map(s => (typeof s === 'object' ? s : { s, g: false })));
    // fa em 3 rolos: 1 caminho, 15 x (20/20)
    let w = evaluate(G([[2, 9, 9, 9], [2, 9, 10, 10, 10], [2, 10, 10, 10, 10], [11, 11, 11, 11, 11], [10, 10, 10, 10]]), 1);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.reels, x.ways]), [['fa', 3, 1]]);
    assert.strictEqual(w[0].amount, SYMBOLS[2].pay[0]);
    // wild conta como qualquer pedra e multiplica caminhos: 2 x 2 x 1 = 4 caminhos de dots
    w = evaluate(G([[9, 9, 3, 3], [9, 0, 3, 3, 3], [9, 3, 3, 3, 3], [4, 4, 4, 4, 4], [4, 4, 4, 4]]), 1);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.ways]), [['zhong', 2 * 4 * 4], ['dots', 4]]);
    // rodada: cascatas sobem o multiplicador e o total bate com a soma dos passos
    for (let i = 0; i < 2e4; i++) {
      const r = playRound(1, i % 2 === 1);
      const soma = r2(r.steps.reduce((a, s) => a + s.amount, 0));
      assert(Math.abs(Math.min(soma, MAX_WIN) - r.total) < 1e-9);
      r.steps.forEach((s, k) => assert.strictEqual(s.mult, (i % 2 ? MULTS_FREE : MULTS)[Math.min(k, 3)]));
      assert(r.final.every((col, c) => col.length === H[c] && col.every(Boolean)));
    }

    // RTP por simulação: giro base + todas as rodadas grátis que ele disparar
    const N = +process.argv[2] || 1e6, bet = 1;
    let paid = 0, hits = 0, fsTrig = 0, fsPaid = 0, breaths = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const r = playRound(bet);
      let win = r.total, fs = r.freeSpins;
      if (r.total > 0) hits++;
      if (r.breath) breaths++;
      if (fs) fsTrig++;
      while (fs > 0) { fs--; const f = playRound(bet, true); win += f.total; fsPaid += f.total; fs += f.freeSpins; }
      paid += win; max = Math.max(max, win);
    }
    const rtp = paid / N / bet;
    console.log(`RTP ${(rtp * 100).toFixed(2)}% | acerto ${(hits / N * 100).toFixed(1)}% | grátis 1 a cada ${(N / fsTrig).toFixed(0)} giros, pagam ${(fsPaid / fsTrig).toFixed(1)}x | sopro 1/${(N / breaths).toFixed(0)} | maior ${max.toFixed(0)}x`);
    console.log(`CAL p/ ${DRAGAO_FABRICA}: ${(CAL * DRAGAO_FABRICA / rtp).toFixed(4)}`);
    assert(rtp > 0.94 && rtp < 0.99, 'RTP fora da faixa 94–99%');
  }
}
