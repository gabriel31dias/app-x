// Informa cada rodada pra API (painel admin: lucro por jogo). Sem API o jogo segue normal.
// ponytail: o navegador é quem informa, então dá pra mandar número falso; vale até o sorteio ir pro servidor.
function reportarRodada(jogo, aposta, premio) {
  try {
    const b = new Uint8Array(16); crypto.getRandomValues(b); // randomUUID não existe em http:// fora de localhost
    const chave = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    // dentro do site: a conta logada fica no localStorage (mesma origem do iframe)
    let jogador = null;
    try { if (window.parent !== window) jogador = localStorage.getItem('orama_session'); } catch {}
    fetch('api/rodadas', {
      method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jogo, aposta, premio, chave, jogador }),
    }).catch(() => {});
  } catch {}
}
