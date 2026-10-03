// Lógica do "Jogo do Lalau": 5 rolos x 3 linhas, 243 caminhos. Rodar `node lalau.js` = auto-teste e RTP por simulação.
// - Paga da esquerda pra direita: símbolo em rolos vizinhos a partir do 1º (3, 4 ou 5 rolos). Caminhos = produto das
//   quantidades em cada rolo. Prêmio = aposta/20 x tabela x caminhos (x2 nas grátis).
// - WILD (placa) só nos rolos 2 a 4 e substitui tudo menos o SCATTER (baú). Nas grátis o WILD cresce e toma o rolo inteiro.
// - 3+ baús na tela: 8 rodadas grátis (+2 por baú a mais), redisparam.
// - Lalau passeando: em alguns giros do jogo base o Lalau atravessa a tela; quem clicar nele ganha 5 rodadas grátis.
//   O RTP conta como se todo mundo clicasse (pior caso pra casa).
const H = 3, R = 5;
const WILD = 0, SCATTER = 1;
const SYMBOLS = [
  // pay = [3, 4, 5 rolos] x (aposta / 20); w = peso nos rolos
  { id: 'wild', w: 2.4 }, // só nos rolos 2 a 4
  { id: 'chest', w: 1.6 },
  { id: 'lalau', w: 3, pay: [17, 51, 170] },
  { id: 'fish', w: 3.6, pay: [10.2, 34, 102] },
  { id: 'crown', w: 4.2, pay: [8.5, 25.5, 68] },
  { id: 'hammock', w: 4.8, pay: [6.8, 17, 51] },
  { id: 'cooler', w: 5.4, pay: [5.1, 13.6, 34] },
  { id: 'beer', w: 6, pay: [3.4, 10.2, 27.2] },
  { id: 'hook', w: 7, pay: [1.7, 5.1, 13.6] },
  { id: 'lily', w: 7, pay: [1.7, 5.1, 13.6] },
];
const FREE_SPINS = 8, FREE_EXTRA = 2, FREE_MULT = 2;
const WALK_CHANCE = 1 / 60, WALK_SPINS = 5; // Lalau passeando
const MAX_WIN = 5000;                       // teto por giro, em apostas

// RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
// Todos os prêmios escalam por RTP / fábrica; as chances não mudam.
// CAL = acerto da tabela pra dar exatamente a fábrica (medido com `node lalau.js 4000000`).
const LALAU_FABRICA = 0.965, CAL = 0.998;
const BASE_PAYS = SYMBOLS.map(s => s.pay && s.pay.slice());
let LALAU_RTP;
function setRtp(r) {
  LALAU_RTP = r;
  SYMBOLS.forEach((s, i) => { if (s.pay) s.pay = BASE_PAYS[i].map(p => Math.round(p * CAL * r / LALAU_FABRICA * 1000) / 1000); });
}
setRtp(globalThis.RTP_JOGOS?.lalau ?? LALAU_FABRICA);

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

// wild só nos rolos 2 a 4: pesos separados
const wildOk = c => c > 0 && c < R - 1;
const TOTAL = [false, true].map(w => SYMBOLS.reduce((a, s, i) => a + (i === WILD && !w ? 0 : s.w), 0));
function drawCell(c) {
  const ok = wildOk(c);
  let r = rand() * TOTAL[+ok];
  for (let i = 0; i < SYMBOLS.length; i++) {
    if (i === WILD && !ok) continue;
    if ((r -= SYMBOLS[i].w) < 0) return i;
  }
  return SYMBOLS.length - 1;
}
// rolo com pilhas curtas: cada sorteio ocupa 1 ou 2 casas; baú no máx. 1 por rolo
const STACK2 = 0.3;
function drawCol(c) {
  const col = [];
  while (col.length < H) {
    const s = drawCell(c);
    if (s === SCATTER && col.includes(SCATTER)) continue;
    const k = s === SCATTER ? 1 : 1 + (rand() < STACK2);
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

// Um giro. start = tela que os rolos mostram ao parar; grows = rolos onde o wild cresce (só nas grátis).
function playRound(bet, free = false) {
  const unit = bet / 20, start = spinGrid(), grid = start.map(col => col.slice());
  const grows = [];
  if (free) grid.forEach((col, c) => { if (col.includes(WILD)) { grows.push(c); col.fill(WILD); } });
  const mult = free ? FREE_MULT : 1;
  const wins = evaluate(grid, unit);
  const base = r2(wins.reduce((a, w) => a + w.amount, 0));
  const total = Math.min(r2(base * mult), bet * MAX_WIN);
  const scat = countScatter(grid);
  const freeSpins = scat >= 3 ? FREE_SPINS + (scat - 3) * FREE_EXTRA : 0;
  const walker = !free && !freeSpins && rand() < WALK_CHANCE;
  return { start, grows, grid, wins, base, mult, total, scatters: scat, freeSpins, walker };
}

if (typeof module !== 'undefined') {
  module.exports = { get RTP() { return LALAU_RTP; }, FABRICA: LALAU_FABRICA, setRtp, SYMBOLS, H, R, WILD, SCATTER, WALK_SPINS, evaluate, playRound, spinGrid };
  if (require.main === module) {
    const assert = require('assert');
    const I = id => SYMBOLS.findIndex(s => s.id === id);
    const [la, fi, be, ho, li] = ['lalau', 'fish', 'beer', 'hook', 'lily'].map(I);
    // lalau em 3 rolos: 1 caminho
    let w = evaluate([[la, fi, fi], [ho, la, ho], [be, be, la], [li, li, li], [fi, fi, fi]], 1);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.reels, x.ways]), [['lalau', 3, 1]]);
    assert.strictEqual(w[0].amount, SYMBOLS[la].pay[0]);
    // wild conta como qualquer símbolo e multiplica caminhos: 2 x (1 wild + 1 beer) x 1 x 1 x 1 de beer
    w = evaluate([[be, be, li], [WILD, be, ho], [be, ho, ho], [be, li, li], [be, fi, fi]], 1);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.reels, x.ways]), [['beer', 5, 4]]);
    // wild só nos rolos 2 a 4; nas grátis o wild toma o rolo e paga x2; lalau não passeia nas grátis
    for (let i = 0; i < 2e4; i++) {
      const free = i % 2 === 1, r = playRound(1, free);
      assert(!r.start[0].includes(WILD) && !r.start[R - 1].includes(WILD));
      assert(Math.abs(Math.min(r2(r.base * (free ? FREE_MULT : 1)), MAX_WIN) - r.total) < 1e-9);
      r.grows.forEach(c => assert(r.grid[c].every(x => x === WILD)));
      if (free) assert(!r.walker);
    }

    // RTP por simulação: giro base + todas as grátis que ele disparar (baú ou clique no Lalau passeando)
    const N = +process.argv[2] || 1e6, bet = 1;
    let paid = 0, hits = 0, fsTrig = 0, fsPaid = 0, walks = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const r = playRound(bet);
      let win = r.total, fs = r.freeSpins + (r.walker ? WALK_SPINS : 0);
      if (r.total > 0) hits++;
      if (r.walker) walks++;
      if (r.freeSpins) fsTrig++;
      while (fs > 0) {
        fs--;
        const f = playRound(bet, true);
        win += f.total; fsPaid += f.total; fs += f.freeSpins;
      }
      paid += win; max = Math.max(max, win);
    }
    const rtp = paid / N / bet;
    console.log(`RTP ${(rtp * 100).toFixed(2)}% | acerto ${(hits / N * 100).toFixed(1)}% | baú 1 a cada ${(N / fsTrig).toFixed(0)} giros | Lalau passeia 1/${(N / walks).toFixed(0)} | grátis pagam ${(fsPaid / (fsTrig + walks)).toFixed(1)}x | maior ${max.toFixed(0)}x`);
    console.log(`CAL p/ ${LALAU_FABRICA}: ${(CAL * LALAU_FABRICA / rtp).toFixed(4)}`);
    assert(rtp > 0.94 && rtp < 0.99, 'RTP fora da faixa 94–99%');
  }
}
