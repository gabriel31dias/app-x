/* ==========================================================================
   ORAMA GAMES - APP ENGINE & INTERACTIVE LOGIC
   ========================================================================== */

// --- Global State ---
const State = {
  balance: 50.00,
  userLevel: 5,
  userXp: 3850,
  userXpMax: 5000,
  username: "Usuário123",
  soundEnabled: true,
  musicEnabled: true,
  activeCategory: "Todos",
  activeTab: "inicio",
  favorites: JSON.parse(localStorage.getItem("orama_favs") || "[]"),
  depositHistory: [
    { date: "Hoje, 21:14", amount: 10.00, status: "Aprovado", method: "PIX" },
    { date: "Ontem, 18:30", amount: 20.00, status: "Aprovado", method: "PIX" },
  ],
  notifications: [
    { id: 1, title: "🎁 Bônus Diário Disponível!", desc: "Resgate agora seus R$ 5,00 grátis.", unread: true, time: "Há 10 min" },
    { id: 2, title: "🔥 Capivara da Sorte!", desc: "Você ganhou 10 rodadas bônus hoje.", unread: true, time: "Há 1 hora" },
    { id: 3, title: "🏆 Você subiu para o Nível 5!", desc: "Seu cashback agora é de 5%.", unread: false, time: "Ontem" }
  ]
};

// mesmo endereço do site (serve.mjs repassa /api pra API), então funciona no celular e no ngrok
const defaultApiBaseUrl = location.protocol === "file:" || ["localhost", "127.0.0.1", ""].includes(location.hostname)
  ? "http://localhost:3100"
  : `${location.origin}/api`;
const API_BASE_URL = (localStorage.getItem("orama_api_base") || defaultApiBaseUrl).replace(/\/+$/, "");
const PIX_SUCCESS_STATUSES = new Set(["paid", "pago", "approved", "completed", "concluido", "concluida"]);
const PIX_FAILURE_STATUSES = new Set(["failed", "canceled", "cancelled", "cancelado", "refunded", "expired", "expirado"]);

window.State = State; // o jogo (iframe) lê e grava o saldo por aqui

// --- Web Audio Sound Synthesizer ---
class SoundController {
  constructor() {
    this.ctx = null;
  }
  
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playClick() {
    if (!State.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playCoin() {
    if (!State.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [987.77, 1318.51].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.25, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.2);
    });
  }

  playWin() {
    if (!State.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const now = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.3, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.09 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.3);
    });
  }

  playReelSpin() {
    if (!State.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }
}

const Sounds = new SoundController();

// --- Música de fundo: loop tropical sintetizado (baixo 3-3-2, marimba, chocalho) ---
State.musicEnabled = localStorage.getItem("orama_music") !== "off";
const Music = {
  BPM: 112,
  // acordes C - G - Am - F: [baixo, notas do arpejo] em MIDI
  CHORDS: [[48, [60, 64, 67]], [43, [59, 62, 67]], [45, [60, 64, 69]], [41, [60, 65, 69]]],
  playing: false, timer: null, step: 0, next: 0, out: null, noiseBuf: null,

  start() {
    if (this.playing || !State.musicEnabled) return;
    Sounds.init();
    const ctx = Sounds.ctx;
    if (!ctx) return;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 1.5); // entra suave
    this.out.connect(ctx.destination);
    this.playing = true; this.step = 0; this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  },

  stop() {
    if (!this.playing) return;
    const ctx = Sounds.ctx, out = this.out;
    clearInterval(this.timer);
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => out.disconnect(), 800);
    this.playing = false;
  },

  toggle() {
    State.musicEnabled = !State.musicEnabled;
    localStorage.setItem("orama_music", State.musicEnabled ? "on" : "off");
    State.musicEnabled ? this.start() : this.stop();
    this.updateBtn();
  },

  updateBtn() {
    const b = document.getElementById("btn-music");
    if (!b) return;
    b.textContent = State.musicEnabled ? "🎵" : "🔇";
    b.classList.toggle("off", !State.musicEnabled);
  },

  // agenda as notas um pouco à frente do relógio do áudio, pra não engasgar
  schedule() {
    const ctx = Sounds.ctx, sixteenth = 60 / this.BPM / 4;
    while (this.next < ctx.currentTime + 0.12) {
      this.tick(this.step, this.next, sixteenth);
      this.next += sixteenth;
      this.step = (this.step + 1) % 64; // 4 compassos
    }
  },

  tick(s, t, d) {
    const [root, chord] = this.CHORDS[s >> 4], i = s % 16;
    if ([0, 3, 6, 8, 11, 14].includes(i)) this.note(root, t, d * 2.5, "triangle", 0.9);
    if (i % 2 === 0) this.note(chord[(i / 2) % 3] + (i >= 8 ? 12 : 0), t, d * 1.6, "sine", 0.45);
    if (i % 4 === 2) this.shaker(t);
    if (i % 8 === 0) this.kick(t);
  },

  note(midi, t, len, type, vol) {
    const ctx = Sounds.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    osc.connect(g); g.connect(this.out);
    osc.start(t); osc.stop(t + len);
  },

  shaker(t) {
    const ctx = Sounds.ctx;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let k = 0; k < data.length; k++) data[k] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf;
    hp.type = "highpass"; hp.frequency.value = 7000;
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(hp); hp.connect(g); g.connect(this.out);
    src.start(t); src.stop(t + 0.1);
  },

  kick(t) {
    const ctx = Sounds.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g); g.connect(this.out);
    osc.start(t); osc.stop(t + 0.15);
  }
};

// navegador só libera áudio depois de um toque/clique
document.addEventListener("pointerdown", () => Music.start(), { once: true });
document.addEventListener("keydown", () => Music.start(), { once: true });
// pausa quando o site sai da tela (troca de aba, celular bloqueado)
document.addEventListener("visibilitychange", () => {
  if (!Sounds.ctx) return;
  document.hidden ? Sounds.ctx.suspend() : Sounds.ctx.resume();
});
document.addEventListener("DOMContentLoaded", () => Music.updateBtn());

// --- Formatting Helpers ---
function formatCurrency(val) {
  return "R$ " + val.toFixed(2).replace(".", ",");
}

// saldo salvo por conta (neste aparelho); conta nova começa com o saldo inicial.
// ponytail: trocar o número da chave ("saldo6") zera todo mundo pra START_BALANCE uma vez
const START_BALANCE = 50; // contas que já existiam, sem saldo salvo
const NEW_ACCOUNT_BALANCE = 10; // saldo de quem se cadastra
const balanceKey = () => (Auth.current ? `orama_saldo6_${Auth.current.email}` : null);
function loadBalance() {
  const k = balanceKey(), v = k ? parseFloat(localStorage.getItem(k)) : NaN;
  State.balance = Number.isFinite(v) ? v : START_BALANCE;
}
function saveBalance() {
  const k = balanceKey();
  if (!k) return;
  localStorage.setItem(k, String(Math.round(State.balance * 100) / 100));
  informarSaldo();
}
// manda o saldo pro painel admin (tela Jogadores). Um envio a cada 1,5 s no máximo: giro rápido não vira enxurrada.
// ponytail: é o saldo que este aparelho diz ter; quando a carteira for pro servidor isso some
let saldoTimer = null;
function informarSaldo() {
  const u = Auth.current, saldo = Math.round(State.balance * 100) / 100; // lido agora: no logout a sessão some antes do envio
  if (!u) return;
  clearTimeout(saldoTimer);
  saldoTimer = setTimeout(() => {
    apiFetch("/saldos", { method: "POST", body: JSON.stringify({ email: u.email, nome: u.nome, saldo }) }).catch(() => {});
  }, 1500);
}

function updateBalanceUI(animate = true) {
  saveBalance(); // toda mudança de saldo (site e jogos) passa por aqui
  const el = document.getElementById("user-balance");
  if (el) {
    el.textContent = formatCurrency(State.balance);
    if (animate) {
      el.classList.add("pulse");
      setTimeout(() => el.classList.remove("pulse"), 400);
    }
  }
  const balInModals = document.querySelectorAll(".sync-balance");
  balInModals.forEach(b => {
    b.textContent = formatCurrency(State.balance);
  });
}

function showToast(msg, icon = "✅") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// --- Modals Management ---
function openModal(id) {
  if (!Auth.current && Auth.GATED.includes(id)) id = "modal-login";
  Sounds.playClick();
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
  }
  if (id === "modal-withdraw") Saques.abrir();
  if (id === "modal-profile" || id === "modal-notifications") Bonus.atualizar();
}

function closeModal(id) {
  Sounds.playClick();
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("show");
    if (!document.querySelector(".modal-overlay.show")) {
      document.body.style.overflow = "";
    }
  }
}

// --- Category Filtering ---
const GAME_DATA = [
  { id: 'capivara', title: 'Capivara da Sorte', cat: 'Slots', img: 'assets/card_grid_capivara.png', featured: true, featImg: 'assets/card_feat_capivara.png', rtp: '97.2%' },
  { id: 'fortuna_tigre', title: 'Fortuna Tigre', cat: 'Slots', img: 'assets/card_fortuna_tigre.png', featured: true, featImg: 'assets/card_feat_tigre.png', rtp: '96.8%' },
  { id: 'dragao_dourado', title: 'Dragão Dourado', cat: 'Slots', img: 'assets/card_grid_dragao.png', featured: true, featImg: 'assets/card_feat_dragao.png', rtp: '96.9%' },
  { id: 'tigre_sortudo', title: 'Tigre Sortudo', cat: 'Slots', img: 'assets/card_grid_tigre_sortudo.png', rtp: '96.5%' },
  { id: 'coelho_sorte', title: 'Coelho da Sorte', cat: 'Slots', img: 'assets/card_grid_coelho.png', rtp: '96.7%' },
  { id: 'mines', title: 'Mines', cat: 'Outros', img: 'assets/card_grid_mines.png', isMines: true, rtp: '98.0%' },
  { id: 'aviator', title: 'Aviator', cat: 'Crash', img: 'assets/card_grid_aviator.png', isAviator: true, rtp: '97.0%' },
  { id: 'roleta', title: 'Roleta', cat: 'Cassino', img: 'assets/card_grid_roleta.png', isRoulette: true, rtp: '97.3%' },
  { id: 'sweet_bonanza', title: 'Sweet Bonanza', cat: 'Slots', img: 'assets/card_grid_sweet_bonanza.png', rtp: '96.4%' }
];

function filterGames(category) {
  State.activeCategory = category;
  Sounds.playClick();

  // Update category cards active state
  document.querySelectorAll(".cat-card").forEach(c => {
    c.classList.toggle("active", c.dataset.cat === category);
  });

  // Update chips active state
  document.querySelectorAll(".chip").forEach(c => {
    c.classList.toggle("active", c.dataset.cat === category);
  });

  // Filter grid items
  const grid = document.getElementById("all-games-grid");
  if (!grid) return;

  const cards = grid.querySelectorAll(".game-card");
  cards.forEach(card => {
    const cardCat = card.dataset.cat;
    if (category === "Todos" || cardCat === category || (category === "Roleta" && cardCat === "Cassino")) {
      card.style.display = "flex";
    } else {
      card.style.display = "none";
    }
  });
}

// --- Toggle Favorites ---
function toggleFav(e, gameId) {
  e.stopPropagation();
  Sounds.playClick();
  const btn = e.currentTarget;
  const idx = State.favorites.indexOf(gameId);
  if (idx > -1) {
    State.favorites.splice(idx, 1);
    btn.classList.remove("active");
    showToast("Removido dos favoritos", "⭐");
  } else {
    State.favorites.push(gameId);
    btn.classList.add("active");
    showToast("Adicionado aos favoritos!", "⭐");
  }
  localStorage.setItem("orama_favs", JSON.stringify(State.favorites));
}

// --- Launch Game Router ---
function launchGame(gameId) {
  if (!Auth.current) return Auth.show("login");
  Sounds.playClick();
  if (gameId === 'capivara') {
    openGame('capivara.html?v=4');
  } else if (gameId === 'gatinho') {
    openGame('gatinho.html?v=10');
  } else if (gameId === 'galinha') {
    openGame('crash.html?v=4');
  } else if (gameId === 'papagaio') {
    openGame('papagaio.html?v=5');
  } else if (gameId === 'raspa') {
    openGame('raspa.html?v=4');
  } else if (gameId === 'macaco') {
    openGame('macaco.html?v=12');
  } else if (gameId === 'truco') {
    openGame('truco.html?v=4');
  } else if (gameId === 'sinuca') {
    openGame('sinuca.html?v=4');
  } else if (gameId === 'sapo') {
    openGame('sapo.html?v=1');
  } else if (gameId === 'perereca') {
    openGame('perereca.html?v=9');
  } else if (gameId === 'velha') {
    openGame('velha.html?v=5');
  } else if (gameId === 'bichos') {
    openGame('bichos.html?v=8');
  } else if (gameId === 'mines') {
    openModal('modal-game-mines');
    initMinesGame();
  } else if (gameId === 'aviator') {
    openModal('modal-game-aviator');
    initAviatorGame();
  } else if (gameId === 'roleta') {
    openModal('modal-game-roleta');
    initRouletteGame();
  } else {
    // Generic high quality slot simulator for Tigre, Dragão, Coelho, Sweet Bonanza
    openGenericSlot(gameId);
  }
}

// ==========================================================================
// CAPIVARA DA SORTE FULL PLAYABLE ENGINE
// ==========================================================================
const SYMBOLS = [
  { id: 'capivara', w: 4, pay: 250, svg: `<svg viewBox="0 0 100 100"><circle cx="50" cy="52" r="44" fill="url(#gFur)"/><circle cx="34" cy="48" r="4" fill="#1b0e06"/><circle cx="66" cy="48" r="4" fill="#1b0e06"/><ellipse cx="50" cy="62" rx="14" ry="9" fill="#2b1408"/><circle cx="50" cy="18" r="12" fill="url(#gOrange)"/><path d="M50 18 Q58 10 60 4" stroke="#43a047" stroke-width="4" fill="none"/></svg>` },
  { id: 'tucano', w: 2, pay: 100, svg: `<svg viewBox="0 0 100 100"><ellipse cx="44" cy="54" rx="34" ry="38" fill="#111"/><ellipse cx="56" cy="44" rx="18" ry="24" fill="#fff"/><circle cx="54" cy="42" r="5" fill="#0d3a8c"/><path d="M58 32 Q95 38 88 66 Q66 66 54 54 Z" fill="url(#gBeak)"/></svg>` },
  { id: 'flor', w: 3, pay: 25, svg: `<svg viewBox="0 0 100 100"><g fill="url(#gPink)"><circle cx="50" cy="24" r="16"/><circle cx="76" cy="42" r="16"/><circle cx="66" cy="72" r="16"/><circle cx="34" cy="72" r="16"/><circle cx="24" cy="42" r="16"/></g><circle cx="50" cy="50" r="14" fill="url(#gGold)"/></svg>` },
  { id: 'cogumelo', w: 4, pay: 10, svg: `<svg viewBox="0 0 100 100"><path d="M40 50 Q40 85 50 85 Q60 85 60 50 Z" fill="#eee"/><path d="M12 55 Q50 8 88 55 Q50 58 12 55 Z" fill="url(#gRed)"/><circle cx="34" cy="38" r="5" fill="#fff"/><circle cx="62" cy="34" r="6" fill="#fff"/><circle cx="48" cy="48" r="4" fill="#fff"/></svg>` },
  { id: 'borboleta', w: 6, pay: 8, svg: `<svg viewBox="0 0 100 100"><path d="M50 48 Q20 18 16 38 Q12 58 50 56 Z" fill="url(#gBlue)"/><path d="M50 48 Q80 18 84 38 Q88 58 50 56 Z" fill="url(#gBlue)"/><ellipse cx="50" cy="50" rx="4" ry="22" fill="#111"/></svg>` },
  { id: 'laranja', w: 12, pay: 5, svg: `<svg viewBox="0 0 100 100"><circle cx="50" cy="54" r="38" fill="url(#gOrange)"/><path d="M50 18 Q65 14 68 8" stroke="#43a047" stroke-width="5" fill="none"/><ellipse cx="60" cy="14" rx="8" ry="4" fill="#43a047"/></svg>` },
  { id: 'folha', w: 21, pay: 3, svg: `<svg viewBox="0 0 100 100"><path d="M20 78 Q22 22 78 22 Q78 78 20 78 Z" fill="url(#gLeaf)"/><path d="M22 76 Q50 50 74 26" stroke="#1b5e20" stroke-width="3" fill="none"/></svg>` }
];

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 4, 8], [6, 4, 2]];
const BET_STEPS = [0.5, 1, 2, 5, 10, 20, 50];
let slotBetIdx = 3; // R$ 5,00
let isSlotSpinning = false;

function initCapivaraSlot() {
  updateSlotHUD();
  renderInitialReels();
}

function updateSlotHUD() {
  const betEl = document.getElementById("slot-bet-val");
  const balEl = document.getElementById("slot-bal-val");
  if (betEl) betEl.textContent = formatCurrency(BET_STEPS[slotBetIdx]);
  if (balEl) balEl.textContent = formatCurrency(State.balance);
}

function changeSlotBet(delta) {
  Sounds.playClick();
  slotBetIdx = Math.max(0, Math.min(BET_STEPS.length - 1, slotBetIdx + delta));
  updateSlotHUD();
}

function renderInitialReels() {
  const reels = document.querySelectorAll(".slot-reel .strip");
  reels.forEach((strip) => {
    strip.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      const cell = document.createElement("div");
      cell.className = "slot-cell";
      cell.innerHTML = sym.svg;
      strip.appendChild(cell);
    }
  });
}

function spinCapivaraSlot() {
  if (isSlotSpinning) return;
  const currentBet = BET_STEPS[slotBetIdx];
  if (State.balance < currentBet) {
    showToast("Saldo insuficiente! Faça um depósito.", "⚠️");
    openModal("modal-deposit");
    return;
  }

  // Deduct bet
  State.balance -= currentBet;
  updateBalanceUI();
  updateSlotHUD();
  isSlotSpinning = true;

  Sounds.playReelSpin();
  const spinBtn = document.getElementById("slot-spin-btn");
  if (spinBtn) spinBtn.classList.add("busy");

  const msgEl = document.getElementById("slot-msg");
  if (msgEl) msgEl.textContent = "Girando...";

  // Clear lines
  const linesSvg = document.getElementById("slot-lines");
  if (linesSvg) linesSvg.innerHTML = "";

  // Spin animation
  const reels = document.querySelectorAll(".slot-reel");
  reels.forEach(r => r.classList.add("spinning"));

  setTimeout(() => {
    // Generate result
    const grid = Array.from({ length: 9 }, () => Math.floor(Math.random() * SYMBOLS.length));
    
    // Evaluate wins
    const lineBet = currentBet / 5;
    let totalWin = 0;
    const winningLines = [];

    LINES.forEach((line, idx) => {
      const s0 = grid[line[0]], s1 = grid[line[1]], s2 = grid[line[2]];
      const base = [s0, s1, s2].find(s => s !== 0) ?? 0;
      if ([s0, s1, s2].every(s => s === base || s === 0)) {
        const winAmt = lineBet * SYMBOLS[base].pay;
        totalWin += winAmt;
        winningLines.push({ line: idx, cells: line, amt: winAmt });
      }
    });

    // Populate final cells
    reels.forEach((reel, colIdx) => {
      reel.classList.remove("spinning");
      const strip = reel.querySelector(".strip");
      strip.innerHTML = "";
      for (let row = 0; row < 3; row++) {
        const symIdx = grid[row * 3 + colIdx];
        const cell = document.createElement("div");
        cell.className = "slot-cell";
        cell.dataset.cellIdx = row * 3 + colIdx;
        cell.innerHTML = SYMBOLS[symIdx].svg;
        strip.appendChild(cell);
      }
    });

    isSlotSpinning = false;
    if (spinBtn) spinBtn.classList.remove("busy");

    if (totalWin > 0) {
      State.balance += totalWin;
      updateBalanceUI();
      updateSlotHUD();
      Sounds.playWin();

      const winEl = document.getElementById("slot-win-val");
      if (winEl) winEl.textContent = formatCurrency(totalWin);

      if (msgEl) msgEl.textContent = `🎉 Ganhou ${formatCurrency(totalWin)}!`;

      // Draw lines
      winningLines.forEach(wl => {
        highlightWinLine(wl.cells);
      });

      // Big Win celebration if win >= 5x bet
      if (totalWin >= currentBet * 5) {
        showBigWinCelebration(totalWin);
      }
    } else {
      if (msgEl) msgEl.textContent = "Boa sorte no próximo giro!";
      const winEl = document.getElementById("slot-win-val");
      if (winEl) winEl.textContent = "R$ 0,00";
    }
  }, 900);
}

function highlightWinLine(cellIndices) {
  cellIndices.forEach(idx => {
    const cell = document.querySelector(`.slot-cell[data-cell-idx="${idx}"]`);
    if (cell) cell.classList.add("win");
  });
}

function showBigWinCelebration(amount) {
  const overlay = document.getElementById("win-overlay");
  const amtEl = document.getElementById("win-amt-display");
  if (!overlay || !amtEl) return;
  amtEl.textContent = formatCurrency(amount);
  overlay.classList.add("show");
  Sounds.playWin();
  setTimeout(() => {
    overlay.classList.remove("show");
  }, 3500);
}

// ==========================================================================
// MINES GAME SIMULATOR
// ==========================================================================
let minesState = {
  active: false,
  bet: 5.00,
  mineCount: 3,
  grid: [],
  revealedCount: 0,
  multiplier: 1.00
};

function initMinesGame() {
  renderMinesGrid();
}

function renderMinesGrid() {
  const board = document.getElementById("mines-board");
  if (!board) return;
  board.innerHTML = "";
  for (let i = 0; i < 25; i++) {
    const tile = document.createElement("button");
    tile.className = "mines-tile";
    tile.innerHTML = `<span>💎</span>`;
    tile.onclick = () => revealMinesTile(i, tile);
    board.appendChild(tile);
  }
}

function startMinesRound() {
  if (State.balance < minesState.bet) {
    showToast("Saldo insuficiente!", "⚠️");
    return;
  }
  State.balance -= minesState.bet;
  updateBalanceUI();
  
  minesState.active = true;
  minesState.revealedCount = 0;
  minesState.multiplier = 1.00;
  
  // Place random mines
  const mines = new Set();
  while (mines.size < minesState.mineCount) {
    mines.add(Math.floor(Math.random() * 25));
  }
  minesState.grid = Array.from({ length: 25 }, (_, i) => mines.has(i) ? 'bomb' : 'gem');

  renderMinesGrid();
  document.getElementById("btn-mines-start").style.display = "none";
  document.getElementById("btn-mines-cashout").style.display = "block";
  document.getElementById("mines-cashout-mult").textContent = "1.00x";
}

function revealMinesTile(idx, tileEl) {
  if (!minesState.active || tileEl.classList.contains("revealed")) return;
  
  tileEl.classList.add("revealed");
  if (minesState.grid[idx] === 'bomb') {
    tileEl.classList.add("bomb");
    tileEl.innerHTML = "💣";
    minesState.active = false;
    showToast("💥 Boom! Você atingiu uma mina.", "💣");
    document.getElementById("btn-mines-start").style.display = "block";
    document.getElementById("btn-mines-cashout").style.display = "none";
  } else {
    tileEl.classList.add("gem");
    tileEl.innerHTML = "💎";
    minesState.revealedCount++;
    minesState.multiplier = (1 + minesState.revealedCount * 0.35);
    Sounds.playCoin();
    document.getElementById("mines-cashout-mult").textContent = minesState.multiplier.toFixed(2) + "x";
    document.getElementById("mines-cashout-val").textContent = formatCurrency(minesState.bet * minesState.multiplier);
  }
}

function cashoutMines() {
  if (!minesState.active || minesState.revealedCount === 0) return;
  const win = minesState.bet * minesState.multiplier;
  State.balance += win;
  updateBalanceUI();
  Sounds.playWin();
  showToast(`🎉 Ganhou ${formatCurrency(win)}!`, "💰");
  minesState.active = false;
  document.getElementById("btn-mines-start").style.display = "block";
  document.getElementById("btn-mines-cashout").style.display = "none";
}

// ==========================================================================
// AVIATOR CRASH SIMULATOR
// ==========================================================================
let aviatorTimer = null;
let aviatorMult = 1.00;
let aviatorBet = 5.00;
let aviatorRunning = false;

function initAviatorGame() {}

function startAviatorFlight() {
  if (aviatorRunning) return;
  if (State.balance < aviatorBet) {
    showToast("Saldo insuficiente!", "⚠️");
    return;
  }
  State.balance -= aviatorBet;
  updateBalanceUI();

  aviatorRunning = true;
  aviatorMult = 1.00;
  const crashPoint = 1.2 + Math.random() * 5.5;

  document.getElementById("btn-aviator-bet").style.display = "none";
  document.getElementById("btn-aviator-cashout").style.display = "block";

  const plane = document.getElementById("aviator-plane");
  const multEl = document.getElementById("aviator-mult-display");

  aviatorTimer = setInterval(() => {
    aviatorMult += 0.05;
    if (multEl) multEl.textContent = aviatorMult.toFixed(2) + "x";
    if (plane) plane.style.transform = `translate(${Math.min(180, (aviatorMult - 1) * 40)}px, -${Math.min(100, (aviatorMult - 1) * 25)}px)`;

    if (aviatorMult >= crashPoint) {
      clearInterval(aviatorTimer);
      aviatorRunning = false;
      if (multEl) multEl.textContent = "CRASHOU!";
      showToast("✈️ Avião voou para longe!", "💥");
      document.getElementById("btn-aviator-bet").style.display = "block";
      document.getElementById("btn-aviator-cashout").style.display = "none";
    }
  }, 100);
}

function cashoutAviator() {
  if (!aviatorRunning) return;
  clearInterval(aviatorTimer);
  aviatorRunning = false;
  const win = aviatorBet * aviatorMult;
  State.balance += win;
  updateBalanceUI();
  Sounds.playWin();
  showToast(`🎉 Ganhou ${formatCurrency(win)}!`, "💰");
  document.getElementById("btn-aviator-bet").style.display = "block";
  document.getElementById("btn-aviator-cashout").style.display = "none";
}

// ==========================================================================
// ROULETTE SIMULATOR
// ==========================================================================
function initRouletteGame() {}

function spinRoulette(choice) {
  const bet = 5.00;
  if (State.balance < bet) {
    showToast("Saldo insuficiente!", "⚠️");
    return;
  }
  State.balance -= bet;
  updateBalanceUI();
  Sounds.playReelSpin();

  const wheel = document.getElementById("roulette-wheel-img");
  if (wheel) wheel.style.transform = `rotate(${Math.floor(Math.random() * 1440 + 720)}deg)`;

  setTimeout(() => {
    const isWin = Math.random() < 0.48;
    if (isWin) {
      const win = bet * 2;
      State.balance += win;
      updateBalanceUI();
      Sounds.playWin();
      showToast(`🎉 Vitória na Roleta: ${formatCurrency(win)}!`, "🎡");
    } else {
      showToast("Tente novamente na Roleta!", "🎡");
    }
  }, 1200);
}

// ==========================================================================
// GENERIC HIGH-END SLOTS (Tigre, Dragão, Coelho, Sweet Bonanza)
// ==========================================================================
function openGenericSlot(gameId) {
  const game = GAME_DATA.find(g => g.id === gameId);
  if (!game) return;
  
  const modal = document.getElementById("modal-generic-slot");
  if (!modal) return;

  document.getElementById("generic-slot-title").textContent = game.title;
  document.getElementById("generic-slot-img").src = game.img;
  openModal("modal-generic-slot");
}

function spinGenericSlot() {
  const bet = 5.00;
  if (State.balance < bet) {
    showToast("Saldo insuficiente!", "⚠️");
    return;
  }
  State.balance -= bet;
  updateBalanceUI();
  Sounds.playReelSpin();

  const img = document.getElementById("generic-slot-img");
  if (img) {
    img.style.filter = "brightness(1.4) blur(2px)";
    setTimeout(() => {
      img.style.filter = "";
      const isWin = Math.random() < 0.35;
      if (isWin) {
        const win = bet * (2 + Math.floor(Math.random() * 6));
        State.balance += win;
        updateBalanceUI();
        Sounds.playWin();
        showToast(`🎉 Ganhou ${formatCurrency(win)}!`, "🎰");
      } else {
        showToast("Boa sorte no próximo giro!", "🎰");
      }
    }, 800);
  }
}

// ==========================================================================
// PIX DEPOSIT INTEGRATION
// ==========================================================================
let selectedDepositAmount = null; // nada marcado: a pessoa escolhe antes de gerar
const Deposit = {
  current: null,
  timer: null,

  load() {
    try { return JSON.parse(localStorage.getItem("orama_pending_deposit")); } catch { return null; }
  },

  save(deposit) {
    this.current = deposit;
    if (deposit) localStorage.setItem("orama_pending_deposit", JSON.stringify(deposit));
    else localStorage.removeItem("orama_pending_deposit");
  },

  setStatus(message, kind = "info") {
    const el = document.getElementById("deposit-status");
    if (!el) return;
    el.textContent = message;
    el.style.color = kind === "ok" ? "var(--neon-green-bright)" : kind === "error" ? "#ff7a7a" : "var(--text-dim)";
  },

  setButton(label, disabled = false) {
    const btn = document.getElementById("btn-confirm-deposit");
    if (!btn) return;
    btn.textContent = label;
    btn.disabled = disabled;
  },

  setPixCode(code) {
    const box = document.getElementById("pix-qr-box");
    if (box) box.hidden = !code; // QR e copia-e-cola só depois que o PIX existe
    const input = document.getElementById("pix-code-input");
    if (input) input.value = code || "Aguardando codigo PIX...";
    renderPixQr(code);
  },

  async create(amount) {
    const user = Auth.current;
    if (!user) return Auth.show("login");
    const amountCents = Math.round(amount * 100);
    if (!Number.isInteger(amountCents) || amountCents < 100) {
      this.setStatus("Informe um valor valido para gerar o PIX.", "error");
      return;
    }

    this.setButton("Gerando PIX...", true);
    this.setStatus("Solicitando cobranca PIX na BullsCash...");
    try {
      const data = await apiFetch("/depositos", {
        method: "POST",
        body: JSON.stringify({
          amountCents,
          buyerName: user.nome,
          buyerDocument: onlyDigits(user.cpf),
          buyerPhone: onlyDigits(user.cel),
          buyerEmail: user.email,
        }),
      });
      const deposit = {
        id: data.id,
        amount,
        amountCents: data.grossAmountCents || amountCents,
        pixEmv: data.pixEmv,
        status: data.status || "pending",
        credited: false,
        createdAt: Date.now(),
      };
      this.save(deposit);
      this.setPixCode(deposit.pixEmv);
      this.setStatus("PIX gerado. Copie o codigo e pague; estou consultando ate confirmar.");
      this.setButton("Aguardando pagamento...", true);
      State.depositHistory.unshift({ date: "Agora mesmo", amount, status: "Aguardando", method: "PIX" });
      this.pollNow();
      this.startPolling();
    } catch (err) {
      this.setStatus(errorMessage(err), "error");
      this.setButton(`Gerar PIX de ${formatCurrency(amount)}`);
    }
  },

  startPolling() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pollNow(), 3000);
  },

  async pollNow() {
    if (!this.current?.id) return;
    try {
      const data = await apiFetch(`/depositos/${encodeURIComponent(this.current.id)}`);
      const status = String(data.status || this.current.status || "").toLowerCase();
      this.current.status = status;
      this.current.amountCents = data.grossAmountCents || this.current.amountCents;
      this.current.pixEmv = data.pixEmv || this.current.pixEmv;
      this.setPixCode(this.current.pixEmv);

      if (PIX_SUCCESS_STATUSES.has(status)) {
        this.credit(data);
        return;
      }
      if (PIX_FAILURE_STATUSES.has(status)) {
        this.fail(status);
        return;
      }
      this.save(this.current);
      this.setStatus(`Pagamento ainda ${status || "pendente"}. Consultando novamente...`);
    } catch (err) {
      this.setStatus(`Nao consegui consultar agora: ${errorMessage(err)}`, "error");
    }
  },

  credit(data) {
    clearInterval(this.timer);
    const amount = centsToReais(data.grossAmountCents || this.current.amountCents);
    if (!this.current.credited) {
      State.balance += amount;
      State.userXp += Math.floor(amount * 10);
      const pending = State.depositHistory.find(item => item.status === "Aguardando" && item.amount === this.current.amount);
      if (pending) pending.status = "Aprovado";
      else State.depositHistory.unshift({ date: "Agora mesmo", amount, status: "Aprovado", method: "PIX" });
      updateBalanceUI();
      Sounds.playCoin();
      showToast(`Deposito de ${formatCurrency(amount)} creditado!`, "🎉");
    }
    this.setStatus("Pagamento confirmado. Saldo atualizado.", "ok");
    this.setButton("Gerar novo PIX");
    this.save(null);
    this.setPixCode(null);
  },

  fail(status) {
    clearInterval(this.timer);
    const pending = State.depositHistory.find(item => item.status === "Aguardando" && item.amount === this.current.amount);
    if (pending) pending.status = "Falhou";
    this.setStatus(`Deposito ${status}. Gere um novo PIX para tentar novamente.`, "error");
    this.setButton("Gerar novo PIX");
    this.save(null);
    this.setPixCode(null);
  },

  resume() {
    const pending = this.load();
    if (!pending?.id) return;
    this.current = pending;
    this.setPixCode(pending.pixEmv);
    this.setStatus("Ha um PIX pendente. Retomando consulta do pagamento...");
    this.setButton("Aguardando pagamento...", true);
    this.pollNow();
    this.startPolling();
  },
};

// escolher/trocar o valor: se já tinha um PIX gerado (e não pago), descarta e pede pra gerar de novo
function setDepositAmount(amt) {
  selectedDepositAmount = amt >= 1 ? Math.round(amt * 100) / 100 : null;
  if (Deposit.current && !Deposit.current.credited) {
    clearInterval(Deposit.timer);
    Deposit.save(null);
    Deposit.setPixCode(null);
    Deposit.setStatus("Valor alterado. Gere um novo PIX.");
  }
  Deposit.setButton(selectedDepositAmount ? `Gerar PIX de ${formatCurrency(selectedDepositAmount)}` : "Escolha um valor", !selectedDepositAmount);
}

function selectDepositPreset(amt, btnEl) {
  Sounds.playClick();
  document.querySelectorAll(".btn-preset").forEach(b => b.classList.remove("selected"));
  if (btnEl) btnEl.classList.add("selected");
  const input = document.getElementById("deposit-custom-val");
  if (input) input.value = amt;
  setDepositAmount(amt);
}

function onDepositCustom(input) {
  document.querySelectorAll(".btn-preset").forEach(b => b.classList.toggle("selected", +b.textContent.replace(/\D/g, "") === +input.value));
  setDepositAmount(Number(input.value));
}

function copyPixCode() {
  Sounds.playClick();
  const code = document.getElementById("pix-code-input")?.value || Deposit.current?.pixEmv || "";
  if (!code || code.startsWith("Clique") || code.startsWith("Aguardando")) {
    showToast("Gere o PIX antes de copiar.", "ℹ️");
    return;
  }
  navigator.clipboard.writeText(code).then(() => {
    showToast("Código PIX Copiado!", "📋");
  }).catch(() => {
    showToast("Código PIX Copiado!", "📋");
  });
}

function confirmDeposit() {
  Sounds.playClick();
  if (!selectedDepositAmount) { Deposit.setStatus("Escolha um valor primeiro.", "error"); return; }
  if (Deposit.current && !Deposit.current.credited) return; // já tem PIX gerado aguardando pagamento
  Deposit.create(selectedDepositAmount);
}

async function apiFetch(path, init = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw data;
  return data;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function centsToReais(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

function errorMessage(err) {
  if (typeof err === "string") return err;
  if (err?.message) return err.message;
  if (err?.detail?.message) return err.detail.message;
  return "verifique se a API esta rodando e configurada com as chaves BullsCash";
}

// ==========================================================================
// PROFILE, RANKING & DAILY BONUS
// ==========================================================================
// Bônus diário: liga/desliga e valor vêm do painel admin (Configurações). A API só libera
// se a conta apostou hoje e ainda não resgatou; sem API o botão fica escondido.
const Bonus = {
  info: null,
  async atualizar() {
    const btn = document.getElementById("btn-claim-daily"), aviso = document.getElementById("notif-bonus");
    const u = Auth.current;
    try { this.info = u ? await apiFetch(`/bonus-diario?email=${encodeURIComponent(u.email)}`) : null; } catch { this.info = null; }
    const b = this.info, pode = b?.ativo && !b.resgatadoHoje && b.apostadoHoje > 0;
    if (btn) {
      btn.style.display = b?.ativo ? "" : "none";
      btn.disabled = !pode;
      btn.style.opacity = pode ? "1" : "0.55";
      btn.textContent = !b?.ativo ? "" : b.resgatadoHoje ? "✅ Bônus de hoje resgatado · volte amanhã"
        : b.apostadoHoje > 0 ? `🎁 Resgatar Bônus Diário (+${formatCurrency(b.valor)})`
        : `🎁 Jogue uma rodada hoje pra liberar ${formatCurrency(b.valor)}`;
    }
    if (aviso) {
      aviso.style.display = pode ? "" : "none";
      const d = aviso.querySelector(".notif-bonus-desc");
      if (d && b) d.textContent = `Resgate agora seus ${formatCurrency(b.valor)} grátis direto no perfil.`;
    }
  },
  async resgatar() {
    const u = Auth.current, btn = document.getElementById("btn-claim-daily");
    if (!u || !btn || btn.disabled) return;
    btn.disabled = true; btn.textContent = "Resgatando...";
    try {
      const { valor } = await apiFetch("/bonus-diario", { method: "POST", body: JSON.stringify({ email: u.email }) });
      // só credita depois que a API aceitou (ela garante um por dia)
      State.balance = Math.round((State.balance + valor) * 100) / 100;
      updateBalanceUI();
      Sounds.playCoin();
      showToast(`🎁 Bônus de ${formatCurrency(valor)} resgatado com sucesso!`, "🎉");
    } catch (e) {
      showToast(e?.message || "Não foi possível resgatar agora", "⚠️");
    }
    this.atualizar();
  },
};
function claimDailyBonus() { Bonus.resgatar(); }

// Navigation Tab Switcher
function switchNavTab(tabName, el) {
  Sounds.playClick();
  State.activeTab = tabName;
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  if (el && !el.classList.contains("btn-deposit-float")) {
    el.classList.add("active");
  }

  if (tabName === "inicio") {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (tabName === "jogos") {
    const sec = document.getElementById("sec-all-games");
    if (sec) sec.scrollIntoView({ behavior: 'smooth' });
  } else if (tabName === "ranking") {
    openModal("modal-ranking");
  } else if (tabName === "perfil") {
    openModal("modal-profile");
  }
}

// Initialization on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  updateBalanceUI(false);
  Deposit.resume();

  // Initialize fireflies
  const ambience = document.getElementById("bg-ambience");
  if (ambience) {
    for (let i = 0; i < 12; i++) {
      const fly = document.createElement("div");
      fly.className = "firefly";
      fly.style.left = `${Math.random() * 100}%`;
      fly.style.top = `${Math.random() * 100}%`;
      fly.style.animationDelay = `${Math.random() * 5}s`;
      ambience.appendChild(fly);
    }
  }

  // Bind unlock sound on first user touch/click
  window.addEventListener('click', () => Sounds.init(), { once: true });
  window.addEventListener('touchstart', () => Sounds.init(), { once: true });
});

// ==========================================================================
// LOGIN / CADASTRO
// ponytail: sem servidor, as contas ficam no localStorage deste aparelho.
// Com dinheiro de verdade isso precisa ir pra um backend (senha com bcrypt/argon2, sessão no servidor).
// ==========================================================================

// SHA-256 próprio: crypto.subtle não existe em http:// (ex.: abrir pelo IP da rede no celular)
function sha256Hex(msg) {
  const K = [], H = [];
  const frac = x => (x - Math.floor(x)) * 2 ** 32 | 0;
  for (let n = 2, c = 0; c < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (prime) { if (c < 8) H[c] = frac(n ** 0.5); K[c++] = frac(n ** (1 / 3)); }
  }
  const b = new TextEncoder().encode(msg), l = b.length;
  const w = new Array((((l + 8) >> 6) + 1) * 16).fill(0);
  for (let i = 0; i < l; i++) w[i >> 2] |= b[i] << (24 - (i % 4) * 8);
  w[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
  w[w.length - 1] = l * 8;
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let j = 0; j < w.length; j += 16) {
    const m = w.slice(j, j + 16);
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      if (i >= 16) {
        const x = m[i - 15], y = m[i - 2];
        m[i] = (m[i - 16] + (r(x, 7) ^ r(x, 18) ^ (x >>> 3)) + m[i - 7] + (r(y, 17) ^ r(y, 19) ^ (y >>> 10))) | 0;
      }
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + m[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    [a, bb, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

function syncSessionCookie(email) {
  const base = "path=/; SameSite=Lax; max-age=";
  if (email) document.cookie = `orama_session=${encodeURIComponent(email)}; ${base}${60 * 60 * 24 * 30}`;
  else document.cookie = `orama_session=; ${base}0`;
}

const Auth = {
  current: null,
  GATED: ["modal-deposit", "modal-profile", "modal-withdraw"], // precisa estar logado pra abrir

  users() {
    try { return JSON.parse(localStorage.getItem("orama_users")) || []; } catch { return []; }
  },

  init() {
    const email = localStorage.getItem("orama_session");
    this.current = this.users().find(u => u.email === email) || null;
    syncSessionCookie(this.current?.email || null);
    loadBalance(); updateBalanceUI(false);
    this.render();
    setTimeout(() => { if (!this.current) this.show("login"); }, 1300); // depois da animação do logo
  },

  render() {
    State.username = this.current ? this.current.nome.split(" ")[0] : "Visitante";
    document.querySelectorAll(".js-username").forEach(e => (e.textContent = State.username));
  },

  show(which) {
    ["login", "register"].forEach(k => document.getElementById("modal-" + k).classList.remove("show"));
    // abre sempre limpo, sem erro de tentativa anterior
    document.querySelectorAll(".auth-err, .auth-form-err").forEach(e => (e.textContent = ""));
    document.querySelectorAll(".auth-field.invalid").forEach(e => e.classList.remove("invalid"));
    openModal("modal-" + which);
  },

  hash(salt, senha) {
    return sha256Hex(salt + ":" + senha);
  },

  // ---- validação ----
  setErr(form, name, msg) {
    const field = form.elements[name].closest(".auth-field");
    field.classList.toggle("invalid", !!msg);
    field.querySelector(".auth-err").textContent = msg || "";
    return !msg;
  },

  cpfValido(cpf) {
    const d = cpf.replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const len of [9, 10]) {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
      if (((sum * 10) % 11) % 10 !== +d[len]) return false;
    }
    return true;
  },

  idade(nasc) {
    const n = new Date(nasc + "T00:00"), h = new Date();
    return h.getFullYear() - n.getFullYear() - (h < new Date(h.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
  },

  // ---- ações ----
  register(ev) {
    ev.preventDefault();
    const f = ev.target, v = n => f.elements[n].value.trim();
    const cpf = v("cpf").replace(/\D/g, ""), email = v("email").toLowerCase(), senha = f.elements.senha.value;
    const users = this.users();
    const ok = [
      this.setErr(f, "nome", v("nome").split(/\s+/).length < 2 ? "Digite nome e sobrenome" : ""),
      this.setErr(f, "cpf", !this.cpfValido(cpf) ? "CPF inválido" : users.some(u => u.cpf === cpf) ? "CPF já cadastrado" : ""),
      this.setErr(f, "email", !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "E-mail inválido" : users.some(u => u.email === email) ? "E-mail já cadastrado" : ""),
      this.setErr(f, "cel", v("cel").replace(/\D/g, "").length < 10 ? "Celular inválido" : ""),
      this.setErr(f, "nasc", !v("nasc") ? "Informe a data" : this.idade(v("nasc")) < 18 ? "Só maiores de 18 anos" : ""),
      this.setErr(f, "senha", senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha) ? "Mínimo 8 caracteres, com letras e números" : ""),
      this.setErr(f, "senha2", f.elements.senha2.value !== senha ? "As senhas não conferem" : ""),
    ].every(Boolean);
    const termos = f.elements.termos.checked;
    document.getElementById("termos-err").textContent = termos ? "" : "Confirme que tem 18+ e aceita os termos";
    if (!ok || !termos) return Sounds.playClick();

    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
    users.push({ nome: v("nome"), cpf, email, cel: v("cel"), nasc: v("nasc"), salt, hash: this.hash(salt, senha) });
    localStorage.setItem("orama_users", JSON.stringify(users));
    localStorage.setItem(`orama_saldo6_${email}`, String(NEW_ACCOUNT_BALANCE)); // conta nova: saldo de boas-vindas
    f.reset(); this.strength(f.elements.senha);
    this.startSession(users[users.length - 1], "Conta criada! Bem-vindo(a)");
  },

  login(ev) {
    ev.preventDefault();
    const f = ev.target, id = f.elements.id.value.trim(), senha = f.elements.senha.value;
    const errBox = document.getElementById("login-err");
    const ok = [
      this.setErr(f, "id", id ? "" : "Informe seu e-mail ou CPF"),
      this.setErr(f, "senha", senha ? "" : "Informe sua senha"),
    ].every(Boolean);
    errBox.textContent = "";
    if (!ok) return;
    const digits = id.replace(/\D/g, "");
    const u = this.users().find(u => (/^[\d.\-\s]+$/.test(id) ? u.cpf === digits : u.email === id.toLowerCase()));
    if (!u || this.hash(u.salt, senha) !== u.hash) {
      errBox.textContent = "E-mail/CPF ou senha incorretos";
      return Sounds.playClick();
    }
    f.reset();
    this.startSession(u, "Bem-vindo(a) de volta");
  },

  startSession(u, msg) {
    this.current = u;
    localStorage.setItem("orama_session", u.email);
    syncSessionCookie(u.email);
    loadBalance(); updateBalanceUI(false);
    this.render();
    Saques.sincronizar();
    ["login", "register"].forEach(k => closeModal("modal-" + k));
    Sounds.playCoin();
    showToast(`${msg}, ${State.username}!`, "🎉");
  },

  logout() {
    saveBalance();
    this.current = null;
    localStorage.removeItem("orama_session");
    syncSessionCookie(null);
    State.balance = START_BALANCE; updateBalanceUI(false);
    this.render();
    closeModal("modal-profile");
    showToast("Você saiu da conta", "👋");
    this.show("login");
  },

  forgot() {
    showToast("Recuperação de senha em breve. Fale com o suporte.", "ℹ️");
  },

  // ---- detalhes de UI ----
  togglePass(btn) {
    const input = btn.parentElement.querySelector("input");
    input.type = input.type === "password" ? "text" : "password";
    btn.classList.toggle("on", input.type === "text");
  },

  strength(input) {
    const s = input.value;
    const score = [s.length >= 8, /[A-Z]/.test(s) && /[a-z]/.test(s), /\d/.test(s), /[^A-Za-z0-9]/.test(s), s.length >= 12].filter(Boolean).length;
    const bar = input.closest(".auth-field").querySelector(".auth-strength i");
    bar.style.width = s ? score * 20 + "%" : "0";
    bar.style.background = score <= 2 ? "#ff5a5a" : score === 3 ? "#f5c542" : "#14cd5e";
  },

  maskCpf(el) {
    const d = el.value.replace(/\D/g, "").slice(0, 11);
    el.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  },

  maskCel(el) {
    const d = el.value.replace(/\D/g, "").slice(0, 11);
    el.value = d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3")
      : d.length > 6 ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3")
      : d.length > 2 ? d.replace(/(\d{2})(\d{0,5})/, "($1) $2") : d;
  }
};

// ==========================================================================
// SAQUE
// O pedido vai pra API (pendente) e o valor sai do saldo na hora. O admin faz o PIX na mão e aprova, ou cancela:
// aí este aparelho devolve o valor ao saldo. A API marca o estorno, então outro aparelho não devolve de novo.
// ponytail: saldo ainda mora no aparelho; com carteira no servidor o débito/estorno passa a ser lá
// ==========================================================================
const Saques = {
  MIN: 10,
  avisados: new Set(), // aprovações já avisadas nesta sessão
  conta() {
    const u = Auth.current;
    return u ? { email: u.email, cpf: u.cpf } : null;
  },
  valor() { return Math.round(parseFloat(document.getElementById("saque-valor").value || "0") * 100) / 100; },

  abrir() {
    const u = Auth.current;
    if (!u) return;
    document.getElementById("saque-disponivel").textContent = formatCurrency(State.balance);
    document.getElementById("saque-chave").textContent = u.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4");
    document.getElementById("saque-valor").value = "";
    this.validar();
    this.sincronizar();
    // mínimo configurado no painel admin (Configurações → Saques)
    apiFetch("/saques/regras").then(r => {
      this.MIN = r.minimo;
      document.getElementById("saque-valor").placeholder = `Mínimo ${formatCurrency(r.minimo)}`;
      document.getElementById("saque-valor").min = r.minimo;
      this.validar();
    }).catch(() => {});
  },

  validar() {
    const v = this.valor(), btn = document.getElementById("btn-saque");
    const erro = !v ? "Digite o valor" : v < this.MIN ? `Mínimo ${formatCurrency(this.MIN)}` : v > State.balance ? "Saldo insuficiente" : "";
    btn.disabled = !!erro;
    btn.textContent = erro || `Solicitar saque de ${formatCurrency(v)}`;
  },

  async pedir() {
    const u = Auth.current, v = this.valor(), st = document.getElementById("saque-status"), btn = document.getElementById("btn-saque");
    if (!u || v < this.MIN || v > State.balance) return this.validar();
    btn.disabled = true; btn.textContent = "Enviando...";
    try {
      await apiFetch("/saques", { method: "POST", body: JSON.stringify({ email: u.email, cpf: u.cpf, nome: u.nome, valor: v, saldo: Math.round(State.balance * 100) / 100 }) });
      // só debita depois que a API aceitou: sem API, o dinheiro não some do saldo
      State.balance = Math.round((State.balance - v) * 100) / 100;
      updateBalanceUI();
      st.textContent = "Pedido enviado! Ele fica pendente até a análise; se for cancelado, o valor volta pro seu saldo.";
      showToast(`Saque de ${formatCurrency(v)} solicitado`, "💸");
      this.abrir();
    } catch (e) {
      st.textContent = Object.values(e?.erros || {})[0] || e?.message || "Não foi possível pedir o saque agora. Tente de novo.";
      this.validar();
    }
  },

  /** busca os saques da conta, devolve ao saldo os cancelados (uma vez só) e desenha a lista se o modal estiver aberto */
  async sincronizar() {
    const c = this.conta();
    if (!c) return;
    let lista;
    try { lista = await apiFetch(`/saques?email=${encodeURIComponent(c.email)}&cpf=${c.cpf}`); } catch { return; }
    if (Auth.current?.email !== c.email) return; // trocou de conta no meio
    for (const s of lista) {
      if (s.status === "cancelado" && !s.estornado) {
        try {
          const r = await apiFetch(`/saques/${s.id}/estorno`, { method: "POST", body: JSON.stringify(c) });
          if (r.devolver) {
            State.balance = Math.round((State.balance + s.valor) * 100) / 100;
            updateBalanceUI();
            showToast(`Saque cancelado: ${formatCurrency(s.valor)} voltou pro saldo${s.motivo ? ` (${s.motivo})` : ""}`, "↩️");
          }
          s.estornado = true;
        } catch {}
      }
      const k = `orama_saque_ok_${s.id}`;
      if (s.status === "aprovado" && !this.avisados.has(s.id) && !localStorage.getItem(k)) {
        this.avisados.add(s.id); localStorage.setItem(k, "1");
        showToast(`Saque de ${formatCurrency(s.valor)} aprovado! O PIX foi enviado.`, "✅");
      }
    }
    this.desenhar(lista);
  },

  desenhar(lista) {
    const el = document.getElementById("saque-lista");
    if (!el) return;
    const nome = { pendente: "Pendente", aprovado: "Aprovado", cancelado: "Cancelado" };
    const quando = d => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    const esc = t => String(t).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    el.innerHTML = lista.length ? lista.map(s => `
      <div class="saque-item">
        <div><b>${formatCurrency(s.valor)}</b><small>${quando(s.criadoEm)}${s.status === "cancelado" && s.motivo ? ` · ${esc(s.motivo)}` : ""}</small></div>
        <span class="saque-badge ${s.status}">${nome[s.status] || s.status}</span>
      </div>`).join("") : '<p class="saque-vazio">Nenhum saque ainda.</p>';
    if (document.getElementById("modal-withdraw").classList.contains("show")) document.getElementById("saque-disponivel").textContent = formatCurrency(State.balance);
  },
};
setInterval(() => Saques.sincronizar(), 30_000);

document.addEventListener("DOMContentLoaded", () => { Auth.init(); Saques.sincronizar(); });

// ==========================================================================
// JOGO EM TELA CHEIA (iframe da mesma origem: o jogo lê/escreve State.balance)
// ==========================================================================
function openGame(url) {
  const ov = document.getElementById("game-overlay");
  Music.stop(); // o jogo tem trilha própria
  const fr = ov.querySelector("iframe");
  ov.classList.remove("back-top");
  fr.onload = () => { try { ov.classList.toggle("back-top", fr.contentDocument.body.dataset.back === "top"); } catch {} };
  fr.src = url;
  ov.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeGame() {
  const ov = document.getElementById("game-overlay");
  ov.classList.remove("show");
  ov.querySelector("iframe").src = "about:blank"; // para o som e o giro automático
  document.body.style.overflow = "";
  updateBalanceUI();
  Music.start();
}

// QR code do PIX a partir do "copia e cola" (EMV). Lib: qrcode-generator (carregada no index.html)
function renderPixQr(code) {
  const box = document.getElementById("pix-qr");
  if (!box) return;
  if (!code || typeof qrcode !== "function") {
    box.innerHTML = '<span class="pix-qr-empty">O QR code aparece aqui depois de gerar o PIX</span>';
    return;
  }
  const qr = qrcode(0, "M"); // versão automática, correção de erro média (padrão dos bancos)
  qr.addData(code);
  qr.make();
  box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
