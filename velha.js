// Motor do "Jogo da Velha Aposta" (você = X, sempre começa; Computador = O).
// O computador joga perfeito, mas em cada jogada dele há chance de jogar numa casa sorteada
// (crypto): ERRO[n] na sua n-ésima jogada da partida (a 1ª é mais fácil pra todo mundo). Os pagamentos foram calculados pra que o MELHOR jogador possível
// receba no máximo RTP em média: quem joga pior recebe menos, ninguém passa de 96%.
// Rodar `node velha.js` = auto-teste (regras + RTP exato por expectimax + simulação).
const JV = (() => {
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
  const FABRICA = 0.96, ERRO = [0.30, 0.15, 0.15, 0.15];
  let RTP, EMPATE, VITORIA;
  function setRtp(r) {
    RTP = r;
    EMPATE = Math.round(0.5 * r / FABRICA * 100) / 100;
    VITORIA = Math.round(1.57 * r / FABRICA * 100) / 100;
  }
  setRtp(globalThis.RTP_JOGOS?.velha ?? FABRICA);
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  const rand = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] / 2 ** 32; };
  const pick = a => a[Math.floor(rand() * a.length)];

  /** 'X' | 'O' | 'draw' | null */
  function winner(b) {
    for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    return b.includes('') ? null : 'draw';
  }
  const winLine = b => LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]) || null;
  const free = b => b.flatMap((v, i) => (v ? [] : [i]));

  // minimax com memória: valor pra O (+1 O ganha, 0 empate, -1 X ganha)
  const memo = new Map();
  function value(b, turn) {
    const k = b.join(',') + turn;
    if (memo.has(k)) return memo.get(k);
    const w = winner(b);
    let v;
    if (w) v = w === 'O' ? 1 : w === 'X' ? -1 : 0;
    else {
      const vals = free(b).map(i => { const n = b.slice(); n[i] = turn; return value(n, turn === 'X' ? 'O' : 'X'); });
      v = turn === 'O' ? Math.max(...vals) : Math.min(...vals);
    }
    memo.set(k, v);
    return v;
  }
  /** melhores jogadas de O (perfeitas) */
  function bestO(b) {
    const opts = free(b).map(i => { const n = b.slice(); n[i] = 'O'; return [i, value(n, 'X')]; });
    const top = Math.max(...opts.map(o => o[1]));
    return opts.filter(o => o[1] === top).map(o => o[0]);
  }
  const erroAgora = b => ERRO[b.filter(v => v === 'O').length];
  /** jogada do computador: perfeita, ou casa sorteada com chance ERRO da vez */
  const botMove = b => (rand() < erroAgora(b) ? pick(free(b)) : pick(bestO(b)));

  const payout = (bet, w) => Math.round(bet * (w === 'X' ? VITORIA : w === 'draw' ? EMPATE : 0) * 100) / 100;

  return { get RTP() { return RTP; }, get EMPATE() { return EMPATE; }, get VITORIA() { return VITORIA; }, FABRICA, setRtp, ERRO, LINES, erroAgora, winner, winLine, free, bestO, botMove, payout };
})();

if (typeof module !== 'undefined') {
  module.exports = JV;
  if (require.main === module) {
    const assert = require('assert');
    const { RTP, EMPATE, VITORIA, erroAgora, winner, free, bestO, botMove, payout } = JV;
    const E = '';
    assert.strictEqual(winner(['X', 'X', 'X', E, 'O', 'O', E, E, E]), 'X');
    assert.strictEqual(winner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), 'draw');
    assert.strictEqual(winner(Array(9).fill(E)), null);
    assert.deepStrictEqual(bestO(['X', 'X', E, E, 'O', E, E, E, E]), [2]); // bloqueia
    assert.strictEqual(payout(10, 'X'), 15.7); assert.strictEqual(payout(10, 'draw'), 5); assert.strictEqual(payout(10, 'O'), 0);

    // retorno máximo exato: X escolhe a melhor casa, O é a mistura perfeita/aleatória
    const pay = w => (w === 'X' ? VITORIA : w === 'draw' ? EMPATE : 0);
    const mx = new Map(), mo = new Map();
    function evX(b) {
      const w = winner(b); if (w) return pay(w);
      const k = b.join(); if (mx.has(k)) return mx.get(k);
      const r = Math.max(...free(b).map(i => { const n = b.slice(); n[i] = 'X'; return evO(n); }));
      mx.set(k, r); return r;
    }
    function evO(b) {
      const w = winner(b); if (w) return pay(w);
      const k = b.join(); if (mo.has(k)) return mo.get(k);
      const ERRO = erroAgora(b), f = free(b), best = bestO(b);
      const next = i => { const n = b.slice(); n[i] = 'O'; return evX(n); };
      const r = (1 - ERRO) * best.reduce((a, i) => a + next(i), 0) / best.length + ERRO * f.reduce((a, i) => a + next(i), 0) / f.length;
      mo.set(k, r); return r;
    }
    const max = evX(Array(9).fill(E));
    console.log(`retorno máximo (jogando perfeito): ${(max * 100).toFixed(2)}%`);
    assert(max <= RTP + 1e-9 && max > RTP - 0.01, `RTP máximo fora: ${max}`);

    // simulação: jogador que escolhe casas ao acaso recebe bem menos
    let tot = 0; const N = 50000;
    for (let k = 0; k < N; k++) {
      const b = Array(9).fill(E); let w = null;
      while (!(w = winner(b))) { b[free(b)[Math.floor(Math.random() * free(b).length)]] = 'X'; if ((w = winner(b))) break; b[botMove(b)] = 'O'; }
      tot += pay(w);
    }
    console.log(`jogador aleatório: ${(tot / N * 100).toFixed(2)}%`);
    assert(tot / N < max);
  }
}
