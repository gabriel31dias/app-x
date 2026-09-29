// Tira os prints de todas as telas (site do jogador, painel admin e painel do influencer) usando a API de demonstração
// (schema "demo", dados fictícios). Salva em white-label/telas/*.webp.
// Uso: PLAYWRIGHT=<caminho do playwright-core> DEMO_API=http://127.0.0.1:3300 node tools/white-label/prints.mjs
import { createServer, request } from 'node:http';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = join(import.meta.dirname, '../..');
const OUT = join(ROOT, 'white-label/telas');
const API = new URL(process.env.DEMO_API ?? 'http://127.0.0.1:3300');
const PORT = 8899, BASE = `http://127.0.0.1:${PORT}`;
const SENHA = 'Demo2026orama';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? 'playwright-core');
mkdirSync(OUT, { recursive: true });

// servidor igual ao serve.mjs: arquivos do projeto + /api/* repassado pra API de demonstração
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const srv = createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const up = request({ host: API.hostname, port: API.port, path: req.url.slice(4), method: req.method, headers: { ...req.headers, host: API.host } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    return req.pipe(up);
  }
  const path = decodeURIComponent(new URL(req.url, BASE).pathname);
  const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(ROOT) || /[\\/](api|node_modules)[\\/]|[\\/]\./.test(file.slice(ROOT.length))) { res.writeHead(404); return res.end(); }
  try {
    if (!statSync(file).isFile()) throw 0;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
}).listen(PORT, '127.0.0.1');

const browser = await chromium.launch();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// endereço local vira um domínio de exemplo (é um white label: cada cliente usa o seu)
const DOMINIO = 'seucassino.com.br';
async function trocarEndereco(page) {
  for (const f of page.frames()) {
    await f.evaluate(({ de, para }) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (w.currentNode.nodeValue.includes(de)) w.currentNode.nodeValue = w.currentNode.nodeValue.replaceAll('http://' + de, 'https://' + para).replaceAll(de, para);
      document.querySelectorAll('input').forEach((i) => { if (i.value.includes(de)) i.value = i.value.replaceAll('http://' + de, 'https://' + para).replaceAll(de, para); });
    }, { de: `127.0.0.1:${PORT}`, para: DOMINIO }).catch(() => {});
  }
}
async function foto(page, nome, { full = false } = {}) {
  await esperar(900);
  await trocarEndereco(page);
  await page.screenshot({ path: join(OUT, `${nome}.jpg`), fullPage: full, type: 'jpeg', quality: 84 });
  console.log('ok', nome);
}

// ---------- painel admin (computador) ----------
async function painel() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/#/login`);
  await page.fill('#login', 'admin@oramagames.site');
  await page.fill('#senha', SENHA);
  await page.click('button[type=submit]');
  await page.waitForURL(/#\/dashboard/);
  // um jogador com o crash aberto, pra tela Jogadores mostrar o "Jogando agora"
  const jog = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
  const jp = await jog.newPage();
  await jp.addInitScript(() => {
    localStorage.setItem('orama_session', 'mariana@exemplo.com');
    localStorage.setItem('orama_users', JSON.stringify([{ nome: 'Mariana Costa', email: 'mariana@exemplo.com' }]));
    document.cookie = 'orama_session=mariana%40exemplo.com; path=/';
  });
  await jp.goto(`${BASE}/crash.html`);
  await esperar(2500);
  const telas = ['dashboard', 'jogadores', 'rtp', 'vendas', 'rodadas', 'saques', 'bonus', 'indicacoes', 'influencers', 'influencers/saques', 'configuracoes'];
  for (const t of telas) {
    await page.goto(`${BASE}/admin/#/${t}`);
    await page.waitForLoadState('networkidle');
    await foto(page, `admin-${t.replace('/', '-')}`);
  }
  await ctx.close();
  await jog.close();

  // painel do influencer
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/admin/#/login`);
  await p2.fill('#login', 'lari@exemplo.com');
  await p2.fill('#senha', SENHA);
  await p2.click('button[type=submit]');
  await p2.waitForURL(/#\/influencer/);
  await p2.waitForLoadState('networkidle');
  await foto(p2, 'influencer-dashboard');
  await ctx2.close();
}

// ---------- site do jogador (celular) ----------
async function site() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await ctx.newPage();
  await SITE(page);
  await ctx.close();
}
async function SITE(page) {
  // conta de demonstração já logada (as contas do site ficam no aparelho) e a API apontando pro proxy
  await page.addInitScript(({ base }) => {
    if (sessionStorage.getItem('demo-ok')) return;
    sessionStorage.setItem('demo-ok', '1');
    localStorage.setItem('orama_api_base', base + '/api');
    localStorage.setItem('orama_users', JSON.stringify([{ nome: 'Mariana Costa', cpf: '52998224725', email: 'mariana@exemplo.com', cel: '11987654321', nasc: '1996-04-12', salt: 'x', hash: 'x' }]));
    localStorage.setItem('orama_session', 'mariana@exemplo.com');
    localStorage.setItem('orama_saldo6_mariana@exemplo.com', '1284.50');
  }, { base: BASE });
  const js = (fn, arg) => page.evaluate(fn, arg);
  const fechar = () => js(() => document.querySelectorAll('.show').forEach((m) => m.classList.remove('show')));

  await page.goto(`${BASE}/index.html`);
  await page.waitForLoadState('networkidle');
  await foto(page, 'site-inicio');
  await js(() => document.getElementById('sec-all-games').scrollIntoView());
  await foto(page, 'site-jogos');
  await js(() => scrollTo(0, 0));

  await js(() => { openModal('modal-deposit'); selectDepositPreset(50, document.querySelectorAll('.btn-preset')[1]); });
  await foto(page, 'site-deposito');
  await fechar();
  await js(() => openModal('modal-withdraw'));
  await foto(page, 'site-saque');
  await fechar();
  // do perfil, só o cartão do indique e ganhe (o resto do perfil ainda tem textos de exemplo)
  await js(() => openModal('modal-profile'));
  await js(() => document.getElementById('indique')?.scrollIntoView({ block: 'center' }));
  await esperar(900);
  await trocarEndereco(page);
  await page.locator('#indique').screenshot({ path: join(OUT, 'site-indique.jpg'), type: 'jpeg', quality: 84 });
  console.log('ok site-indique');
  await fechar();

  // jogos abertos dentro do site
  for (const [id, nome] of [['capivara', 'site-jogo-capivara'], ['galinha', 'site-jogo-crash'], ['raspa', 'site-jogo-raspadinha'], ['truco', 'site-jogo-truco'], ['gatinho', 'site-jogo-gatinho'], ['sinuca', 'site-jogo-sinuca'], ['bichos', 'site-jogo-bichos']]) {
    await js((g) => launchGame(g), id);
    await esperar(3500);
    await foto(page, nome);
    await js(() => closeGame());
  }

  // cadastro (sem conta logada)
  await js(() => { localStorage.removeItem('orama_session'); });
  await page.goto(`${BASE}/index.html`);
  await page.waitForLoadState('networkidle');
  await js(() => Auth.show('register'));
  await foto(page, 'site-cadastro');
}

try {
  if (!process.argv.includes('--so-site')) await painel();
  await site();
} finally {
  await browser.close();
  srv.close();
}
