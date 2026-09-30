// Motor da "Corrida dos Jegues". A ordem de chegada dos 5 jegues é sorteada ANTES da corrida (embaralhamento com
// gerador criptográfico); a animação só encena essa ordem. Acertar o vencedor paga PAGA = 5 × RTP a aposta
// (chance 1/5, então devolve RTP em média). Rodar `node jegues.js` = auto-teste.
const JG = (() => {
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp entre corridas.
  const FABRICA = 0.90, N = 5;
  const NOMES = ['Pé de Pano', 'Costelinha', 'Miserê', 'Relâmpago', 'Jerimum'];
  let RTP = globalThis.RTP_JOGOS?.jegues ?? FABRICA;
  const paga = () => Math.round(N * RTP * 100) / 100;
  const setRtp = r => { RTP = r; };

  // inteiro uniforme em [0, n) via crypto, sem viés (rejeita o resto)
  function randInt(n) {
    const b = new Uint32Array(1), lim = 2 ** 32 - (2 ** 32 % n);
    do crypto.getRandomValues(b); while (b[0] >= lim);
    return b[0] % n;
  }
  /** ordem de chegada: índices 0..4, o primeiro é o vencedor (Fisher-Yates) */
  function sortear() {
    const o = [0, 1, 2, 3, 4];
    for (let i = N - 1; i > 0; i--) { const j = randInt(i + 1); [o[i], o[j]] = [o[j], o[i]]; }
    return o;
  }
  const premio = (bet, escolhido, ordem) => ordem[0] === escolhido ? Math.round(bet * paga() * 100) / 100 : 0;

  return { get RTP() { return RTP; }, get PAGA() { return paga(); }, FABRICA, setRtp, N, NOMES, sortear, premio, randInt };
})();

if (typeof module !== 'undefined') {
  module.exports = JG;
  if (require.main === module) {
    const assert = require('assert');
    const { sortear, premio, N } = JG;
    const o = sortear(); assert.deepStrictEqual([...o].sort(), [0, 1, 2, 3, 4]);
    assert.strictEqual(premio(10, o[0], o), 10 * JG.PAGA); assert.strictEqual(premio(10, o[1], o), 0);
    const M = +(process.argv[2] || 1e6), vitorias = Array(N).fill(0);
    let pago = 0;
    for (let i = 0; i < M; i++) { const ordem = sortear(); vitorias[ordem[0]]++; pago += premio(1, 2, ordem); }
    console.log('vitórias por jegue:', vitorias.map(v => (v / M * 100).toFixed(2) + '%').join(' '), `| paga ${JG.PAGA}x`);
    console.log(`RTP apostando sempre no 3: ${(pago / M * 100).toFixed(2)}%`);
    for (const v of vitorias) assert(Math.abs(v / M - 1 / N) < 0.003, 'sorteio viciado');
    assert(Math.abs(pago / M - JG.RTP) < 0.01);
  }
}
