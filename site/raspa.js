// Motor da "Raspadinha Premiada": 9 casas; 3 prêmios iguais = ganha aquele valor (x aposta).
// O resultado é sorteado primeiro (tabela abaixo) e a cartela é montada pra mostrar exatamente ele.
// Rodar `node raspa.js` = auto-teste (regras + RTP).
const RP = (() => {
  // prêmios da cartela: multiplicador da aposta (R$ 1 apostado → R$ 1, 5, 10, 50, 100)
  const PRIZES = [
    { id: 'p1', mult: 1 }, { id: 'p5', mult: 5 }, { id: 'p10', mult: 10 }, { id: 'p50', mult: 50 }, { id: 'p100', mult: 100 },
  ];
  // chance de cada resultado por cartela (em 1/100000); o resto é cartela sem prêmio
  const ODDS = [30000, 5000, 1500, 250, 135]; // → RTP ~96%
  const TOTAL = 100000;

  // inteiro uniforme [0, n) via crypto, com rejeição para não ter viés
  function randInt(n) {
    const buf = new Uint32Array(1), lim = Math.floor(2 ** 32 / n) * n;
    do crypto.getRandomValues(buf); while (buf[0] >= lim);
    return buf[0] % n;
  }
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /** índice do prêmio ganho, ou -1 */
  function drawOutcome() {
    let r = randInt(TOTAL);
    for (let i = 0; i < ODDS.length; i++) if ((r -= ODDS[i]) < 0) return i;
    return -1;
  }

  /** monta 9 casas: ganhou = 3 do prêmio + no máximo 2 de cada outro; perdeu = no máximo 2 de cada */
  function buildCard(win) {
    const cells = [];
    if (win >= 0) cells.push(win, win, win);
    const pool = shuffle(PRIZES.flatMap((_, i) => (i === win ? [] : [i, i])));
    while (cells.length < 9) cells.push(pool.pop());
    return shuffle(cells);
  }

  /** prêmio que a cartela paga (confere a própria cartela, não confia no sorteio) */
  function evaluate(cells) {
    const n = {};
    cells.forEach(c => { n[c] = (n[c] || 0) + 1; });
    const hit = Object.keys(n).map(Number).filter(k => n[k] >= 3);
    return hit.length ? Math.max(...hit) : -1;
  }

  function play(bet) {
    const win = drawOutcome(), cells = buildCard(win);
    const prize = evaluate(cells);
    return { cells, prize, payout: prize < 0 ? 0 : Math.round(PRIZES[prize].mult * bet * 100) / 100 };
  }

  return { PRIZES, ODDS, TOTAL, buildCard, evaluate, play };
})();

if (typeof module !== 'undefined') {
  module.exports = RP;
  if (require.main === module) {
    const assert = require('assert');
    const { PRIZES, ODDS, TOTAL, buildCard, evaluate, play } = RP;
    for (let w = -1; w < PRIZES.length; w++) for (let k = 0; k < 2000; k++) {
      const c = buildCard(w);
      assert.strictEqual(c.length, 9);
      assert.strictEqual(evaluate(c), w, `cartela ${c} devia dar ${w}`);
    }
    const exact = ODDS.reduce((a, o, i) => a + o * PRIZES[i].mult, 0) / TOTAL;
    const N = +(process.argv[2] || 1e6); let paid = 0, hits = 0;
    for (let i = 0; i < N; i++) { const r = play(1); paid += r.payout; if (r.payout) hits++; }
    console.log(`RTP exato: ${(exact * 100).toFixed(2)}% | simulado: ${(paid / N * 100).toFixed(2)}% | ganha 1 a cada ${(N / hits).toFixed(1)} cartelas`);
    assert(exact > 0.95 && exact < 0.97, 'RTP fora de 95–97%');
  }
}
