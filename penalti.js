// Motor do "Pênalti na Várzea". Cada gol sobe um degrau da ESCADA (prêmio = aposta × ESCADA[gols-1]) e dá pra sacar
// entre as cobranças; o último degrau (3x) é o máximo que uma série paga. Chance de gol: 1ª cobrança RTP/ESCADA[0], as
// seguintes ESCADA[g-1]/ESCADA[g]. Assim a chance de chegar a k gols é RTP/ESCADA[k-1] e sacar depois de qualquer k
// devolve RTP em média. O lado escolhido não muda a chance (o goleiro é só a animação). Rodar `node penalti.js` = auto-teste.
const PN = (() => {
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp entre séries.
  const FABRICA = 0.85, ESCADA = [2, 3], MAX_GOLS = ESCADA.length;
  let RTP = globalThis.RTP_JOGOS?.penalti ?? FABRICA;
  const setRtp = r => { RTP = r; };

  // [0, 1) uniforme via crypto (53 bits)
  function rand() {
    const b = new Uint32Array(2); crypto.getRandomValues(b);
    return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53;
  }

  const mult = gols => gols ? ESCADA[gols - 1] : 1;
  /** sorteia a cobrança de quem já fez `gols` gols: true = gol */
  const chute = gols => rand() < (gols ? ESCADA[gols - 1] : RTP) / ESCADA[gols];
  /** a série acaba sozinha (saque automático) no último degrau */
  const fim = (bet, gols) => gols >= MAX_GOLS;
  const premio = (bet, gols) => Math.round(bet * mult(gols) * 100) / 100;

  return { get RTP() { return RTP; }, FABRICA, setRtp, ESCADA, MAX_GOLS, mult, chute, fim, premio, rand };
})();

if (typeof module !== 'undefined') {
  module.exports = PN;
  if (require.main === module) {
    const assert = require('assert');
    const { mult, chute, fim, premio, MAX_GOLS } = PN;
    assert.strictEqual(mult(0), 1); assert.strictEqual(mult(MAX_GOLS), 3);
    assert(fim(1, MAX_GOLS) && !fim(1, MAX_GOLS - 1));
    assert.strictEqual(premio(500, MAX_GOLS), 1500); // o máximo é 3x a aposta
    const N = +(process.argv[2] || 1e6);
    // estratégia "saca depois de k gols": joga até k gols ou até errar
    for (let k = 1; k <= MAX_GOLS; k++) {
      let pago = 0;
      for (let i = 0; i < N; i++) {
        let g = 0;
        while (g < k && chute(g)) g++;
        if (g === k) pago += mult(k);
      }
      const rtp = pago / N;
      console.log(`sacando depois de ${k} gol(s) (${mult(k)}x): RTP ${(rtp * 100).toFixed(2)}%`);
      assert(Math.abs(rtp - PN.RTP) < 0.01, `RTP fora em ${k} gols`);
    }
    for (let g = 0; g < MAX_GOLS; g++) { let n = 0; for (let i = 0; i < N; i++) n += chute(g); console.log(`gol na ${g + 1}ª cobrança: ${(n / N * 100).toFixed(1)}%`); }
  }
}
