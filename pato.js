// Motor do "Pato Bolado Crash". O ponto de queda é sorteado ANTES da rodada:
// crash = max(1.00, floor(100 * RTP / (1 - U)) / 100). A chance de passar de x é RTP / x,
// então sacar em qualquer x devolve RTP em média. Rodar `node pato.js` = auto-teste.
const PB = (() => {
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
  const FABRICA = 0.96, MAX = 1000;
  let RTP = globalThis.RTP_JOGOS?.pato ?? FABRICA;
  const setRtp = r => { RTP = r; }; // vale a partir do próximo voo (o ponto de queda é sorteado no começo)

  // [0, 1) uniforme via crypto (53 bits)
  function rand() {
    const b = new Uint32Array(2); crypto.getRandomValues(b);
    return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53;
  }

  function drawCrash() {
    return Math.min(MAX, Math.max(1, Math.floor(100 * RTP / (1 - rand())) / 100));
  }

  // curva do multiplicador no tempo: 1.00x em t=0, dobra a cada ~6,9 s e acelera
  const multAt = ms => Math.floor(100 * Math.exp(0.0001 * ms)) / 100;
  const timeFor = m => Math.log(m) / 0.0001;

  /** resultado de uma aposta: saca em `cashAt` (auto ou manual) se não cair antes */
  function settle(bet, cashAt, crash) {
    const ok = cashAt <= crash;
    return { ok, payout: ok ? Math.round(bet * cashAt * 100) / 100 : 0 };
  }

  return { get RTP() { return RTP; }, FABRICA, setRtp, MAX, drawCrash, multAt, timeFor, settle };
})();

if (typeof module !== 'undefined') {
  module.exports = PB;
  if (require.main === module) {
    const assert = require('assert');
    const { drawCrash, multAt, timeFor, settle } = PB;
    assert.strictEqual(multAt(0), 1);
    assert(Math.abs(multAt(timeFor(2)) - 2) < 0.011);
    assert.deepStrictEqual(settle(10, 2, 2.5), { ok: true, payout: 20 });
    assert.deepStrictEqual(settle(10, 3, 2.5), { ok: false, payout: 0 });
    const N = +(process.argv[2] || 2e6), crashes = Array.from({ length: N }, drawCrash);
    for (const x of [1.1, 1.5, 2, 5, 10, 50]) {
      const rtp = crashes.reduce((a, c) => a + settle(1, x, c).payout, 0) / N;
      console.log(`sacando em ${x}x: RTP ${(rtp * 100).toFixed(2)}%`);
      assert(Math.abs(rtp - PB.RTP) < (x >= 50 ? 0.08 : 0.015), `RTP fora em ${x}x`);
    }
    console.log(`cai em 1.00x: ${(crashes.filter(c => c === 1).length / N * 100).toFixed(2)}% das rodadas`);
  }
}
