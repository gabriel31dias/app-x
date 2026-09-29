// RTP ao vivo: a cada 10 s pergunta à API se o RTP deste jogo mudou no painel admin.
// A troca espera a rodada/partida atual acabar (quem apostou recebe pela tabela que viu).
// Uso: rtpAoVivo('perereca', PS, { ocupado: () => girando, depois: rtp => redesenharTabela() })
function rtpAoVivo(jogo, motor, { ocupado = () => false, depois = () => {} } = {}) {
  let alvo = motor.RTP, esperando = false;
  const url = () => {
    let jogador = '';
    try { jogador = localStorage.getItem('orama_session') || ''; } catch {}
    return 'api/rtp' + (jogador ? `?jogador=${encodeURIComponent(jogador)}` : '');
  };

  function aplicar() {
    if (motor.RTP === alvo) return (esperando = false);
    if (ocupado()) { esperando = true; return setTimeout(aplicar, 500); }
    esperando = false;
    motor.setRtp(alvo);
    try { depois(alvo); } catch (e) { console.error(e); }
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

  setInterval(checar, 10000);
  document.addEventListener('visibilitychange', checar);
}
