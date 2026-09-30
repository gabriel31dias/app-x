// Modo teste (visitante sem conta, jogo aberto com ?demo=1): chances normais, saldo de brincadeira, nada vai pra API.
// Depois de testar um pouco, o primeiro ganho (ou DEMO_MAX rodadas) chama o cadastro no site.
const DEMO = /[?&]demo=1/.test(location.search), DEMO_MIN = 3, DEMO_MAX = 20;
let demoRodadas = 0, demoConvidou = false;
function demoConta(premio) {
  demoRodadas++;
  if (demoConvidou || !((premio > 0 && demoRodadas >= DEMO_MIN) || demoRodadas >= DEMO_MAX)) return;
  demoConvidou = true;
  setTimeout(() => { try { window.parent.Demo?.convite(premio); } catch {} }, 4500); // deixa a comemoração do ganho acontecer
}
if (DEMO) {
  const tag = document.createElement('div');
  tag.textContent = 'MODO TESTE · saldo de brincadeira';
  tag.style.cssText = 'position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:9999;padding:3px 10px;border-radius:10px;background:#000b;color:#ffd54a;font:800 11px system-ui,sans-serif;pointer-events:none;letter-spacing:.5px';
  document.body.append(tag);
}

// Informa cada rodada pra API (painel admin: lucro por jogo). Sem API o jogo segue normal.
// ponytail: o navegador é quem informa, então dá pra mandar número falso; vale até o sorteio ir pro servidor.
function reportarRodada(jogo, aposta, premio) {
  if (DEMO) return demoConta(premio);
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
