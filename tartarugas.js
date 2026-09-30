// Motor da "Corrida das Toruguitas". Cada tartaruga tem sua chance de ganhar (favoritas e azarões) e paga
// ODD = RTP / chance (arredondada pra baixo nos centavos), então qualquer tartaruga devolve RTP em média.
// A ordem de chegada inteira é sorteada ANTES da largada (vencedora pela chance; o resto também pesado pela
// chance, sem repetir), com gerador criptográfico; a animação só encena. Rodar `node tartarugas.js` = auto-teste.
const TT = (() => {
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp entre corridas.
  const FABRICA = 0.90;
  const NOMES = ['Lentação', 'Preguiça', 'Relâmpuga', 'Fofura', 'Cascudinha'];
  const CHANCE = [0.28, 0.19, 0.25, 0.12, 0.16]; // soma 1; mesma ordem de favoritismo do mockup (Lentação a mais cotada)
  let RTP = globalThis.RTP_JOGOS?.tartarugas ?? FABRICA;
  const odd = i => Math.floor(RTP / CHANCE[i] * 100) / 100;
  const setRtp = r => { RTP = r; };

  // [0, 1) uniforme via crypto (53 bits)
  function rand() {
    const b = new Uint32Array(2); crypto.getRandomValues(b);
    return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53;
  }
  /** ordem de chegada (índices 0..4): cada posição sorteada entre as que sobraram, pesada pela chance */
  function sortear() {
    const resto = [0, 1, 2, 3, 4], ordem = [];
    while (resto.length) {
      let u = rand() * resto.reduce((a, i) => a + CHANCE[i], 0), k = 0;
      while (k < resto.length - 1 && (u -= CHANCE[resto[k]]) >= 0) k++;
      ordem.push(resto.splice(k, 1)[0]);
    }
    return ordem;
  }
  const premio = (bet, escolhida, ordem) => ordem[0] === escolhida ? Math.round(bet * odd(escolhida) * 100) / 100 : 0;

  return { get RTP() { return RTP; }, FABRICA, setRtp, NOMES, CHANCE, odd, sortear, premio };
})();

if (typeof module !== 'undefined') {
  module.exports = TT;
  if (require.main === module) {
    const assert = require('assert');
    const { sortear, premio, CHANCE, odd, NOMES } = TT;
    assert(Math.abs(CHANCE.reduce((a, b) => a + b) - 1) < 1e-9);
    const o = sortear(); assert.deepStrictEqual([...o].sort(), [0, 1, 2, 3, 4]);
    const N = +(process.argv[2] || 1e6), vit = Array(5).fill(0), pago = Array(5).fill(0);
    for (let i = 0; i < N; i++) { const ordem = sortear(); vit[ordem[0]]++; for (let t = 0; t < 5; t++) pago[t] += premio(1, t, ordem); }
    for (let t = 0; t < 5; t++) {
      console.log(`${NOMES[t].padEnd(11)} ganha ${(vit[t] / N * 100).toFixed(2)}% (esperado ${CHANCE[t] * 100}%) · paga ${odd(t)}x · RTP ${(pago[t] / N * 100).toFixed(2)}%`);
      assert(Math.abs(vit[t] / N - CHANCE[t]) < 0.003, 'chance errada');
      assert(Math.abs(pago[t] / N - TT.RTP) < 0.015 && odd(t) * CHANCE[t] <= TT.RTP + 1e-9, 'RTP errado');
    }
  }
}
