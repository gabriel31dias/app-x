// RTP ao vivo: a cada 10 s pergunta à API se o RTP deste jogo mudou no painel admin.
// A troca espera a rodada/partida atual acabar (quem apostou recebe pela tabela que viu) e avisa o jogador.
// Uso: rtpAoVivo('perereca', PS, { ocupado: () => girando, depois: rtp => redesenharTabela() })
function rtpAoVivo(jogo, motor, { ocupado = () => false, depois = () => {} } = {}) {
  let alvo = motor.RTP, esperando = false;
  const pct = r => (r * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  const url = () => {
    let jogador = '';
    try { jogador = localStorage.getItem('orama_session') || ''; } catch {}
    return 'api/rtp' + (jogador ? `?jogador=${encodeURIComponent(jogador)}` : '');
  };

  function aplicar() {
    if (motor.RTP === alvo) return (esperando = false);
    if (ocupado()) { esperando = true; return setTimeout(aplicar, 500); }
    esperando = false;
    const antes = motor.RTP;
    motor.setRtp(alvo);
    try { depois(alvo); } catch (e) { console.error(e); }
    aviso(`RTP do jogo atualizado: ${pct(antes)} → ${pct(alvo)}. Os prêmios mudam a partir desta rodada.`);
  }

  function checar() {
    if (document.hidden) return; // aba escondida não consulta; volta a checar quando reaparecer
    fetch(url(), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(m => {
        if (!m) return;
        alvo = m[jogo] ?? motor.FABRICA; // sem linha no banco = RTP de fábrica
        if (!esperando) aplicar();
      })
      .catch(() => {}); // sem API o jogo segue com o RTP que já tem
  }

  function aviso(texto) {
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.textContent = texto;
    el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,420px);padding:10px 14px;border-radius:12px;background:#111c;color:#fff;font:600 13px/1.35 system-ui,sans-serif;text-align:center;box-shadow:0 6px 20px #0008;pointer-events:none;transition:opacity .4s';
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 4000);
  }

  setInterval(checar, 10000);
  document.addEventListener('visibilitychange', checar);
}
