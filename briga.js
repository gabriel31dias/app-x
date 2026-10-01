// Motor da "Briga de Bêbados". Antes de cada briga sorteia a "forma" (quantas doses cada um tomou: mais bêbado,
// menos chance) e a odd de cada lado = RTP / chance (arredondada pra baixo). Ao apostar, o vencedor é sorteado com
// gerador criptográfico; a pancadaria só encena o resultado. Rodar `node briga.js` = auto-teste.
const BG = (() => {
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp entre brigas.
  const FABRICA = 0.92;
  const NOMES = ['Zé Torto', 'Tonhão'];
  let RTP = globalThis.RTP_JOGOS?.briga ?? FABRICA;
  const setRtp = r => { RTP = r; };

  // inteiro uniforme em [0, n) via crypto, sem viés (rejeita o resto)
  function randInt(n) {
    const b = new Uint32Array(1), lim = 2 ** 32 - (2 ** 32 % n);
    do crypto.getRandomValues(b); while (b[0] >= lim);
    return b[0] % n;
  }
  /** doses de 1 a 8 cada; chance do Zé = 50% ± 4 pontos por dose de diferença (de 22% a 78%) */
  function forma() {
    const doses = [1 + randInt(8), 1 + randInt(8)], q = (50 + (doses[1] - doses[0]) * 4) / 100;
    return { doses, chance: [q, Math.round((1 - q) * 100) / 100] };
  }
  // pra baixo: o retorno nunca passa do RTP
  const odd = chance => Math.floor(RTP / chance * 100) / 100;
  /** 0 = Zé, 1 = Tonhão */
  const sortear = f => randInt(100) < f.chance[0] * 100 ? 0 : 1;
  const premio = (bet, escolha, vencedor, o) => escolha === vencedor ? Math.round(bet * o * 100) / 100 : 0;

  return { get RTP() { return RTP; }, FABRICA, setRtp, NOMES, forma, odd, sortear, premio, randInt };
})();

if (typeof module !== 'undefined') {
  module.exports = BG;
  if (require.main === module) {
    const assert = require('assert');
    const { forma, odd, sortear, premio } = BG;
    const f0 = forma(); assert(f0.chance[0] >= .22 && f0.chance[0] <= .78 && Math.abs(f0.chance[0] + f0.chance[1] - 1) < 1e-9);
    assert.strictEqual(premio(10, 1, 1, 2.5), 25); assert.strictEqual(premio(10, 0, 1, 2.5), 0);
    const M = +(process.argv[2] || 1e6);
    let pago = 0, vZe = 0, qZe = 0;
    for (let i = 0; i < M; i++) {
      const f = forma(), lado = i & 1, w = sortear(f);
      qZe += f.chance[0]; vZe += w === 0;
      pago += premio(1, lado, w, odd(f.chance[lado]));
    }
    console.log(`Zé venceu ${(vZe / M * 100).toFixed(2)}% (esperado ${(qZe / M * 100).toFixed(2)}%) | RTP ${(pago / M * 100).toFixed(2)}% (alvo ${BG.RTP * 100}%)`);
    assert(Math.abs(vZe - qZe) / M < .003, 'sorteio viciado');
    assert(pago / M < BG.RTP + .005 && pago / M > BG.RTP - .015);
  }
}
