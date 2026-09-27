// Motor do "Sinuca Aposta" (bola 8, você x bot). Física 2D numa mesa plana 500x1000
// (y=0 é o fundo da mesa, onde fica o triângulo); a tela projeta em perspectiva.
// Grupos fixos como na arte: jogador 0 = lisas (1-7), jogador 1 = listradas (9-15).
// Vitória paga PAYOUT x aposta: contra o bot do mesmo nível (~50%) o retorno médio é ~96%.
// Rodar `node sinuca.js` = auto-teste (física + regras + RTP bot x bot).
const SN = (() => {
  // RTP do painel admin: api/rtp.js define window.RTP_JOGOS antes deste arquivo; rtp-live.js chama setRtp se mudar com o jogo aberto.
  const FABRICA = 0.96, W = 500, L = 1000, R = 19;
  let RTP, PAYOUT;
  function setRtp(r) {
    RTP = r;
    PAYOUT = Math.round(1.92 * r / FABRICA * 100) / 100;
  }
  setRtp(globalThis.RTP_JOGOS?.sinuca ?? FABRICA);
  const FRICTION = 230, DRAG = .45, STOP = 5, BALL_E = .95, RAIL_E = .75, MAXV = 3400, DT = 1 / 600;
  const HEAD = { x: W / 2, y: 800 }, FOOT = { x: W / 2, y: 250 };
  // x,y centro; m = boca (sem tabela dentro); c = raio de captura
  const POCKETS = [[0, 0, 58, 31], [W, 0, 58, 31], [0, L / 2, 42, 27], [W, L / 2, 42, 27], [0, L, 58, 31], [W, L, 58, 31]]
    .map(([x, y, m, c]) => ({ x, y, m, c }));
  const BOT_SKILL = 0.022; // desvio-padrão da mira do bot (rad). Maior = bot pior = RTP maior pro humano.

  const rand = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] / 2 ** 32; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const inGroup = (p, n) => (p === 0 ? n >= 1 && n <= 7 : n >= 9 && n <= 15);

  function rack() {
    // 8 no centro da 3ª fileira; cantos de trás: uma lisa e uma listrada
    const solids = shuffle([1, 2, 3, 4, 5, 6, 7]), stripes = shuffle([9, 10, 11, 12, 13, 14, 15]);
    const corners = rand() < .5 ? [solids.pop(), stripes.pop()] : [stripes.pop(), solids.pop()];
    const rest = shuffle([...solids, ...stripes]); // ápice sorteado: sem vantagem fixa pras lisas
    const balls = [{ n: 0, x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, in: false }];
    for (let i = 0; i < 5; i++) for (let j = 0; j <= i; j++) {
      const n = i === 2 && j === 1 ? 8 : i === 4 && j === 0 ? corners[0] : i === 4 && j === 4 ? corners[1] : rest.pop();
      balls.push({ n, x: FOOT.x + (j - i / 2) * (2 * R + .2), y: FOOT.y - i * (2 * R + .2) * 0.866, vx: 0, vy: 0, in: false });
    }
    return balls.sort((a, b) => a.n - b.n);
  }

  function newGame(breaker = rand() < .5 ? 0 : 1) {
    return { balls: rack(), turn: breaker, shots: 0, winner: -1, ev: null };
  }

  const cleared = (s, p) => s.balls.every(b => !inGroup(p, b.n) || b.in);
  const moving = s => s.balls.some(b => !b.in && (b.vx || b.vy));

  function shoot(s, angle, power) {
    const c = s.balls[0], v = Math.max(.05, Math.min(1, power)) * MAXV;
    c.vx = Math.cos(angle) * v; c.vy = Math.sin(angle) * v;
    s.ev = { first: null, potted: [], pockets: [], hits: [], rails: [], break: s.shots === 0, clearedBefore: cleared(s, s.turn) };
    s.shots++;
  }

  /** avança `sec` segundos de física; devolve true se ainda tem bola andando */
  function advance(s, sec) {
    const n = Math.max(1, Math.round(sec / DT));
    for (let i = 0; i < n; i++) { stepOnce(s); if (!moving(s)) return false; }
    return true;
  }

  function stepOnce(s) {
    const B = s.balls, ev = s.ev;
    for (const b of B) {
      if (b.in || (!b.vx && !b.vy)) continue;
      const v = Math.hypot(b.vx, b.vy), nv = v - (FRICTION + DRAG * v) * DT;
      if (nv < STOP) { b.vx = b.vy = 0; continue; }
      b.vx *= nv / v; b.vy *= nv / v; b.x += b.vx * DT; b.y += b.vy * DT;
    }
    for (let i = 0; i < B.length; i++) {
      const a = B[i]; if (a.in) continue;
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j]; if (b.in || (!a.vx && !a.vy && !b.vx && !b.vy)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          const imp = rel * (1 + BALL_E) / 2;
          a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
          if (ev) {
            if (ev.first === null && (a.n === 0 || b.n === 0)) ev.first = a.n === 0 ? b.n : a.n;
            ev.hits.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: rel });
          }
        }
        const o = (2 * R - d) / 2; a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
      }
    }
    for (const b of B) {
      if (b.in) continue;
      let mouth = false;
      for (let k = 0; k < POCKETS.length; k++) {
        const p = POCKETS[k], d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < p.c || (d < p.m && (b.x < -R || b.x > W + R || b.y < -R || b.y > L + R))) { pot(s, b, k); break; }
        if (d < p.m) mouth = true;
      }
      if (b.in || mouth) continue;
      let hit = 0;
      if (b.x < R) { b.x = R; b.vx = -b.vx * RAIL_E; hit = Math.abs(b.vx); }
      if (b.x > W - R) { b.x = W - R; b.vx = -b.vx * RAIL_E; hit = Math.abs(b.vx); }
      if (b.y < R) { b.y = R; b.vy = -b.vy * RAIL_E; hit = Math.abs(b.vy); }
      if (b.y > L - R) { b.y = L - R; b.vy = -b.vy * RAIL_E; hit = Math.abs(b.vy); }
      if (hit && ev) ev.rails.push({ x: b.x, y: b.y, v: hit });
    }
  }

  function pot(s, b, k) {
    b.in = true; b.vx = b.vy = 0;
    if (s.ev) { s.ev.potted.push(b.n); s.ev.pockets.push({ n: b.n, k, x: b.x, y: b.y }); }
  }

  const free = (s, p) => s.balls.every(b => b.in || b.n === 0 || Math.hypot(b.x - p.x, b.y - p.y) > 2 * R + 1);
  function spot(s, b, at) {
    const p = { ...at };
    while (!free(s, p)) p.y += 2 * R + 1; // ponytail: desce na linha até achar vaga; mesa nunca enche a ponto de sair
    b.x = p.x; b.y = p.y; b.in = false; b.vx = b.vy = 0;
  }

  /** aplica as regras depois que as bolas pararam */
  function resolve(s) {
    const e = s.ev, me = s.turn, op = 1 - me;
    const scratch = e.potted.includes(0), eight = e.potted.includes(8);
    const legalFirst = e.first !== null && (e.break || (e.clearedBefore ? e.first === 8 : inGroup(me, e.first)));
    const foul = scratch || !legalFirst;
    const out = { foul, scratch, first: e.first, potted: e.potted.filter(n => n), keep: false, reason: '' };
    if (eight) {
      if (e.break) { spot(s, s.balls[8], FOOT); out.reason = 'A 8 caiu na saída e voltou pra mesa'; }
      else {
        s.winner = e.clearedBefore && !foul ? me : op;
        out.reason = s.winner === me ? 'Matou a 8!' : e.clearedBefore ? 'Falta na bola 8' : 'Bola 8 antes da hora';
        return out;
      }
    }
    if (scratch) spot(s, s.balls[0], HEAD);
    out.keep = !foul && e.potted.some(n => inGroup(me, n));
    if (!out.keep) s.turn = op;
    out.reason ||= scratch ? 'Branca na caçapa!' : e.first === null ? 'Não acertou nenhuma bola' : !legalFirst ? 'Tocou primeiro na bola errada' : '';
    return out;
  }

  // ---------- BOT ----------
  function segDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
    return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t);
  }
  const clear = (s, a, b, skip) => s.balls.every(o => o.in || skip.includes(o.n) || segDist(o, a, b) > 2 * R);
  const targets = (s, p) => (cleared(s, p) ? [8] : s.balls.filter(b => !b.in && inGroup(p, b.n)).map(b => b.n));

  /** melhor tacada: bola do grupo + caçapa com caminho livre e menor corte */
  function plan(s, p = s.turn) {
    const c = s.balls[0]; let best = null;
    for (const n of targets(s, p)) {
      const t = s.balls[n];
      for (const pk of POCKETS) {
        const tp = { x: pk.x - t.x, y: pk.y - t.y }, dl = Math.hypot(tp.x, tp.y), d = { x: tp.x / dl, y: tp.y / dl };
        if (pk.m < 40 && Math.abs(d.x) < .45) continue; // caçapa do meio não aceita ângulo fechado
        const g = { x: t.x - d.x * 2 * R, y: t.y - d.y * 2 * R }, v = { x: g.x - c.x, y: g.y - c.y }, vl = Math.hypot(v.x, v.y);
        const cut = (v.x * d.x + v.y * d.y) / vl;
        if (cut < .3 || !clear(s, c, g, [0, n]) || !clear(s, t, pk, [0, n])) continue;
        const score = cut * cut / (1 + (vl + dl) / 700);
        if (!best || score > best.score) best = { n, pocket: pk, ghost: g, angle: Math.atan2(v.y, v.x), power: Math.min(.95, (.22 + (vl + dl / cut) / 2600) * 2400 / MAXV), score };
      }
    }
    return best;
  }

  function botShot(s, skill = BOT_SKILL) {
    const c = s.balls[0];
    if (s.shots === 0) return { angle: Math.atan2(FOOT.y - c.y, FOOT.x - c.x) + gauss() * .01, power: .95 + rand() * .05 };
    let p = plan(s);
    if (!p) { // sem tacada limpa: bate cheio na bola do grupo mais próxima
      const t = targets(s, s.turn).map(n => s.balls[n]).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      p = { angle: Math.atan2(t.y - c.y, t.x - c.x), power: .45 };
    }
    return { angle: p.angle + gauss() * skill, power: p.power, target: p.n, pocket: p.pocket };
  }

  return { get RTP() { return RTP; }, get PAYOUT() { return PAYOUT; }, FABRICA, setRtp, W, L, R, POCKETS, BOT_SKILL, inGroup, newGame, shoot, advance, resolve, plan, botShot, cleared, moving };
})();

if (typeof module !== 'undefined') {
  module.exports = SN;
  if (require.main === module) {
    const assert = require('assert');
    const { newGame, shoot, advance, resolve, botShot, R } = SN;
    // colisão frontal: a branca para e a bola alvo sai com a velocidade dela
    const g = newGame(0); g.balls.forEach(b => { if (b.n > 1) b.in = true; });
    Object.assign(g.balls[0], { x: 250, y: 600 }); Object.assign(g.balls[1], { x: 250, y: 400 });
    g.shots = 1; shoot(g, -Math.PI / 2, .21); advance(g, 60);
    assert.strictEqual(g.ev.first, 1);
    assert(g.balls[0].y > 400 + 2 * R - 1 && g.balls[0].y < 440, 'branca deveria parar perto do contato');
    assert(g.balls[1].y < 200 || g.balls[1].in, 'bola 1 deveria seguir em frente');
    // bola mirada direto na caçapa cai; regras: acerta a própria e continua jogando
    const h = newGame(0); h.balls.forEach(b => { if (b.n > 2) b.in = true; });
    Object.assign(h.balls[0], { x: 100, y: 100 }); Object.assign(h.balls[1], { x: 60, y: 60 }); Object.assign(h.balls[2], { x: 400, y: 800 });
    h.shots = 1; shoot(h, Math.atan2(-1, -1), .5); advance(h, 60);
    const r = resolve(h);
    assert(h.balls[1].in && !r.foul && r.keep && h.turn === 0, 'deveria encaçapar a 1 e continuar');
    // 8 antes da hora = derrota
    const k = newGame(0); k.balls.forEach(b => { if (b.n && b.n !== 8) b.in = b.n > 7; });
    Object.assign(k.balls[0], { x: 100, y: 100 }); Object.assign(k.balls[8], { x: 60, y: 60 });
    k.shots = 1; shoot(k, Math.atan2(-1, -1), .5); advance(k, 60); resolve(k);
    assert.strictEqual(k.winner, 1);

    // bot x bot, mesmo nível: jogador 0 deve ganhar ~50% → RTP ~ 50% * PAYOUT
    const N = +(process.argv[2] || 400); let w0 = 0, shots = 0, draws = 0;
    for (let i = 0; i < N; i++) {
      const s = newGame(i % 2);
      while (s.winner < 0 && s.shots < 250) { const b = botShot(s); shoot(s, b.angle, b.power); advance(s, 120); resolve(s); }
      if (s.winner < 0) { draws++; continue; }
      if (s.winner === 0) w0++; shots += s.shots;
    }
    const played = N - draws, rtp = w0 / played * SN.PAYOUT;
    console.log(`jogador 0 ganha ${(w0 / played * 100).toFixed(1)}% | RTP ${(rtp * 100).toFixed(2)}% | ${(shots / played).toFixed(1)} tacadas por partida | ${draws} partidas travadas`);
    assert(Math.abs(rtp - 0.96) < 0.1, 'RTP fora de ~96%');
  }
}
