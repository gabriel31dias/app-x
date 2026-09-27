// Confere que o RTP do painel chega nos motores: `node tools/rtp_check.js`.
// Liga todos em 90% (como o api/rtp.js faria no navegador) e mede os que convergem rápido.
const assert = require('assert');
globalThis.RTP_JOGOS = Object.fromEntries(['capivara', 'gatinho', 'papagaio', 'macaco', 'raspa', 'bichos', 'crash', 'truco', 'sinuca', 'velha', 'perereca'].map(j => [j, 0.9]));
const eng = j => require(`../${j === 'capivara' ? 'slot' : j}.js`);
const pct = x => (x * 100).toFixed(2) + '%';

for (const j of Object.keys(RTP_JOGOS)) assert.strictEqual(eng(j).RTP, 0.9, `${j} não leu o RTP`);

const rp = eng('raspa'), raspa = rp.ODDS.reduce((a, o, i) => a + o * rp.PRIZES[i].mult, 0) / rp.TOTAL;
const cr = eng('crash'), N = 1e6;
let crash = 0; for (let i = 0; i < N; i++) crash += cr.settle(1, 2, cr.drawCrash()).payout;
const bx = eng('bichos');
let bichos = 0; for (let i = 0; i < N; i++) bichos += bx.play({ type: 'grupo', animals: [7], amount: 1 }).payout;
console.log(`raspa ${pct(raspa)} | crash (saca 2x) ${pct(crash / N)} | bichos grupo ${pct(bichos / N)} (paga ${bx.BETS.grupo.paga}x)`);
assert(Math.abs(raspa - 0.9) < 0.002 && Math.abs(crash / N - 0.9) < 0.01 && Math.abs(bichos / N - 0.9) < 0.02);

// habilidade: pagamento escala junto (o retorno médio segue a mesma proporção)
assert.strictEqual(eng('sinuca').PAYOUT, 1.8);
assert.strictEqual(eng('truco').PAYOUT.medio, 1.78);
assert.strictEqual(eng('velha').VITORIA, 1.47);
assert.strictEqual(eng('capivara').SYMBOLS[0].pay, Math.round(250 * 0.9 / 0.97 * 100) / 100);
// ao vivo: setRtp troca a tabela com o jogo aberto e volta exatamente pra de fábrica
for (const j of Object.keys(RTP_JOGOS)) {
  const m = eng(j);
  m.setRtp(0.95);
  assert.strictEqual(m.RTP, 0.95, `${j}: setRtp não mudou o RTP`);
}
assert.strictEqual(eng('sinuca').PAYOUT, 1.9);
assert.strictEqual(eng('velha').VITORIA, 1.55);
assert.strictEqual(eng('truco').PAYOUT.medio, 1.88);
assert.strictEqual(eng('bichos').BETS.grupo.paga, 23.75);
eng('capivara').setRtp(0.97);
assert.strictEqual(eng('capivara').SYMBOLS[0].pay, 250, 'voltar pra fábrica tem que dar a tabela original');
const rp2 = eng('raspa'); rp2.setRtp(0.96);
assert.deepStrictEqual(rp2.ODDS, [30000, 5000, 1500, 250, 135]);
const cr2 = eng('crash'); cr2.setRtp(0.96); let c2 = 0; for (let i = 0; i < 5e5; i++) c2 += cr2.settle(1, 2, cr2.drawCrash()).payout;
assert(Math.abs(c2 / 5e5 - 0.96) < 0.012, `crash depois do setRtp(0.96): ${c2 / 5e5}`);
console.log('ok');
