// Motor da "Roleta do Inferno": roleta europeia (37 casas, um zero só). Com os pagamentos clássicos (pleno 35:1, dúzia 2:1,
// cor/par/ímpar/metade 1:1) qualquer aposta devolve 36/37 = 97,3% em média: a vantagem da casa vem só do zero.
// O sorteio é sempre uniforme; o RTP do painel escala os pagamentos (como no bichos). Rodar `node roleta.js` = auto-teste.
const RL = (() => {
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp entre rodadas.
  const FABRICA = 0.973;
  // ordem das casas na roda (sentido horário a partir do zero)
  const ORDEM = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const VERMELHOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const cor = n => n === 0 ? 'verde' : VERMELHOS.has(n) ? 'vermelho' : 'preto';
  const NUMS = Array.from({ length: 37 }, (_, i) => i);
  // apostas da mesa: id -> números cobertos
  const APOSTAS = {
    ...Object.fromEntries(NUMS.map(n => ['n' + n, [n]])),
    red: NUMS.filter(n => cor(n) === 'vermelho'), black: NUMS.filter(n => cor(n) === 'preto'),
    even: NUMS.filter(n => n && n % 2 === 0), odd: NUMS.filter(n => n % 2 === 1),
    low: NUMS.filter(n => n >= 1 && n <= 18), high: NUMS.filter(n => n >= 19),
    d1: NUMS.filter(n => n >= 1 && n <= 12), d2: NUMS.filter(n => n >= 13 && n <= 24), d3: NUMS.filter(n => n >= 25),
  };
  let RTP = globalThis.RTP_JOGOS?.roleta ?? FABRICA;
  const setRtp = r => { RTP = r; };
  /** quanto volta por real apostado (aposta junto): pleno 36x, dúzia 3x, cor 2x no RTP de fábrica */
  const mult = id => Math.round(36 / APOSTAS[id].length * RTP / FABRICA * 100) / 100;

  // inteiro uniforme [0, n) via crypto, com rejeição para não ter viés
  function randInt(n) {
    const buf = new Uint32Array(1), lim = Math.floor(2 ** 32 / n) * n;
    do crypto.getRandomValues(buf); while (buf[0] >= lim);
    return buf[0] % n;
  }
  const girar = () => randInt(37);
  const ganha = (id, n) => APOSTAS[id].includes(n);
  /** prêmio total (aposta junto) das fichas `mesa` = { id: valor } quando sai `n` */
  const premio = (mesa, n) => Math.round(Object.entries(mesa).reduce((s, [id, v]) => s + (ganha(id, n) ? v * mult(id) : 0), 0) * 100) / 100;

  return { get RTP() { return RTP; }, FABRICA, setRtp, ORDEM, APOSTAS, cor, mult, girar, ganha, premio };
})();

if (typeof module !== 'undefined') {
  module.exports = RL;
  if (require.main === module) {
    const assert = require('assert');
    const { ORDEM, APOSTAS, cor, mult, girar, premio } = RL;
    assert.strictEqual(new Set(ORDEM).size, 37);
    assert.strictEqual(mult('n17'), 36); assert.strictEqual(mult('d2'), 3); assert.strictEqual(mult('red'), 2);
    assert.strictEqual(cor(0), 'verde'); assert.strictEqual(cor(32), 'vermelho'); assert.strictEqual(cor(15), 'preto');
    for (const k of ['red', 'black', 'even', 'odd', 'low', 'high']) assert.strictEqual(APOSTAS[k].length, 18, k);
    assert.strictEqual(premio({ n0: 1, red: 10 }, 0), 36); // zero: as de fora perdem
    assert.strictEqual(premio({ n7: 2, red: 5, odd: 5, d1: 1 }, 7), 72 + 10 + 10 + 3);
    // cada roda vizinha alterna cor (menos o zero)
    for (let i = 1; i < 36; i++) assert.notStrictEqual(cor(ORDEM[i]), cor(ORDEM[i + 1]));
    const N = +(process.argv[2] || 2e6), hist = new Array(37).fill(0);
    for (let i = 0; i < N; i++) hist[girar()]++;
    for (const h of hist) assert(Math.abs(h / N - 1 / 37) < 0.002, 'sorteio viciado');
    for (const r of [RL.FABRICA, 0.9]) {
      RL.setRtp(r);
      for (const id of ['n17', 'd1', 'red', 'odd', 'high']) {
        const rtp = hist.reduce((s, h, n) => s + h * premio({ [id]: 1 }, n), 0) / N;
        console.log(`RTP ${r} · ${id} (${mult(id)}x): ${(rtp * 100).toFixed(2)}%`);
        assert(Math.abs(rtp - r) < 0.01, `RTP fora em ${id}`);
      }
    }
  }
}
