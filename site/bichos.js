// Motor do "Bichos da Sorte": 25 bichos, 5 prêmios (milhares 0000–9999) sorteados na hora.
// Rodar `node bichos.js` = auto-teste (regras + RTP de cada tipo de aposta).
const BX = (() => {
  // arte recortada do mockup; os 5 primeiros ainda não têm desenho e ficam com emoji
  const HAS_IMG = new Set(['cabra', 'carneiro', 'camelo', 'cobra', 'coelho', 'cavalo', 'elefante', 'galo', 'gato', 'jacare',
    'leao', 'macaco', 'porco', 'pavao', 'peru', 'touro', 'tigre', 'urso', 'veado', 'vaca']);
  const ANIMALS = [
    ['avestruz', 'Avestruz', '🦤'], ['aguia', 'Águia', '🦅'], ['burro', 'Burro', '🫏'], ['borboleta', 'Borboleta', '🦋'],
    ['cachorro', 'Cachorro', '🐕'], ['cabra', 'Cabra', '🐐'], ['carneiro', 'Carneiro', '🐏'], ['camelo', 'Camelo', '🐫'],
    ['cobra', 'Cobra', '🐍'], ['coelho', 'Coelho', '🐇'], ['cavalo', 'Cavalo', '🐎'], ['elefante', 'Elefante', '🐘'],
    ['galo', 'Galo', '🐓'], ['gato', 'Gato', '🐈'], ['jacare', 'Jacaré', '🐊'], ['leao', 'Leão', '🦁'],
    ['macaco', 'Macaco', '🐒'], ['porco', 'Porco', '🐖'], ['pavao', 'Pavão', '🦚'], ['peru', 'Peru', '🦃'],
    ['touro', 'Touro', '🐂'], ['tigre', 'Tigre', '🐅'], ['urso', 'Urso', '🐻'], ['veado', 'Veado', '🦌'], ['vaca', 'Vaca', '🐄'],
  ].map(([id, nome, emoji], i) => {
    const g = i + 1;
    const dezenas = [1, 2, 3, 4].map(k => String((4 * (g - 1) + k) % 100).padStart(2, '0')); // vaca: 97 98 99 00
    return { grupo: g, id, nome, emoji, img: HAS_IMG.has(id) ? `assets/bichos/${id}.webp` : null, dezenas };
  });

  // pagamentos calibrados pra ~96% de RTP em todas as apostas (o de rua devolve 40–72%)
  const BETS = {
    grupo:   { nome: 'Grupo',        desc: 'o bicho no 1º prêmio',     pick: 1, paga: 24 },
    grupo15: { nome: '1º ao 5º',     desc: 'o bicho em qualquer prêmio', pick: 1, paga: 5.2 },
    duque:   { nome: 'Duque',        desc: '2 bichos entre os 5',       pick: 2, paga: 34 },
    terno:   { nome: 'Terno',        desc: '3 bichos entre os 5',       pick: 3, paga: 280 },
    dezena:  { nome: 'Dezena',       desc: '2 últimos números do 1º',   digits: 2, paga: 96 },
    centena: { nome: 'Centena',      desc: '3 últimos números do 1º',   digits: 3, paga: 960, max: 2 },
    milhar:  { nome: 'Milhar',       desc: 'os 4 números do 1º',        digits: 4, paga: 9600, max: 1 },
  };
  const PRIZES = 5;

  // inteiro uniforme [0, n) via crypto, com rejeição para não ter viés
  function randInt(n) {
    const buf = new Uint32Array(1), lim = Math.floor(2 ** 32 / n) * n;
    do crypto.getRandomValues(buf); while (buf[0] >= lim);
    return buf[0] % n;
  }

  /** grupo (1–25) de uma milhar: pela dezena final, 00 = vaca (25) */
  const grupoDe = milhar => { const d = milhar % 100; return d === 0 ? 25 : Math.ceil(d / 4); };

  function draw() {
    return Array.from({ length: PRIZES }, () => {
      const milhar = randInt(10000);
      return { milhar: String(milhar).padStart(4, '0'), grupo: grupoDe(milhar) };
    });
  }

  /** erro de validação em texto, ou null se a aposta é válida */
  function validate(bet) {
    const t = BETS[bet.type];
    if (!t) return 'Tipo de aposta inválido';
    if (!(bet.amount > 0)) return 'Escolha o valor';
    if (t.max && bet.amount > t.max) return `${t.nome}: aposta máxima de ${t.max.toFixed(2)}`;
    if (t.pick) {
      const g = new Set(bet.animals ?? []);
      if (g.size !== t.pick || [...g].some(x => !(x >= 1 && x <= 25))) return `Escolha ${t.pick} bicho${t.pick > 1 ? 's diferentes' : ''}`;
    } else if (!new RegExp(`^\\d{${t.digits}}$`).test(bet.number ?? '')) return `Digite ${t.digits} números`;
    return null;
  }

  /** multiplicador ganho (0 = perdeu) */
  function settle(bet, prizes) {
    const t = BETS[bet.type], grupos = prizes.map(p => p.grupo), primeiro = prizes[0];
    const hit = {
      grupo: () => primeiro.grupo === bet.animals[0],
      grupo15: () => grupos.includes(bet.animals[0]),
      duque: () => bet.animals.every(a => grupos.includes(a)),
      terno: () => bet.animals.every(a => grupos.includes(a)),
      dezena: () => primeiro.milhar.endsWith(bet.number),
      centena: () => primeiro.milhar.endsWith(bet.number),
      milhar: () => primeiro.milhar === bet.number,
    }[bet.type]();
    return hit ? t.paga : 0;
  }

  const r2 = x => Math.round(x * 100) / 100;

  function play(bet) {
    const erro = validate(bet);
    if (erro) throw new Error(erro);
    const prizes = draw(), mult = settle(bet, prizes);
    return { prizes, mult, payout: r2(bet.amount * mult) };
  }

  return { ANIMALS, BETS, PRIZES, grupoDe, draw, validate, settle, play };
})();

if (typeof module !== 'undefined') {
  module.exports = BX;
  if (require.main === module) {
    const assert = require('assert');
    const { ANIMALS, BETS, grupoDe, validate, settle, play } = BX;
    const P = (...m) => m.map(x => ({ milhar: x, grupo: grupoDe(+x) }));

    // tabela: avestruz 01–04, vaca 97–00, gato 53–56
    assert.deepStrictEqual(ANIMALS[0].dezenas, ['01', '02', '03', '04']);
    assert.deepStrictEqual(ANIMALS[24].dezenas, ['97', '98', '99', '00']);
    assert.strictEqual(grupoDe(1200), 25); assert.strictEqual(grupoDe(4304), 1); assert.strictEqual(grupoDe(9955), 14);

    const prizes = P('4355', '0100', '7727', '1204', '3389'); // gato, vaca, carneiro, avestruz, urso
    assert.strictEqual(settle({ type: 'grupo', animals: [14] }, prizes), 24);
    assert.strictEqual(settle({ type: 'grupo', animals: [25] }, prizes), 0);      // vaca saiu no 2º, não na cabeça
    assert.strictEqual(settle({ type: 'grupo15', animals: [25] }, prizes), 5.2);
    assert.strictEqual(settle({ type: 'duque', animals: [14, 23] }, prizes), 34);
    assert.strictEqual(settle({ type: 'terno', animals: [14, 23, 2] }, prizes), 0);
    assert.strictEqual(settle({ type: 'dezena', number: '55' }, prizes), 96);
    assert.strictEqual(settle({ type: 'centena', number: '355' }, prizes), 960);
    assert.strictEqual(settle({ type: 'milhar', number: '4355' }, prizes), 9600);
    assert.strictEqual(settle({ type: 'milhar', number: '0100' }, prizes), 0);    // milhar só vale no 1º

    assert.strictEqual(validate({ type: 'milhar', number: '1234', amount: 5 }), 'Milhar: aposta máxima de 1.00');
    assert.strictEqual(validate({ type: 'duque', animals: [3, 3], amount: 1 }), 'Escolha 2 bichos diferentes');
    assert.strictEqual(validate({ type: 'dezena', number: '7', amount: 1 }), 'Digite 2 números');
    assert.strictEqual(validate({ type: 'grupo', animals: [7], amount: 1 }), null);

    // RTP de cada aposta por simulação
    const N = +(process.argv[2] || 400000);
    const rnd = n => Math.floor(Math.random() * n);
    for (const [type, t] of Object.entries(BETS)) {
      let paid = 0;
      for (let i = 0; i < N; i++) {
        const animals = [], number = String(rnd(10 ** (t.digits ?? 1))).padStart(t.digits ?? 1, '0');
        while (t.pick && animals.length < t.pick) { const a = rnd(25) + 1; if (!animals.includes(a)) animals.push(a); }
        paid += play({ type, animals, number, amount: 1 }).payout;
      }
      const rtp = paid / N;
      console.log(`${t.nome.padEnd(9)} paga ${String(t.paga).padStart(5)}x  RTP ${(rtp * 100).toFixed(1)}%`);
      // milhar/centena/terno ganham raramente: a simulação oscila mais, então a faixa é mais larga
      const tol = t.paga >= 280 ? 0.2 : 0.03;
      assert(Math.abs(rtp - 0.96) < tol, `${type}: RTP ${rtp} fora da faixa`);
    }
  }
}
