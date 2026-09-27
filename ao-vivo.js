// Ao vivo: deixa o admin assistir este jogo em tempo real (painel admin → Jogadores → Assistir).
// Só grava a tela (rrweb) enquanto algum admin está vendo: o servidor manda 'gravar' true/false.
// Nada é guardado no servidor; campos de digitação vão mascarados. Precisa de vendor/socket.io.min.js e vendor/rrweb-record.min.js.
// LGPD: a gravação precisa estar avisada na política de privacidade do site.
function aoVivo(jogo) {
  if (typeof io === 'undefined' || typeof rrwebRecord === 'undefined') return;
  let jogador = null, jogadorNome = null;
  try {
    jogador = localStorage.getItem('orama_session'); // conta logada no site (mesma origem do iframe)
    jogadorNome = (JSON.parse(localStorage.getItem('orama_users')) || []).find(u => u.email === jogador)?.nome ?? null;
  } catch {}

  // /api/socket.io passa pelo serve.mjs até a API, igual às outras rotas /api
  const socket = io(location.origin + '/ao-vivo', {
    path: new URL('api/socket.io', location.href).pathname,
    auth: { jogo, jogador, jogadorNome },
  });

  let parar = null, fila = [];
  const desligar = () => { parar?.(); parar = null; fila = []; };
  socket.on('gravar', ligado => {
    desligar();
    if (!ligado) return;
    // recomeçar sempre: o rrweb abre com uma foto completa da página, que o player do admin precisa
    parar = rrwebRecord.record({
      emit: e => fila.push(e),
      maskAllInputs: true,
      recordCanvas: true,
      sampling: { canvas: 6, mousemove: 80, scroll: 150, input: 'last' },
      dataURLOptions: { type: 'image/webp', quality: 0.5 },
    });
  });
  socket.on('controle', comando => {
    window.dispatchEvent(new CustomEvent('orama:controle', { detail: comando }));
  });
  socket.on('disconnect', desligar);
  // manda em lotes: menos pacotes, e o player do admin roda com meio segundo de folga
  setInterval(() => {
    if (fila.length && socket.connected) { socket.emit('ev', fila); fila = []; }
  }, 250);
}
