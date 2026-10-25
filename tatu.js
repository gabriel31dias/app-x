// Motor do "Tatu na BR". O tatu atravessa faixa por faixa; cada nível de risco tem um número de faixas e uma chance
// fixa `p` de passar cada uma. Ter passado k faixas acontece com chance p^k e paga aposta × mult(k), com
// mult(k) = RTP / p^k (arredondado pra baixo), então sacar em qualquer faixa devolve o RTP em média.
// A última faixa saca sozinha. Rodar `node tatu.js` = auto-teste.
const TT = (() => {
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp entre séries.
  const FABRICA = 0.90;
  const NIVEIS = [
    { id: 'facil', nome: 'Fácil', faixas: 15, p: 0.92 },
    { id: 'medio', nome: 'Médio', faixas: 12, p: 0.80 },
    { id: 'dificil', nome: 'Difícil', faixas: 9, p: 0.65 },
    { id: 'destemido', nome: 'Destemido', faixas: 6, p: 0.45 },
  ];
  let RTP = globalThis.RTP_JOGOS?.tatu ?? FABRICA;
  const setRtp = r => { RTP = r; };

  // [0, 1) uniforme via crypto (53 bits)
  function rand() {
    const b = new Uint32Array(2); crypto.getRandomValues(b);
    return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53;
  }

  /** multiplicador depois de k faixas no nível n (0 faixas = 1x, a aposta de volta) */
  const mult = (n, k) => k ? Math.floor(RTP / NIVEIS[n].p ** k * 100 + 1e-9) / 100 : 1;
  /** sorteia a próxima faixa: true = passou */
  const passa = n => rand() < NIVEIS[n].p;
  const fim = (n, k) => k >= NIVEIS[n].faixas;
  const premio = (bet, n, k) => Math.round(bet * mult(n, k) * 100) / 100;

  return { get RTP() { return RTP; }, FABRICA, setRtp, NIVEIS, mult, passa, fim, premio, rand };
})();

if (typeof module !== 'undefined') {
  module.exports = TT;
  if (require.main === module) {
    const assert = require('assert');
    const { NIVEIS, mult, passa, fim, premio } = TT;
    NIVEIS.forEach((v, n) => {
      assert.strictEqual(mult(n, 0), 1);
      for (let k = 2; k <= v.faixas; k++) assert(mult(n, k) > mult(n, k - 1), 'escada tem que subir');
      assert(fim(n, v.faixas) && !fim(n, v.faixas - 1));
      console.log(`${v.nome}: ${Array.from({ length: v.faixas }, (_, i) => mult(n, i + 1) + 'x').join(' ')}`);
    });
    assert.strictEqual(premio(10, 3, 1), 20); // Destemido, 1ª faixa: 0.90 / 0.45 = 2x
    const N = +(process.argv[2] || 3e5);
    // estratégia "saca depois de k faixas": anda até k ou até ser atropelado
    NIVEIS.forEach((v, n) => {
      for (const k of [1, Math.ceil(v.faixas / 2), v.faixas]) {
        let pago = 0;
        for (let i = 0; i < N; i++) {
          let f = 0;
          while (f < k && passa(n)) f++;
          if (f === k) pago += mult(n, k);
        }
        const rtp = pago / N, tol = 4 * Math.sqrt(mult(n, k) * TT.RTP / N) + 0.01; // o ruído cresce com o multiplicador
        console.log(`${v.nome}, saca na faixa ${k} (${mult(n, k)}x): RTP ${(rtp * 100).toFixed(2)}%`);
        assert(Math.abs(rtp - TT.RTP) < tol, `RTP fora: ${v.nome} faixa ${k}`);
      }
    });
  }
}
