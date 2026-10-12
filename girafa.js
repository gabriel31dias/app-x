// Lógica da "Girafa Doidona": 5 rolos x 3 linhas, 243 caminhos. Rodar `node girafa.js` = auto-teste e RTP por simulação.
// - Paga da esquerda pra direita: símbolo em rolos vizinhos a partir do 1º (3, 4 ou 5 rolos). Caminhos = produto das
//   quantidades em cada rolo. Prêmio = aposta/20 x tabela x caminhos x multiplicador.
// - WILD só nos rolos 2 a 5 e substitui tudo menos o BONUS.
// - Lambida da Girafa: em alguns giros a girafa lambe a tela e 2 a 5 casas dos rolos 2 a 5 viram WILD.
// - 3+ BONUS: Girafa Doidona (10 rodadas grátis, +2 por bônus a mais). O multiplicador começa em x1 e sobe +1 a cada
//   giro grátis que paga (até x15). BONUS de novo nas grátis = mais giros.
const H = 3, R = 5;
const WILD = 0, BONUS = 1;
const SYMBOLS = [
  // pay = [3, 4, 5 rolos] x (aposta / 20); w = peso nos rolos
  { id: 'wild', w: 2 }, // só nos rolos 2 a 5
  { id: 'bonus', w: 2.5 },
  { id: 'g_crazy', w: 2.6, pay: [15, 50, 200] },
  { id: 'g_love', w: 3, pay: [12, 40, 125] },
  { id: 'g_cool', w: 3.4, pay: [9, 28, 90] },
  { id: 'g_hypno', w: 3.8, pay: [8, 22, 75] },
  { id: 'melon', w: 4.6, pay: [5, 15, 50] },
  { id: 'pineapple', w: 5, pay: [4.5, 12, 40] },
  { id: 'banana', w: 5.4, pay: [4, 10, 30] },
  { id: 'coconut', w: 5.8, pay: [3, 9, 25] },
  { id: 'A', w: 6.4, pay: [2, 6, 18] },
  { id: 'K', w: 6.6, pay: [2, 6, 18] },
  { id: 'Q', w: 6.8, pay: [1.5, 5, 15] },
  { id: 'J', w: 7, pay: [1.5, 5, 15] },
  { id: '10', w: 7.2, pay: [1, 4, 12] },
];
const FREE_SPINS = 10, FREE_EXTRA = 2, MULT_MAX = 15;
const LICK = 1 / 10;   // chance da Lambida no jogo base (nas grátis é o dobro)
const MAX_WIN = 5000;  // teto por giro, em apostas

// RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
// Todos os prêmios escalam por RTP / fábrica; as chances não mudam.
// CAL = acerto da tabela pra dar exatamente a fábrica (medido com `node girafa.js 4000000`).
const GIRAFA_FABRICA = 0.965, CAL = 0.989;
const BASE_PAYS = SYMBOLS.map(s => s.pay && s.pay.slice());
let GIRAFA_RTP;
function setRtp(r) {
  GIRAFA_RTP = r;
  SYMBOLS.forEach((s, i) => { if (s.pay) s.pay = BASE_PAYS[i].map(p => Math.round(p * CAL * r / GIRAFA_FABRICA * 1000) / 1000); });
}
setRtp(globalThis.RTP_JOGOS?.girafa ?? GIRAFA_FABRICA);

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

const wildOk = c => c > 0;
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
// rolo com pilhas curtas: cada sorteio ocupa 1 ou 2 casas; bônus no máx. 1 por rolo
const STACK2 = 0.3;
function drawCol(c) {
  const col = [];
  while (col.length < H) {
    const s = drawCell(c);
    if (s === BONUS && col.includes(BONUS)) continue;
    const k = s === BONUS ? 1 : 1 + (rand() < STACK2);
    for (let i = 0; i < k && col.length < H; i++) col.push(s);
  }
  return col;
}
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
const countBonus = grid => grid.reduce((a, col) => a + col.filter(x => x === BONUS).length, 0);

// Um giro. start = tela que os rolos mostram ao parar; licked = casas que a Lambida virou WILD; mult = multiplicador das grátis.
function playRound(bet, free = false, mult = 1) {
  const unit = bet / 20, start = spinGrid(), grid = start.map(col => col.slice());
  const licked = [];
  if (rand() < LICK * (free ? 2 : 1)) {
    const n = 2 + randInt(4);
    const cand = [];
    for (let c = 1; c < R; c++) for (let r = 0; r < H; r++) if (grid[c][r] !== BONUS && grid[c][r] !== WILD) cand.push([c, r]);
    for (let i = 0; i < n && cand.length; i++) { const [c, r] = cand.splice(randInt(cand.length), 1)[0]; grid[c][r] = WILD; licked.push([c, r]); }
  }
  const wins = evaluate(grid, unit);
  const base = r2(wins.reduce((a, w) => a + w.amount, 0));
  const total = Math.min(r2(base * mult), bet * MAX_WIN);
  const bon = countBonus(grid);
  const freeSpins = bon >= 3 ? FREE_SPINS + (bon - 3) * FREE_EXTRA : 0;
  return { start, licked, grid, wins, base, mult, total, bonus: bon, freeSpins };
}
// multiplicador do próximo giro grátis
const nextMult = (mult, paid) => (paid ? Math.min(MULT_MAX, mult + 1) : mult);

if (typeof module !== 'undefined') {
  module.exports = { get RTP() { return GIRAFA_RTP; }, FABRICA: GIRAFA_FABRICA, setRtp, SYMBOLS, H, R, WILD, BONUS, MULT_MAX, evaluate, playRound, spinGrid, nextMult };
  if (require.main === module) {
    const assert = require('assert');
    const I = id => SYMBOLS.findIndex(s => s.id === id);
    const [gc, me, A, K, Q] = ['g_crazy', 'melon', 'A', 'K', 'Q'].map(I);
    let w = evaluate([[gc, me, me], [A, gc, A], [K, K, gc], [Q, Q, Q], [me, me, me]], 1);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.reels, x.ways]), [['g_crazy', 3, 1]]);
    w = evaluate([[A, A, K], [WILD, A, Q], [A, Q, Q], [A, K, K], [A, me, me]], 1);
    assert.deepStrictEqual(w.map(x => [SYMBOLS[x.sym].id, x.reels, x.ways]), [['A', 5, 4]]);
    assert.strictEqual(nextMult(3, true), 4); assert.strictEqual(nextMult(3, false), 3); assert.strictEqual(nextMult(MULT_MAX, true), MULT_MAX);
    for (let i = 0; i < 2e4; i++) {
      const r = playRound(1, i % 2 === 1, 1 + (i % 5));
      assert(!r.start[0].includes(WILD));
      r.licked.forEach(([c, rr]) => assert(c >= 1 && r.grid[c][rr] === WILD && r.start[c][rr] !== BONUS));
      assert(r.total <= MAX_WIN + 1e-9);
    }

    // RTP por simulação: giro base + todas as grátis que ele disparar (com o multiplicador crescendo)
    const N = +process.argv[2] || 1e6, bet = 1;
    let paid = 0, hits = 0, fsTrig = 0, fsPaid = 0, licks = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const r = playRound(bet);
      let win = r.total, fs = r.freeSpins, mult = 1;
      if (r.total > 0) hits++;
      if (r.freeSpins) fsTrig++;
      if (r.licked.length) licks++;
      while (fs > 0) {
        fs--;
        const f = playRound(bet, true, mult);
        win += f.total; fsPaid += f.total; fs += f.freeSpins; mult = nextMult(mult, f.total > 0);
      }
      paid += win; max = Math.max(max, win);
    }
    const rtp = paid / N / bet;
    console.log(`RTP ${(rtp * 100).toFixed(2)}% | acerto ${(hits / N * 100).toFixed(1)}% | grátis 1/${(N / fsTrig).toFixed(0)} (pagam ${(fsPaid / fsTrig).toFixed(1)}x, ${(fsPaid / paid * 100).toFixed(0)}% do RTP) | lambida 1/${(N / licks).toFixed(0)} | maior ${max.toFixed(0)}x`);
    console.log(`CAL p/ ${GIRAFA_FABRICA}: ${(CAL * GIRAFA_FABRICA / rtp).toFixed(4)}`);
    assert(rtp > 0.94 && rtp < 0.99, 'RTP fora da faixa 94–99%');
  }
}
