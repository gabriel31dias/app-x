// Lógica do slot 3x3 tema capivara. Rodar `node slot.js` = auto-teste de RTP.
const SYMBOLS = [
  // pay = multiplicador da aposta por linha (aposta total / 5) para 3 iguais
  { id: 'capivara', w: 4, pay: 250 }, // wild: substitui qualquer símbolo
  { id: 'tucano', w: 2, pay: 100 },
  { id: 'flor', w: 3, pay: 25 },
  { id: 'cogumelo', w: 4, pay: 10 },
  { id: 'borboleta', w: 6, pay: 8 },
  { id: 'laranja', w: 12, pay: 5 },
  { id: 'folha', w: 21, pay: 3 },
];
// RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
// Todos os prêmios escalam por RTP / fábrica; as chances não mudam.
const SLOT_FABRICA = 0.97, SLOT_PAYS = SYMBOLS.map(s => s.pay);
let SLOT_RTP;
function setRtp(r) {
  SLOT_RTP = r;
  SYMBOLS.forEach((s, i) => { s.pay = Math.round(SLOT_PAYS[i] * r / SLOT_FABRICA * 100) / 100; });
}
setRtp(globalThis.RTP_JOGOS?.capivara ?? SLOT_FABRICA);
const WILD = 0, EMPTY = -1;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [6, 4, 2]];
const FULL_SCREEN_MULT = 10; // tela cheia do mesmo símbolo (com wilds) = x10
const TOTAL_W = SYMBOLS.reduce((a, s) => a + s.w, 0);

// Bônus "Capivara da Sorte": escolhe 1 símbolo; só ele e o wild caem; casas preenchidas
// ficam travadas e as vazias giram de novo até sair prêmio (sempre termina pagando).
const FEATURE_CHANCE = 1 / 40;           // chance por giro
const FEATURE_CELL = { wild: 6, sym: 30 }; // % por casa vazia a cada giro do bônus; resto fica vazio

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

const spinGrid = () => Array.from({ length: 9 }, drawSymbol);

function evaluate(grid, bet) {
  const lineBet = bet / LINES.length, wins = [];
  LINES.forEach((line, li) => {
    const syms = line.map(i => grid[i]);
    if (syms.includes(EMPTY)) return;
    const base = syms.find(s => s !== WILD) ?? WILD;
    if (syms.every(s => s === base || s === WILD))
      wins.push({ line: li, cells: line, sym: base, amount: lineBet * SYMBOLS[base].pay });
  });
  let total = wins.reduce((a, w) => a + w.amount, 0);
  const base = grid.find(s => s !== WILD) ?? WILD;
  const fullScreen = !grid.includes(EMPTY) && grid.every(s => s === base || s === WILD);
  if (fullScreen) total *= FULL_SCREEN_MULT;
  return { wins, total: Math.round(total * 100) / 100, fullScreen };
}

function featureCell(sym) {
  const r = randInt(100);
  return r < FEATURE_CELL.wild ? WILD : r < FEATURE_CELL.wild + FEATURE_CELL.sym ? sym : EMPTY;
}

// Uma rodada completa. steps = grades a animar em ordem; a última é o resultado.
function playRound(bet) {
  if (randInt(1e6) < FEATURE_CHANCE * 1e6) return featureRound(bet);
  const g = spinGrid();
  return { steps: [g], feature: null, ...evaluate(g, bet) };
}

function featureRound(bet) {
  let sym;
  do sym = drawSymbol(); while (sym === WILD);
  const steps = [];
  let g = Array(9).fill(EMPTY), res;
  do {
    g = g.map(s => s === EMPTY ? featureCell(sym) : s);
    steps.push(g);
    res = evaluate(g, bet);
  } while (res.total === 0);
  return { steps, feature: sym, ...res };
}

if (typeof module !== 'undefined') {
  module.exports = { get RTP() { return SLOT_RTP; }, FABRICA: SLOT_FABRICA, setRtp, SYMBOLS, LINES, EMPTY, spinGrid, evaluate, playRound, featureRound };
  if (require.main === module) {
    const assert = require('assert');
    assert.strictEqual(evaluate([1, 1, 1, 2, 3, 4, 5, 6, 5], 5).total, 100); // linha de tucano
    assert.strictEqual(evaluate([0, 6, 6, 2, 3, 4, 5, 6, 5], 5).total, 3);   // wild substitui
    assert.strictEqual(evaluate([6, 6, 6, 6, 0, 6, 6, 6, 6], 5).total, 150); // tela cheia x10
    assert.strictEqual(evaluate([6, 6, 6, -1, -1, -1, -1, -1, -1], 5).total, 3); // vazio não paga nem vira tela cheia
    assert.strictEqual(evaluate([-1, -1, -1, -1, -1, -1, -1, -1, -1], 5).total, 0);

    // jogo base: RTP exato (linhas + tela cheia x10), fórmula fechada por símbolo
    const p = SYMBOLS.map(s => s.w / TOTAL_W), pw = p[WILD], pay = i => SYMBOLS[i].pay;
    let base = pw ** 3 * pay(WILD) + pw ** 9 * 9 * pay(WILD);
    for (let i = 1; i < p.length; i++)
      base += ((p[i] + pw) ** 3 - pw ** 3) * pay(i) + ((p[i] + pw) ** 9 - pw ** 9) * 9 * pay(i);

    // bônus: média por simulação (variância baixa, converge rápido)
    const N = 1e6, bet = 5;
    let featPaid = 0, respins = 0, max = 0;
    for (let i = 0; i < N; i++) {
      const r = featureRound(bet);
      assert(r.total > 0, 'bônus sempre paga');
      featPaid += r.total; respins += r.steps.length; max = Math.max(max, r.total);
    }
    const featEV = featPaid / N / bet;
    const rtp = (1 - FEATURE_CHANCE) * base + FEATURE_CHANCE * featEV;
    console.log(`Jogo base (exato): ${(base * 100).toFixed(2)}%`);
    console.log(`Bônus: 1 a cada ${1 / FEATURE_CHANCE} giros, paga em média ${featEV.toFixed(2)}x, ${(respins / N).toFixed(1)} giros por bônus, maior ${max / bet}x`);
    console.log(`RTP total: ${(rtp * 100).toFixed(2)}%  | vantagem da casa: ${((1 - rtp) * 100).toFixed(2)}%`);
    assert(rtp > 0.95 && rtp < 0.98, 'RTP fora da faixa 95–98%');
  }
}
