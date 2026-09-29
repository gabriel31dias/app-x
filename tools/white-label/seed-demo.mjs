// Popula o schema "demo" do Postgres com dados FICTÍCIOS para os prints do site white label.
// Nunca toca no schema public (dados reais). A API de demonstração precisa estar rodando em DEMO_API.
// Uso: DEMO_DATABASE_URL="postgresql://...?schema=demo" DEMO_API=http://127.0.0.1:3300 node tools/white-label/seed-demo.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../api/package.json', import.meta.url));
const pg = require('pg');

const URL_DB = process.env.DEMO_DATABASE_URL;
const API = process.env.DEMO_API ?? 'http://127.0.0.1:3300';
if (!URL_DB || new URL(URL_DB).searchParams.get('schema') !== 'demo') throw new Error('DEMO_DATABASE_URL precisa ter ?schema=demo');

// aleatório com semente: os prints saem iguais toda vez
let seed = 20260929;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

function cpf() {
  const n = Array.from({ length: 9 }, () => int(0, 9));
  for (const len of [9, 10]) {
    const s = n.slice(0, len).reduce((acc, d, i) => acc + d * (len + 1 - i), 0);
    n.push(((s * 10) % 11) % 10);
  }
  return n.join('');
}

const NOMES = ['Ana Paula Souza', 'Bruno Carvalho', 'Carla Mendes', 'Diego Ramos', 'Eduarda Lima', 'Felipe Rocha', 'Gabriela Nunes',
  'Henrique Alves', 'Isabela Moraes', 'João Victor Dias', 'Karina Lopes', 'Lucas Martins', 'Marcos Pereira', 'Natália Freitas',
  'Otávio Barros', 'Patrícia Gomes', 'Rafael Teixeira', 'Sabrina Castro', 'Thiago Ribeiro', 'Vanessa Pinto', 'Wesley Cardoso',
  'Yasmin Correia', 'Caio Fernandes', 'Débora Azevedo', 'Igor Monteiro', 'Juliana Prado', 'Leonardo Farias', 'Mirela Santana',
  'Pedro Henrique Luz', 'Renata Vieira', 'Samuel Duarte', 'Tatiane Brito', 'Vinícius Moura', 'Bianca Rezende', 'Gustavo Peixoto',
  'Larissa Campos', 'Matheus Siqueira', 'Priscila Andrade', 'Rodrigo Tavares', 'Aline Batista'];
const email = (nome) => nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.') + '@exemplo.com';
const JOGOS = { capivara: 0.97, gatinho: 0.97, papagaio: 0.97, macaco: 0.95, raspa: 0.96, bichos: 0.96, crash: 0.97, truco: 0.96, sinuca: 0.96, velha: 0.96, perereca: 0.96, sapo: 0.96 };
const PESO = { capivara: 9, gatinho: 8, crash: 10, macaco: 6, papagaio: 5, raspa: 6, bichos: 5, sapo: 5, perereca: 4, truco: 3, sinuca: 3, velha: 2 };
const SORTEIO_JOGO = Object.entries(PESO).flatMap(([j, p]) => Array(p).fill(j));

const agora = Date.now();
const H = 3600e3, D = 24 * H;
// mais movimento à noite
const horaPeso = [2, 1, 1, 1, 1, 1, 1, 2, 3, 3, 4, 4, 5, 5, 5, 5, 6, 6, 7, 8, 9, 10, 9, 6];
function quando(diasAtras) {
  for (;;) {
    const t = agora - rnd() * diasAtras * D;
    if (rnd() * 10 < horaPeso[new Date(t - 3 * H).getUTCHours()]) return t; // horário de Brasília
  }
}
const iso = (t) => new Date(t).toISOString();

async function api(path, body, token) {
  const r = await fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 409) throw new Error(`${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const db = new pg.Client({ connectionString: URL_DB.replace(/\?.*$/, '') });
await db.connect();
await db.query('SET search_path TO demo');
const q = (sql, params) => db.query(sql, params);

// zera tudo do schema demo (menos as migrações)
const { rows: tabelas } = await q(`select tablename from pg_tables where schemaname = 'demo' and tablename <> '_prisma_migrations'`);
await q(`truncate ${tabelas.map((t) => `"${t.tablename}"`).join(', ')} restart identity cascade`);

// contas de login: admin, jogadora da vitrine e influencer
const SENHA = 'Demo2026orama';
await api('/auth/cadastro', { nome: 'Admin Orama', cpf: cpf(), email: 'admin@oramagames.site', celular: '(85) 98438-2947', nascimento: '1990-01-01', senha: SENHA, aceitouTermos: true });
await api('/auth/cadastro', { nome: 'Mariana Costa', cpf: cpf(), email: 'mariana@exemplo.com', celular: '(11) 98765-4321', nascimento: '1996-04-12', senha: SENHA, aceitouTermos: true });
const { accessToken: admin } = await api('/auth/login', { login: 'admin@oramagames.site', senha: SENHA });
const inf = await api('/admin/influencers', { nome: 'Lari Vieira', email: 'lari@exemplo.com', cpf: cpf(), celular: '(21) 99876-1234', chavePix: 'lari@exemplo.com', senha: SENHA }, admin);
await q(`update "User" set xp = 7400 where email = 'mariana@exemplo.com'`);

// jogadores com saldo
const jogadores = NOMES.map((nome) => ({ nome, email: email(nome), cpf: cpf(), cel: `119${int(10000000, 99999999)}` }));
jogadores.push({ nome: 'Mariana Costa', email: 'mariana@exemplo.com', cpf: cpf(), cel: '11987654321' });
for (const j of jogadores) {
  await q(`insert into "Jogador" (email, nome, "saldoCentavos", "criadoEm", "atualizadoEm") values ($1,$2,$3,$4::timestamp,$5::timestamp)`,
    [j.email, j.nome, int(0, 180000), iso(agora - int(3, 40) * D), iso(agora - int(0, 30) * 60e3)]);
}

// rodadas: 14 dias, prêmio sorteado em volta do RTP do jogo
const rodadas = [];
for (let i = 0; i < 4200; i++) {
  const jogo = pick(SORTEIO_JOGO);
  const aposta = pick([100, 200, 200, 500, 500, 500, 1000, 1000, 2000, 5000]);
  const x = rnd();
  // média do multiplicador ≈ 0,97 → a casa fica com uns 7% do apostado, como num RTP de ~93%
  const mult = x < 0.55 ? 0 : x < 0.83 ? pick([0.5, 1, 1.2, 1.5]) : x < 0.97 ? pick([2, 2.5, 3]) : pick([5, 8, 10, 15]);
  rodadas.push([`demo-${i}`, jogo, aposta, Math.round(aposta * mult * JOGOS[jogo]), pick(jogadores).email, iso(quando(14))]);
}
for (let i = 0; i < rodadas.length; i += 500) {
  const lote = rodadas.slice(i, i + 500);
  await q(`insert into "Rodada" (chave, jogo, "apostaCentavos", "premioCentavos", jogador, "criadoEm") values ` +
    lote.map((_, k) => `($${k * 6 + 1},$${k * 6 + 2},$${k * 6 + 3},$${k * 6 + 4},$${k * 6 + 5},$${k * 6 + 6}::timestamp)`).join(','), lote.flat());
}

// depósitos PIX (vendas)
const depositos = [];
for (let i = 0; i < 260; i++) {
  const j = pick(jogadores), t = quando(14), valor = pick([2000, 2000, 3000, 5000, 5000, 5000, 10000, 10000, 20000, 50000]);
  const status = rnd() < 0.84 ? 'pago' : rnd() < 0.7 ? 'pendente' : 'falhou';
  depositos.push({ id: `plg-demo-${i}`, j, t, valor, status });
  await q(`insert into "Deposito" (id, "valorCentavos", "liquidoCentavos", status, "statusBruto", nome, documento, celular, email, "criadoEm", "pagoEm", "creditadoEm")
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamp,$11::timestamp,$11::timestamp)`,
    [`plg-demo-${i}`, valor, status === 'pago' ? Math.round(valor * 0.96) : null, status, { pago: 'paid', pendente: 'pending', falhou: 'failed' }[status],
      j.nome, j.cpf, j.cel, j.email, iso(t), status === 'pago' ? iso(t + int(20, 240) * 1e3) : null]);
}

// saques
for (let i = 0; i < 22; i++) {
  const j = pick(jogadores), t = i < 6 ? agora - int(5, 600) * 60e3 : quando(12);
  const status = i < 6 ? 'pendente' : i < 19 ? 'aprovado' : 'cancelado';
  await q(`insert into "Saque" (id, email, nome, cpf, "chavePix", "valorCentavos", status, motivo, "saldoInformado", "decididoPor", "decididoEm", "criadoEm")
    values ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10::timestamp,$11::timestamp)`,
    [`saque-demo-${i}`, j.email, j.nome, j.cpf, pick([2000, 5000, 8000, 15000, 30000, 60000]), status, status === 'cancelado' ? 'Chave PIX não confere com o CPF' : null,
      int(60000, 200000), status === 'pendente' ? null : 'admin@oramagames.site', status === 'pendente' ? null : iso(t + 30 * 60e3), iso(t)]);
}

// bônus
let nb = 0;
for (const j of jogadores.slice(0, 30)) await q(`insert into "Bonus" (chave, tipo, jogador, nome, "valorCentavos", "creditadoEm", "criadoEm") values ($1,'cadastro',$2,$3,1000,$4::timestamp,$4::timestamp)`, [`cadastro:${j.cpf}`, j.email, j.nome, iso(quando(14))]);
for (let i = 0; i < 70; i++) {
  const j = pick(jogadores), t = quando(10);
  await q(`insert into "Bonus" (chave, tipo, jogador, nome, "valorCentavos", "creditadoEm", "criadoEm") values ($1,'diario',$2,$3,500,$4::timestamp,$4::timestamp) on conflict do nothing`,
    [`diario:${j.email}:${iso(t).slice(0, 10)}`, j.email, j.nome, iso(t)]);
}
for (const [j, v, m] of [[jogadores[3], 5000, 'Aniversário'], [jogadores[8], 2000, 'Compensação: queda de conexão'], [jogadores[12], 10000, 'Top 1 do ranking semanal'], [jogadores[40], 3000, 'Boas-vindas VIP']]) {
  await q(`insert into "Bonus" (chave, tipo, jogador, nome, "valorCentavos", motivo, "criadoPor", "creditadoEm", "criadoEm") values ($1,'manual',$2,$3,$4,$5,'admin@oramagames.site',$6::timestamp,$6::timestamp)`,
    [`manual:demo-${nb++}`, j.email, j.nome, v, m, iso(quando(6))]);
}

// indique e ganhe
for (const j of jogadores.slice(0, 12)) await q(`insert into "Afiliado" (email, codigo, nome, cpf) values ($1,$2,$3,$4)`, [j.email, j.nome.split(' ')[0].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + int(10, 99), j.nome, j.cpf]);
for (let i = 0; i < 18; i++) {
  const quem = jogadores[i % 12], novo = jogadores[12 + i], t = quando(13), ok = i % 3 !== 0;
  const { rows: [a] } = await q(`select codigo from "Afiliado" where email = $1`, [quem.email]);
  await q(`insert into "Indicacao" (id, codigo, indicador, indicado, "indicadoCpf", "indicadoNome", status, "valorCentavos", "liberadaEm", "creditadoEm", "criadoEm")
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamp,$9::timestamp,$10::timestamp)`,
    [`ind-demo-${i}`, a.codigo, quem.email, novo.email, novo.cpf, novo.nome, ok ? 'liberada' : 'pendente', ok ? 500 : null, ok ? iso(t + 2 * H) : null, iso(t)]);
  if (ok) await q(`insert into "Bonus" (chave, tipo, jogador, nome, "valorCentavos", "creditadoEm", "criadoEm") values ($1,'indicacao',$2,$3,500,$4::timestamp,$4::timestamp)`, [`indicacao:ind-demo-${i}`, quem.email, quem.nome, iso(t + 2 * H)]);
}

// influencer: inscritos, comissões e saques
const infId = inf.id ?? (await q(`select id from "Influencer" limit 1`)).rows[0].id;
const inscritos = jogadores.slice(20, 38);
for (const j of inscritos) {
  const t = quando(13);
  await q(`insert into "InfluencerIndicado" (id, "influencerId", email, cpf, nome, "criadoEm") values ($1,$2,$3,$4,$5,$6::timestamp)`, [`ii-${j.cpf}`, infId, j.email, j.cpf, j.nome, iso(t)]);
  await q(`insert into "InfluencerComissao" (id, "influencerId", chave, tipo, indicado, "valorCentavos", "criadoEm") values ($1,$2,$3,'cadastro',$4,100,$5::timestamp)`, [`ic-c-${j.cpf}`, infId, `cadastro:${j.email}`, j.email, iso(t)]);
  const deps = depositos.filter((d) => d.j === j && d.status === 'pago').sort((a, b) => a.t - b.t);
  if (deps[0]) await q(`insert into "InfluencerComissao" (id, "influencerId", chave, tipo, indicado, "depositoId", "valorCentavos", "criadoEm") values ($1,$2,$3,'primeiro_deposito',$4,$5,500,$6::timestamp)`, [`ic-p-${j.cpf}`, infId, `primeiro:${j.email}`, j.email, deps[0].id, iso(deps[0].t)]);
  for (const d of deps) await q(`insert into "InfluencerComissao" (id, "influencerId", chave, tipo, indicado, "depositoId", "baseCentavos", "valorCentavos", "criadoEm") values ($1,$2,$3,'deposito',$4,$5,$6,$7,$8::timestamp)`, [`ic-d-${d.id}`, infId, `deposito:${d.id}`, j.email, d.id, d.valor, Math.round(d.valor / 100), iso(d.t)]);
}
await q(`insert into "InfluencerSaque" (id, "influencerId", "valorCentavos", "chavePix", status, "decididoPor", "decididoEm", "criadoEm") values
  ('is-1',$1,4000,'lari@exemplo.com','pago','admin@oramagames.site',$2::timestamp,$3::timestamp),
  ('is-2',$1,2500,'lari@exemplo.com','pendente',null,null,$4::timestamp)`, [infId, iso(agora - 5 * D), iso(agora - 5.2 * D), iso(agora - 3 * H)]);

// RTP: alguns jogos ajustados, histórico e RTP próprio de 2 jogadores
for (const [jogo, de, para, dias] of [['crash', null, 0.95, 9], ['capivara', null, 0.94, 7], ['macaco', 0.95, 0.93, 4], ['crash', 0.95, 0.96, 2], ['gatinho', null, 0.95, 1]]) {
  await q(`insert into "RtpAlteracao" (jogo, de, para, por, em) values ($1,$2,$3,'admin@oramagames.site',$4::timestamp)`, [jogo, de, para, iso(agora - dias * D)]);
  await q(`insert into "GameRtp" (jogo, rtp, "atualizadoPor", "atualizadoEm") values ($1,$2,'admin@oramagames.site',$3::timestamp) on conflict (jogo) do update set rtp = excluded.rtp`, [jogo, para, iso(agora - dias * D)]);
}
for (const [j, jogo, rtp] of [[jogadores[5], 'crash', 0.9], [jogadores[5], 'capivara', 0.9], [jogadores[17], 'macaco', 0.92]]) {
  await q(`insert into "JogadorRtp" (email, jogo, rtp, "atualizadoPor", "atualizadoEm") values ($1,$2,$3,'admin@oramagames.site',now())`, [j.email, jogo, rtp]);
  await q(`insert into "JogadorRtpAlteracao" (email, jogo, de, para, por) values ($1,$2,null,$3,'admin@oramagames.site')`, [j.email, jogo, rtp]);
}

// configurações com as automações ligadas
await q(`insert into "Configuracao" (id, "autoBalanco", "janelaHoras", "metaHoraAtiva", "metaHoraCentavos", "saqueExigeDeposito", "saqueMinimoCentavos", "bonusDiarioAtivo", "bonusDiarioCentavos", "indicacaoAtiva", "indicacaoCentavos", "atualizadoPor", "atualizadoEm")
  values (1, true, 24, true, 15000, true, 2000, true, 500, true, 500, 'admin@oramagames.site', now())
  on conflict (id) do update set "autoBalanco" = true, "janelaHoras" = 24, "metaHoraAtiva" = true, "metaHoraCentavos" = 15000, "saqueExigeDeposito" = true, "saqueMinimoCentavos" = 2000, "bonusDiarioAtivo" = true`);

await db.end();
console.log(`demo pronta: ${jogadores.length} jogadores, ${rodadas.length} rodadas, ${depositos.length} depósitos. Senha das contas: ${SENHA}`);
