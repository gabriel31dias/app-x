// Motor do "Truco Aposta" (Truco Paulista, 2x2): Você + Carlos contra João + Bruno.
// Baralho de 40 cartas embaralhado por crypto; os bots só enxergam as próprias cartas e a mesa
// (sem trapaça). Vitória paga PAYOUT[mesa] x aposta, calibrado pra que o jogador típico
// (que joga como o bot médio) receba ~96% em média. `node truco.js` = auto-teste (regras + RTP); `node truco.js calib` = calibra pagamentos.
const TR = (() => {
  const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
  const SUITS = ['♦', '♠', '♥', '♣']; // ordem das manilhas: ouros < espadas < copas < paus
  const LADDER = [1, 3, 6, 9, 12];
  const LEVELS = ['facil', 'medio', 'dificil'];
  // pagamento por mesa, calibrado com `node truco.js calib` pra ~96% contra o jogador típico (nível médio)
  const PAYOUT = { facil: 1.25, medio: 1.90, dificil: 2.60 };
  // pagamento pelo histórico do jogador (avisado antes da partida): estima a chance de vitória dele na mesa
  // começando no jogador típico (peso K partidas) e paga RTP / chance. Histórico decai, então se ajusta.
  const RTP = 0.96, K = 20, DECAY = 0.97, PAY_MIN = 1.1, PAY_MAX = 3;
  function payoutFor(level, rec) {
    const p0 = RTP / PAYOUT[level], { n = 0, w = 0 } = rec || {};
    const p = (w + K * p0) / (n + K);
    return Math.min(PAY_MAX, Math.max(PAY_MIN, Math.floor(RTP / p * 100) / 100));
  }
  const record = (rec, won) => ({ n: (rec?.n || 0) * DECAY + 1, w: (rec?.w || 0) * DECAY + (won ? 1 : 0) });
  const team = s => s % 2; // assentos: 0 Você, 1 João, 2 Carlos, 3 Bruno (sentido horário)

  function randInt(n) {
    const buf = new Uint32Array(1), lim = Math.floor(2 ** 32 / n) * n;
    do crypto.getRandomValues(buf); while (buf[0] >= lim);
    return buf[0] % n;
  }
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const power = (st, c) => (c.r === st.manilha ? 10 + c.s : c.r);
  const nextValue = v => LADDER[LADDER.indexOf(v) + 1];

  function newMatch(level = 'medio') {
    // Carlos (parceiro) é sempre médio; o nível da mesa vale pros adversários
    return { score: [0, 0], starter: randInt(4), hand: null, winner: -1, level, levels: ['medio', level, 'medio', level] };
  }

  /** nova mão; mão = quem começa, roda a cada mão */
  function deal(m, deck) {
    deck ??= shuffle(RANKS.flatMap((_, r) => SUITS.map((_, s) => ({ r, s }))));
    const hands = [0, 1, 2, 3].map(i => deck.slice(i * 3, i * 3 + 3));
    const vira = deck[12], [a, b] = m.score;
    const st = {
      hands, vira, manilha: (vira.r + 1) % 10, starter: m.starter, turn: m.starter,
      trick: [], tricks: [], history: [], value: 1, lastRaiser: -1, pending: null,
      phase: 'play', noRaise: a === 11 || b === 11, result: null,
    };
    if ((a === 11) !== (b === 11)) { // mão de onze: o time com 11 vê as cartas e decide
      st.phase = 'eleven'; st.elevenTeam = a === 11 ? 0 : 1;
      st.decider = st.elevenTeam === 0 ? 0 : 1;
    }
    m.hand = st;
    return st;
  }

  /** quem age agora */
  const actor = st => (st.phase === 'eleven' ? st.decider : st.pending ? st.pending.responder : st.turn);
  const canRaise = (st, t) => !st.noRaise && st.phase === 'play' && st.value < 12 && st.lastRaiser !== t;
  // quem responde a aposta: o time 0 pelo humano (assento 0), o time 1 pelo João (assento 1)
  const responderFor = t => t;

  /** vencedor da vaza: time, ou -1 se empatou entre times diferentes */
  function trickWinner(st, plays) {
    const best = Math.max(...plays.map(p => power(st, p.card)));
    const top = plays.filter(p => power(st, p.card) === best);
    const teams = new Set(top.map(p => team(p.seat)));
    return { team: teams.size > 1 ? -1 : team(top[0].seat), lead: top[0].seat };
  }

  /** vencedor da mão pelas vazas: time, 'none' (tudo empatado) ou undefined (continua) */
  function handWinner(t) {
    for (const x of [0, 1]) if (t.filter(v => v === x).length >= 2) return x;
    if (t.length >= 2) {
      if (t[0] === -1 && t[1] !== -1) return t[1];
      if (t[0] !== -1 && t[1] === -1) return t[0];
    }
    if (t.length === 3) return t[2] !== -1 ? t[2] : t[0] !== -1 ? t[0] : 'none';
  }

  function finish(m, st, winTeam, pts) {
    st.phase = 'done';
    st.result = { team: winTeam, pts: winTeam === 'none' ? 0 : pts };
    if (winTeam !== 'none') m.score[winTeam] = Math.min(12, m.score[winTeam] + pts);
    if (m.score[0] >= 12) m.winner = 0; else if (m.score[1] >= 12) m.winner = 1;
    m.starter = (m.starter + 1) % 4;
  }

  /**
   * aplica a ação de quem está na vez:
   * {type:'play', i} | {type:'raise'} | {type:'accept'} | {type:'run'} | {type:'go'} (mão de onze)
   * devolve um evento pra UI animar: {type, seat, ...}
   */
  function apply(m, a) {
    const st = m.hand, seat = actor(st), t = team(seat);
    if (st.phase === 'eleven') {
      if (a.type === 'go') { st.phase = 'play'; st.value = 3; return { type: 'go', seat }; }
      if (a.type === 'run') { finish(m, st, 1 - t, 1); return { type: 'run', seat }; }
      throw new Error('ação inválida na mão de onze');
    }
    if (st.pending) {
      const p = st.pending;
      if (a.type === 'accept') { st.value = p.to; st.lastRaiser = p.by; st.pending = null; return { type: 'accept', seat, value: st.value }; }
      if (a.type === 'run') { st.pending = null; finish(m, st, p.by, st.value); return { type: 'run', seat }; }
      if (a.type === 'raise' && p.to < 12) {
        st.value = p.to; st.lastRaiser = p.by;
        st.pending = { to: nextValue(p.to), by: t, responder: responderFor(1 - t) };
        return { type: 'raise', seat, to: st.pending.to };
      }
      throw new Error('ação inválida com aposta pendente');
    }
    if (a.type === 'raise' && canRaise(st, t)) {
      st.pending = { to: nextValue(st.value), by: t, responder: responderFor(1 - t) };
      return { type: 'raise', seat, to: st.pending.to };
    }
    if (a.type !== 'play' || !st.hands[seat][a.i]) throw new Error('ação inválida');
    const card = st.hands[seat].splice(a.i, 1)[0];
    st.trick.push({ seat, card }); st.history.push(card);
    const ev = { type: 'play', seat, card };
    if (st.trick.length < 4) { st.turn = (st.turn + 1) % 4; return ev; }
    const w = trickWinner(st, st.trick);
    st.tricks.push(w.team); ev.trick = w; ev.plays = st.trick; st.trick = []; st.turn = w.lead;
    const hw = handWinner(st.tricks);
    if (hw !== undefined) finish(m, st, hw, st.value);
    return ev;
  }

  // ---------- BOTS (só olham a própria mão, a mesa e o que já saiu — nunca as cartas escondidas) ----------
  // fácil: erra carta e aceita/corre no chute | médio: heurística | difícil: conta cartas e simula o resto da mão
  const norm = p => (p >= 10 ? 0.86 + (p - 10) * 0.045 : p * 0.085);
  function score(st, cards) {
    const n = cards.map(c => norm(power(st, c))).sort((x, y) => y - x);
    return (n[0] || 0) + 0.6 * (n[1] || 0) + 0.3 * (n[2] || 0);
  }
  function strength(st, seat) {
    const t = team(seat), won = st.tricks.filter(x => x === t).length, lost = st.tricks.filter(x => x === 1 - t).length;
    return score(st, st.hands[seat]) + 0.55 * won - 0.55 * lost + (st.tricks[0] === -1 ? 0.2 : 0);
  }
  const levelOf = (m, seat) => (m.levels && m.levels[seat]) || 'medio';

  function botAct(m, rnd = Math.random) {
    const st = m.hand, seat = actor(st), lv = levelOf(m, seat);
    if (lv === 'dificil') return hardAct(st, seat, rnd);
    const t = team(seat), easy = lv === 'facil';
    if (st.phase === 'eleven') { // vê a mão do parceiro também
      const both = score(st, [...st.hands[seat], ...st.hands[(seat + 2) % 4]].sort((x, y) => power(st, y) - power(st, x)).slice(0, 3));
      return { type: both > (easy ? 0.9 + rnd() * 0.8 : 1.25) ? 'go' : 'run' };
    }
    const s = strength(st, seat), lvl = LADDER.indexOf(st.pending ? st.pending.to : st.value);
    if (st.pending) {
      if (st.pending.to < 12 && s > (easy ? 1.9 : 1.55 + 0.12 * lvl)) return { type: 'raise' };
      if (easy ? s > 0.5 + rnd() * 0.9 : s > 0.8 + 0.1 * lvl || rnd() < 0.08) return { type: 'accept' };
      return { type: 'run' };
    }
    if (canRaise(st, t) && (easy ? s > 1.75 : s > 1.45 + 0.12 * lvl || rnd() < 0.05)) return { type: 'raise' };
    if (easy && rnd() < 0.4) return { type: 'play', i: Math.floor(rnd() * st.hands[seat].length) };
    return { type: 'play', i: pickCard(st, seat) };
  }

  function pickCard(st, seat) {
    const hand = st.hands[seat], P = c => power(st, c);
    const idx = hand.map((_, i) => i).sort((a, b) => P(hand[a]) - P(hand[b])); // do mais fraco ao mais forte
    const low = idx[0], high = idx[idx.length - 1];
    if (!st.trick.length) return st.tricks.length === 0 && hand.length === 3 ? idx[1] : high;
    const best = Math.max(...st.trick.map(p => P(p.card)));
    const tops = st.trick.filter(p => P(p.card) === best);
    const ours = tops.every(p => team(p.seat) === team(seat));
    if (ours && (st.trick.length === 3 || best >= 9)) return low;
    const beat = idx.find(i => P(hand[i]) > best);
    if (beat !== undefined) return beat;
    const tie = idx.find(i => P(hand[i]) === best);
    if (tie !== undefined && !ours && st.tricks.length === 0) return tie; // cangar a primeira
    return low;
  }

  // difícil: sorteia as cartas que ele NÃO vê entre as que ainda não saíram e joga o resto da mão várias vezes
  const key = c => c.r * 4 + c.s;
  function world(st, known, rnd) {
    const seen = new Set([st.vira, ...st.history, ...known.flatMap(k => st.hands[k])].map(key));
    const pool = [];
    for (let k = 0; k < 40; k++) if (!seen.has(k)) pool.push({ r: k >> 2, s: k & 3 });
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const hands = st.hands.map((h, k) => (known.includes(k) ? h.slice() : pool.splice(0, h.length)));
    return { ...st, hands, trick: st.trick.slice(), tricks: st.tricks.slice(), history: st.history.slice(), pending: null, noRaise: true, phase: 'play', result: null };
  }
  /** chance do time de `seat` levar a mão (empate total = meio) */
  function winProb(st, seat, n, rnd, first = -1, known = [seat]) {
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const w = world(st, known, rnd), m = { score: [0, 0], starter: 0, hand: w, winner: -1 };
      if (first >= 0) apply(m, { type: 'play', i: first });
      while (w.phase !== 'done') apply(m, { type: 'play', i: pickCard(w, w.turn) });
      sum += w.result.team === team(seat) ? 1 : w.result.team === 'none' ? 0.5 : 0;
    }
    return sum / n;
  }
  function hardAct(st, seat, rnd) {
    if (st.phase === 'eleven') return { type: winProb(st, seat, 60, rnd, -1, [seat, (seat + 2) % 4]) > 0.4 ? 'go' : 'run' };
    const p = winProb(st, seat, 50, rnd);
    if (st.pending) {
      const { to } = st.pending, cur = st.value;
      if (to < 12 && p > 0.74) return { type: 'raise' };
      return { type: p > (to - cur) / (2 * to) + 0.04 ? 'accept' : 'run' }; // aceitar vale mais que correr
    }
    if (canRaise(st, team(seat)) && (p > 0.7 || (p > 0.45 && rnd() < 0.06))) return { type: 'raise' };
    const hand = st.hands[seat];
    if (hand.length === 1) return { type: 'play', i: 0 };
    let best = 0, bestP = -1;
    hand.map((_, i) => i).sort((a, b) => power(st, hand[a]) - power(st, hand[b])).forEach(i => {
      const q = winProb(st, seat, 24, rnd, i);
      if (q > bestP + 0.02) { best = i; bestP = q; } // empate técnico: fica com a carta mais fraca
    });
    return { type: 'play', i: best };
  }

  const label = c => RANKS[c.r] + SUITS[c.s];
  return { RANKS, SUITS, LADDER, LEVELS, PAYOUT, payoutFor, record, team, newMatch, deal, actor, canRaise, apply, botAct, power, trickWinner, handWinner, label };
})();

if (typeof module !== 'undefined') {
  module.exports = TR;
  if (require.main === module) {
    const assert = require('assert');
    const { newMatch, deal, actor, apply, botAct, handWinner, trickWinner, PAYOUT } = TR;
    // vazas
    assert.strictEqual(handWinner([0, 0]), 0);
    assert.strictEqual(handWinner([0, 1]), undefined);
    assert.strictEqual(handWinner([-1, 1]), 1);
    assert.strictEqual(handWinner([1, -1]), 1);
    assert.strictEqual(handWinner([-1, -1]), undefined);
    assert.strictEqual(handWinner([0, 1, -1]), 0);
    assert.strictEqual(handWinner([0, 1, 1]), 1);
    assert.strictEqual(handWinner([-1, -1, -1]), 'none');
    // manilha: vira 7 → manilha Q; zap (Q♣) ganha de tudo; empate só entre times diferentes
    const st = { manilha: 4 };
    const c = (r, s) => ({ r, s });
    assert.deepStrictEqual(trickWinner(st, [{ seat: 0, card: c(9, 0) }, { seat: 1, card: c(4, 3) }, { seat: 2, card: c(8, 1) }, { seat: 3, card: c(4, 0) }]), { team: 1, lead: 1 });
    assert.strictEqual(trickWinner(st, [{ seat: 0, card: c(9, 0) }, { seat: 1, card: c(9, 1) }, { seat: 2, card: c(0, 1) }, { seat: 3, card: c(0, 0) }]).team, -1);
    assert.strictEqual(trickWinner(st, [{ seat: 0, card: c(9, 0) }, { seat: 1, card: c(0, 1) }, { seat: 2, card: c(9, 2) }, { seat: 3, card: c(0, 0) }]).team, 0);
    // truco → correr dá o valor de antes
    const m = newMatch(); m.starter = 0; deal(m);
    apply(m, { type: 'raise' }); assert.strictEqual(actor(m.hand), 1);
    apply(m, { type: 'run' }); assert.deepStrictEqual(m.score, [1, 0]);
    // truco → seis → aceita: mão vale 6
    deal(m); m.hand.turn = 1;
    apply(m, { type: 'raise' }); assert.strictEqual(actor(m.hand), 0);
    apply(m, { type: 'raise' }); apply(m, { type: 'accept' }); assert.strictEqual(m.hand.value, 6);
    // pagamento pelo histórico: sem histórico = mesa; ganhando tudo cai; perdendo tudo sobe; sempre dentro dos limites
    assert.strictEqual(TR.payoutFor('medio'), 1.9);
    let rec; for (let i = 0; i < 30; i++) rec = TR.record(rec, true);
    assert(TR.payoutFor('medio', rec) < 1.4 && TR.payoutFor('medio', rec) >= 1.1);
    rec = undefined; for (let i = 0; i < 30; i++) rec = TR.record(rec, false);
    assert(TR.payoutFor('medio', rec) > 2.5 && TR.payoutFor('medio', rec) <= 3);
    // partidas bot x bot: o "jogador" (assento 0) joga no nível `player`; Carlos médio; adversários no nível da mesa
    function sim(level, player, N) {
      let w0 = 0;
      for (let g = 0; g < N; g++) {
        const mm = newMatch(level); mm.levels[0] = player;
        while (mm.winner < 0) { deal(mm); while (mm.hand.phase !== 'done') apply(mm, botAct(mm)); }
        if (mm.winner === 0) w0++;
      }
      return w0 / N;
    }
    const pct = x => (x * 100).toFixed(1) + '%';
    if (process.argv[2] === 'calib') { // `node truco.js calib 4000` → sugere o PAYOUT de cada mesa
      const N = +(process.argv[3] || 4000);
      for (const lv of TR.LEVELS) {
        const p = sim(lv, 'medio', N), pay = Math.floor(0.96 / p * 100) / 100;
        const row = TR.LEVELS.map(pl => `${pl}: ${pct((pl === 'medio' ? p : sim(lv, pl, N / 2)) * pay)}`).join(' | ');
        console.log(`mesa ${lv}: médio ganha ${pct(p)} → PAYOUT ${pay} | RTP por jogador ${row}`);
      }
    } else { // sem `return` solto: no navegador isso é erro de sintaxe e derruba o script
      const N = +(process.argv[2] || 1500);
      for (const lv of TR.LEVELS) {
        const rtp = sim(lv, 'medio', N) * PAYOUT[lv];
        console.log(`mesa ${lv}: RTP do jogador típico ${pct(rtp)}`);
        assert(Math.abs(rtp - 0.96) < 3 * PAYOUT[lv] * Math.sqrt(0.25 / N), `RTP fora de ~96% na mesa ${lv}`); // 3 desvios
      }
    }
  }
}
