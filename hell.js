// Lógica do "Hell Slots": 5 rolos x 3 linhas, 25 linhas fixas. Rodar `node hell.js` = auto-teste e RTP por simulação.
// - Paga da esquerda pra direita na linha: 3, 4 ou 5 iguais a partir do 1º rolo. Prêmio = aposta/25 x tabela.
// - WILD só nos rolos 2 a 4 e substitui tudo menos o SCATTER (pentagrama).
// - Toque da Morte: em alguns giros a Morte passa a foice e 1 ou 2 rolos do meio viram WILD inteiro.
// - Julgamento da Morte: raro; o jogador abre caveiras até achar 3 iguais e leva um jackpot (MINI, MINOR, MAJOR ou GRAND).
//   O jackpot já vem sorteado no giro; abrir as caveiras é só o suspense.
// - 3+ pentagramas: Noite da Morte, 8 rodadas grátis (+2 por pentagrama a mais) com ganhos x2 e o toque bem mais frequente.
const H = 3, R = 5;
const WILD = 0, SCATTER = 1;
const SYMBOLS = [
  // pay = [3, 4, 5 na linha] x (aposta / 25); w = peso nos rolos
  { id: 'wild', w: 2.2 }, // só nos rolos 2 a 4
  { id: 'scatter', w: 2.1 },
  { id: 'demon', w: 3, pay: [45, 180, 700] },
  { id: 'king', w: 3.4, pay: [35, 140, 450] },
  { id: 'banshee', w: 3.8, pay: [28, 100, 350] },
  { id: 'raven', w: 4.4, pay: [22, 70, 230] },
  { id: 'book', w: 5, pay: [18, 45, 175] },
  { id: 'hand', w: 5.6, pay: [14, 35, 115] },
  { id: 'dagger', w: 6.2, pay: [12, 28, 90] },
  { id: 'cross', w: 6.8, pay: [9, 23, 70] },
  { id: 'candles', w: 7.4, pay: [7, 18, 58] },
  { id: 'potion', w: 7.4, pay: [7, 18, 58] },
];
// 25 linhas: linha (0 = cima, 2 = baixo) em cada rolo
const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 2, 2, 2, 0],
  [2, 0, 0, 0, 2], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [1, 0, 2, 0, 1], [1, 2, 0, 2, 1],
];
const FREE_SPINS = 8, FREE_EXTRA = 2, FREE_MULT = 2;
const TOUCH = [1 / 16, 1 / 4];               // chance do Toque da Morte [base, grátis]
const JUDGE = 1 / 500;                        // chance do Julgamento (só no jogo base)
const JACKPOTS = [                            // em apostas; w = peso quando o Julgamento sai
  { id: 'mini', nome: 'MINI', x: 15, w: 70 }, { id: 'minor', nome: 'MINOR', x: 50, w: 22 },
  { id: 'major', nome: 'MAJOR', x: 200, w: 6.5 }, { id: 'grand', nome: 'GRAND', x: 1000, w: 1.5 },
];
const MAX_WIN = 5000;                         // teto por giro, em apostas

// RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
// Prêmios e jackpots escalam por RTP / fábrica; as chances não mudam.
// CAL = acerto da tabela pra dar exatamente a fábrica (medido com `node hell.js 4000000`).
const HELL_FABRICA = 0.965, CAL = 1.023;
const BASE_PAYS = SYMBOLS.map(s => s.pay && s.pay.slice()), BASE_JP = JACKPOTS.map(j => j.x);
let HELL_RTP;
function setRtp(r) {
  HELL_RTP = r;
  const k = CAL * r / HELL_FABRICA;
  SYMBOLS.forEach((s, i) => { if (s.pay) s.pay = BASE_PAYS[i].map(p => Math.round(p * k * 1000) / 1000); });
  JACKPOTS.forEach((j, i) => { j.x = Math.round(BASE_JP[i] * r / HELL_FABRICA * 100) / 100; }); // sem CAL: valor redondo na fábrica
}
setRtp(globalThis.RTP_JOGOS?.hell ?? HELL_FABRICA);

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
const pickW = list => { let r = rand() * list.reduce((a, x) => a + x.w, 0); for (const x of list) if ((r -= x.w) < 0) return x; return list[list.length - 1]; };

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
// rolo com pilhas curtas: cada sorteio ocupa 1 ou 2 casas; pentagrama no máx. 1 por rolo
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

// linhas: símbolo do 1º rolo (nunca é wild) seguido de iguais ou wild; cells = [coluna, linha] do ganho
function evaluate(grid, unit) {
  const wins = [];
  LINES.forEach((ln, li) => {
    const s = grid[0][ln[0]];
    if (s === SCATTER) return;
    let n = 1;
    while (n < R && (grid[n][ln[n]] === s || grid[n][ln[n]] === WILD)) n++;
    if (n >= 3) wins.push({ line: li, sym: s, n, cells: ln.slice(0, n).map((r, c) => [c, r]), amount: unit * SYMBOLS[s].pay[n - 3] });
  });
  return wins;
}

const r2 = v => Math.round(v * 100) / 100;
const countScatter = grid => grid.reduce((a, col) => a + col.filter(x => x === SCATTER).length, 0);

// Um giro. start = tela que os rolos mostram ao parar; touched = rolos que a Morte transformou em WILD.
function playRound(bet, free = false) {
  const unit = bet / 25, start = spinGrid(), grid = start.map(col => col.slice());
  const touched = [];
  if (rand() < TOUCH[+free]) {
    const reels = [1, 2, 3].sort(() => rand() - .5).slice(0, rand() < .3 ? 2 : 1).sort();
    reels.forEach(c => { touched.push(c); grid[c].fill(WILD); });
  }
  const mult = free ? FREE_MULT : 1;
  const wins = evaluate(grid, unit);
  const base = r2(wins.reduce((a, w) => a + w.amount, 0));
  const scat = countScatter(grid);
  const freeSpins = scat >= 3 ? FREE_SPINS + (scat - 3) * FREE_EXTRA : 0;
  const jackpot = !free && rand() < JUDGE ? pickW(JACKPOTS) : null;
  const jpWin = jackpot ? r2(bet * jackpot.x) : 0;
  const total = Math.min(r2(base * mult + jpWin), bet * MAX_WIN);
  return { start, touched, grid, wins, base, mult, jackpot: jackpot && jackpot.id, jpWin, total, scatters: scat, freeSpins };
}

if (typeof module !== 'undefined') {
  module.exports = { get RTP() { return HELL_RTP; }, FABRICA: HELL_FABRICA, setRtp, SYMBOLS, LINES, JACKPOTS, H, R, WILD, SCATTER, evaluate, playRound, spinGrid };
  if (require.main === module) {
    const assert = require('assert');
    const I = id => SYMBOLS.findIndex(s => s.id === id);
    const [de, ki, ra, po, ca] = ['demon', 'king', 'raven', 'potion', 'candles'].map(I);
    assert.strictEqual(LINES.length, 25);
    assert.strictEqual(new Set(LINES.map(l => l.join())).size, 25, 'linhas repetidas');
    // demônio na linha do meio em 3 rolos, o resto não forma nada
    let w = evaluate([[po, de, ca], [ca, de, po], [ra, de, ki], [ki, po, ra], [ca, ra, po]], 1);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.n, x.line]), [['demon', 3, 0]]);
    assert.strictEqual(w[0].amount, SYMBOLS[de].pay[0]);
    // wild completa a linha de cima até o 5º rolo
    w = evaluate([[ki, po, ca], [WILD, ca, po], [ki, ra, ca], [WILD, po, ra], [ki, ca, po]], 1);
    assert(w.some(x => x.line === 1 && x.sym === ki && x.n === 5));
    for (let i = 0; i < 2e4; i++) {
      const free = i % 2 === 1, r = playRound(1, free);
      assert(!r.start[0].includes(WILD) && !r.start[R - 1].includes(WILD));
      r.touched.forEach(c => assert(r.grid[c].every(x => x === WILD) && c >= 1 && c <= 3));
      if (free) assert(!r.jackpot);
      assert(r.total <= MAX_WIN);
    }

    // RTP por simulação: giro base + todas as grátis que ele disparar
    const N = +process.argv[2] || 1e6, bet = 1;
    let paid = 0, hits = 0, fsTrig = 0, fsPaid = 0, jp = 0, jpPaid = 0, touch = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const r = playRound(bet);
      let win = r.total, fs = r.freeSpins;
      if (r.total > 0) hits++;
      if (r.freeSpins) fsTrig++;
      if (r.jackpot) { jp++; jpPaid += r.jpWin; }
      if (r.touched.length) touch++;
      while (fs > 0) { fs--; const f = playRound(bet, true); win += f.total; fsPaid += f.total; fs += f.freeSpins; }
      paid += win; max = Math.max(max, win);
    }
    const rtp = paid / N / bet;
    console.log(`RTP ${(rtp * 100).toFixed(2)}% | acerto ${(hits / N * 100).toFixed(1)}% | grátis 1/${(N / fsTrig).toFixed(0)} (pagam ${(fsPaid / fsTrig).toFixed(1)}x, ${(fsPaid / paid * 100).toFixed(0)}% do RTP) | toque 1/${(N / touch).toFixed(0)} | jackpot 1/${(N / jp).toFixed(0)} (${(jpPaid / paid * 100).toFixed(0)}% do RTP) | maior ${max.toFixed(0)}x`);
    console.log(`CAL p/ ${HELL_FABRICA}: ${(CAL * HELL_FABRICA / rtp).toFixed(4)}`);
    assert(rtp > 0.94 && rtp < 0.99, 'RTP fora da faixa 94–99%');
  }
}
