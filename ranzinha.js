// Ranzinha espiando: de vez em quando sai da borda da tela e fica olhando. Chegou perto (mouse) ou tocou, ela
// leva um susto e foge. Só enfeite: não mexe em nada do site. Arte: tools/ranzinha_assets.py → assets/ranzinha/peek.webp
(() => {
  const N = 7, W = 229, H = 236;       // quadros da tira: 0–3 saindo, 3–5 olhando, 6 susto
  const PERTO = 150;                   // px do mouse até ela pra fugir
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let el = null, fugindo = false;

  const ocupado = () => document.hidden || document.querySelector('.modal-overlay.show, .game-overlay.show');
  const quadro = i => (el.style.backgroundPositionX = (i / (N - 1)) * 100 + '%');

  let ac;
  function som(f0, f1, d, vol = .06) { // guinchinho sintetizado
    try {
      ac ||= new AudioContext();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
    } catch {}
  }

  async function espiar() {
    if (el || ocupado()) return;
    const lado = Math.random() < .5 ? 'left' : 'right', h = Math.round(Math.min(150, Math.max(100, innerHeight * .16)));
    el = document.createElement('div');
    el.className = 'ranzinha ' + lado;
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, { top: rnd(22, 70) + 'vh', height: h + 'px', width: Math.round(h * W / H) + 'px' });
    document.body.append(el);
    const eu = el;
    // sai de trás da borda, quadro a quadro
    for (let i = 0; i <= 3; i++) { if (el !== eu || fugindo) return; quadro(i); await sleep(i ? 170 : 400); }
    // fica olhando: pisca, mostra a língua, balança
    const fim = performance.now() + rnd(5000, 8000);
    while (el === eu && !fugindo && performance.now() < fim) {
      quadro([3, 4, 5, 4][Math.random() * 4 | 0]);
      await sleep(rnd(450, 1100));
    }
    if (el !== eu || fugindo) return;
    // cansou: volta pra trás da borda devagar
    for (let i = 3; i >= 0; i--) { quadro(i); await sleep(150); }
    eu.remove(); if (el === eu) el = null;
  }

  async function fugir() {
    if (!el || fugindo) return;
    fugindo = true;
    const eu = el;
    quadro(6); som(900, 1800, .12); eu.classList.add('susto');
    const r = eu.getBoundingClientRect(), dir = eu.classList.contains('left') ? 1 : -1;
    for (let k = 0; k < 5; k++) { // gotinhas de suor
      const g = document.createElement('i'); g.className = 'ranzinha-gota';
      Object.assign(g.style, { left: r.left + r.width * (dir > 0 ? .7 : .3) + 'px', top: r.top + r.height * .25 + 'px' });
      document.body.append(g);
      g.animate([{ transform: 'translate(0,0) scale(.5)', opacity: 1 }, { transform: `translate(${dir * rnd(20, 70)}px,${rnd(-60, -10)}px) scale(1)`, opacity: 1, offset: .5 },
        { transform: `translate(${dir * rnd(40, 90)}px,${rnd(20, 60)}px) scale(.7)`, opacity: 0 }], { duration: 650, easing: 'ease-out' }).onfinish = () => g.remove();
    }
    await sleep(220);
    som(1400, 500, .18);
    await eu.animate([{ transform: eu.classList.contains('right') ? 'scaleX(-1)' : 'none' },
      { transform: (eu.classList.contains('right') ? 'scaleX(-1) ' : '') + 'translateX(-110%)' }], { duration: 230, easing: 'ease-in', fill: 'forwards' }).finished;
    eu.remove(); el = null; fugindo = false;
    if (Math.random() < .35) setTimeout(espiar, rnd(1800, 3500)); // às vezes volta pra provocar, em outro lugar
  }

  // mouse chegando perto (computador) ou dedo tocando (celular)
  addEventListener('pointermove', e => {
    if (!el || fugindo || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < PERTO) fugir();
  }, { passive: true });
  addEventListener('pointerdown', e => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (e.clientX > r.left - 40 && e.clientX < r.right + 40 && e.clientY > r.top - 40 && e.clientY < r.bottom + 40) { e.preventDefault(); fugir(); }
  });
  // some se abrir jogo ou modal
  setInterval(() => { if (el && !fugindo && ocupado()) { el.remove(); el = null; } }, 500);

  (function agenda() { setTimeout(() => { espiar(); agenda(); }, rnd(15000, 35000)); })();
  setTimeout(espiar, 6000); // primeira espiada logo no começo
  window.Ranzinha = { espiar, fugir };
})();
