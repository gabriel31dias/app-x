import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execSync } from 'node:child_process';
import pg from 'pg';
import request from 'supertest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { nivelDe } from '../src/profile/levels.js';

// banco de teste: schema "e2e" no Postgres de TEST_DATABASE_URL (.env), apagado e recriado a cada execução com as
// migrações reais. Só o schema e2e é apagado — nunca o public, onde ficam os dados de verdade.
try {
  process.loadEnvFile();
} catch {
  // sem .env: TEST_DATABASE_URL vem do ambiente
}
if (!process.env.TEST_DATABASE_URL) throw new Error('Configure TEST_DATABASE_URL (postgresql://...) pra rodar os testes');
const urlTeste = new URL(process.env.TEST_DATABASE_URL);
urlTeste.searchParams.set('schema', 'e2e');
process.env.DATABASE_URL = urlTeste.toString();
process.env.JWT_SECRET = 'segredo-de-teste';
{
  const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await c.connect();
  await c.query('DROP SCHEMA IF EXISTS e2e CASCADE');
  await c.end();
}
execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });

const { AppModule } = await import('../src/app.module.js');
const { setupApp } = await import('../src/setup.js');

const joao = {
  nome: 'João da Silva',
  cpf: '529.982.247-25',
  email: 'Joao@Teste.com',
  celular: '(11) 98765-4321',
  nascimento: '1995-05-10',
  senha: 'Capivara2026',
  aceitouTermos: true,
};

describe('Auth + Perfil (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  let adminAuth: Record<string, string> = {};

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(mod.createNestApplication());
    await app.init();
  });
  afterAll(() => app.close());

  it('níveis: 0→1, 1000→2, 3000→3 e progresso', () => {
    expect(nivelDe(0)).toMatchObject({ nivel: 1, vip: 'Bronze', progresso: 0 });
    expect(nivelDe(999).nivel).toBe(1);
    expect(nivelDe(1000)).toMatchObject({ nivel: 2, xpNivelAtual: 0, xpProximoNivel: 2000 });
    expect(nivelDe(4500)).toMatchObject({ nivel: 3, vip: 'Prata', progresso: 50 });
  });

  it('cadastro valida cada campo', async () => {
    const res = await api()
      .post('/auth/cadastro')
      .send({ nome: 'Joao', cpf: '111.111.111-11', email: 'x@', celular: '119', nascimento: '2015-01-01', senha: 'abc', aceitouTermos: false })
      .expect(400);
    expect(res.body.erros).toEqual({
      nome: 'Digite nome e sobrenome',
      cpf: 'CPF inválido',
      email: 'E-mail inválido',
      celular: 'Celular inválido',
      nascimento: 'Só maiores de 18 anos',
      senha: 'Mínimo 8 caracteres, com letras e números',
      aceitouTermos: 'Confirme que tem 18+ e aceita os termos',
    });
  });

  let token: string;

  it('cadastra, normaliza dados e não vaza senha', async () => {
    const res = await api().post('/auth/cadastro').send(joao).expect(201);
    token = res.body.accessToken;
    expect(res.body.user).toMatchObject({
      primeiroNome: 'João',
      email: 'joao@teste.com',
      cpf: '***.982.247-**',
      celular: '11987654321',
      avatarUrl: '/avatars/padrao.png',
      nivel: 1,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/senha|Hash|tokenVersion/);
  });

  it('bloqueia CPF/e-mail repetido', async () => {
    const res = await api().post('/auth/cadastro').send(joao).expect(409);
    expect(res.body.erros).toEqual({ cpf: 'CPF já cadastrado', email: 'E-mail já cadastrado' });
  });

  it('login por e-mail e por CPF; senha errada dá 401 genérico', async () => {
    await api().post('/auth/login').send({ login: 'JOAO@teste.com', senha: 'Capivara2026' }).expect(200);
    await api().post('/auth/login').send({ login: '52998224725', senha: 'Capivara2026' }).expect(200);
    const errada = await api().post('/auth/login').send({ login: 'joao@teste.com', senha: 'errada123' }).expect(401);
    const inexistente = await api().post('/auth/login').send({ login: 'ninguem@x.com', senha: 'errada123' }).expect(401);
    expect(errada.body.message).toBe(inexistente.body.message);
  });

  it('perfil exige token', async () => {
    await api().get('/perfil').expect(401);
    await api().get('/perfil').set('Authorization', 'Bearer lixo').expect(401);
    const res = await api().get('/perfil').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.nome).toBe('João da Silva');
  });

  it('edita nome/celular mas não aceita campo proibido', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const res = await api().patch('/perfil').set(auth).send({ nome: 'João Pedro Silva', celular: '11 91234-5678' }).expect(200);
    expect(res.body).toMatchObject({ primeiroNome: 'João', celular: '11912345678' });
    await api().patch('/perfil').set(auth).send({ xp: 999999 }).expect(400);
    await api().patch('/perfil').set(auth).send({ email: 'outro@x.com' }).expect(400);
  });

  it('troca de senha derruba o token antigo e devolve um novo', async () => {
    await api().patch('/perfil/senha').set('Authorization', `Bearer ${token}`).send({ senhaAtual: 'errada123', novaSenha: 'NovaSenha99' }).expect(400);
    const res = await api().patch('/perfil/senha').set('Authorization', `Bearer ${token}`).send({ senhaAtual: 'Capivara2026', novaSenha: 'NovaSenha99' }).expect(200);
    await api().get('/perfil').set('Authorization', `Bearer ${token}`).expect(401);
    token = res.body.accessToken;
    await api().get('/perfil').set('Authorization', `Bearer ${token}`).expect(200);
    await api().post('/auth/login').send({ login: joao.email, senha: 'NovaSenha99' }).expect(200);
  });

  it('logout invalida o token', async () => {
    await api().post('/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);
    await api().get('/perfil').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('excluir conta pede a senha', async () => {
    const { body } = await api().post('/auth/login').send({ login: joao.email, senha: 'NovaSenha99' }).expect(200);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    await api().delete('/perfil').set(auth).send({ senha: 'errada123' }).expect(400);
    await api().delete('/perfil').set(auth).send({ senha: 'NovaSenha99' }).expect(204);
    await api().post('/auth/login').send({ login: joao.email, senha: 'NovaSenha99' }).expect(401);
  });

  it('serve a foto de perfil padrão', async () => {
    await api().get('/avatars/padrao.png').expect(200).expect('Content-Type', /image\/png/);
  });

  it('RTP: só admin configura, com limite, histórico e script público', async () => {
    const { body } = await api().post('/auth/cadastro').send({ ...joao, cpf: '111.444.777-35', email: 'chefe@teste.com' }).expect(201);
    const auth = { Authorization: `Bearer ${body.accessToken}` };
    adminAuth = auth;
    process.env.ADMIN_EMAILS = '';
    await api().get('/admin/rtp').expect(401);
    await api().put('/admin/rtp/crash').set(auth).send({ rtp: 0.9 }).expect(403);

    process.env.ADMIN_EMAILS = 'outro@x.com, Chefe@Teste.com';
    await api().get('/rtp.js').expect('Content-Type', /javascript/).expect('window.RTP_JOGOS={};');
    await api().put('/admin/rtp/crash').set(auth).send({ rtp: 0.5 }).expect(400);
    await api().put('/admin/rtp/crash').set(auth).send({ rtp: 1.2 }).expect(400);
    await api().put('/admin/rtp/nada').set(auth).send({ rtp: 0.9 }).expect(404);
    await api().put('/admin/rtp/crash').set(auth).send({ rtp: 0.9 }).expect(200);
    await api().put('/admin/rtp/crash').set(auth).send({ rtp: 0.93 }).expect(200);

    await api().get('/rtp.js').expect('window.RTP_JOGOS={"crash":0.93};');
    expect((await api().get('/rtp').expect('Cache-Control', 'no-store').expect(200)).body).toEqual({ crash: 0.93 });
    const lista = await api().get('/admin/rtp').set(auth).expect(200);
    expect(lista.body.jogos.find((j: { jogo: string }) => j.jogo === 'crash')).toMatchObject({ rtp: 0.93, atualizadoPor: 'chefe@teste.com' });
    expect(lista.body.jogos.find((j: { jogo: string }) => j.jogo === 'bichos')).toMatchObject({ rtp: 0.96, atualizadoPor: null });
    const hist = await api().get('/admin/rtp/historico').set(auth).expect(200);
    expect(hist.body.map((h: { de: number | null; para: number }) => [h.de, h.para])).toEqual([[0.9, 0.93], [null, 0.9]]);
  });

  it('painel: rodadas informadas pelo jogo, vendas (depósitos) e dashboard com filtros', async () => {
    const rodada = (chave: string, jogo: string, aposta: number, premio: number) => api().post('/rodadas').send({ chave, jogo, aposta, premio, jogador: 'Ana@X.com' });
    await rodada('r1-abcdefgh', 'bichos', 10, 0).expect(204);
    await rodada('r1-abcdefgh', 'bichos', 10, 0).expect(204); // reenvio não duplica
    await rodada('r2-abcdefgh', 'bichos', 5, 12.5).expect(204);
    await rodada('r3-abcdefgh', 'crash', 2, 0).expect(204);
    await rodada('r4-abcdefgh', 'nada', 2, 0).expect(400);
    await api().post('/rodadas').send({ chave: 'r5-abcdefgh', jogo: 'crash', aposta: -1, premio: 0 }).expect(400);

    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = app.get(PrismaService);
    const dep = { documento: '52998224725', celular: '11987654321', statusBruto: 'x' };
    await prisma.deposito.createMany({
      data: [
        { ...dep, id: 'd1', nome: 'Ana Souza', valorCentavos: 5000, liquidoCentavos: 4800, status: 'pago' },
        { ...dep, id: 'd2', nome: 'Bruno Lima', documento: '11144477735', valorCentavos: 2000, status: 'pendente' },
        { ...dep, id: 'd3', nome: 'Ana Souza', valorCentavos: 3000, status: 'pago', criadoEm: new Date('2020-01-01T12:00:00Z') },
      ],
    });

    await api().get('/admin/dashboard').expect(401);
    const { body: d } = await api().get('/admin/dashboard').set(adminAuth).expect(200);
    expect(d.periodo.granularidade).toBe('hora');
    expect(d.serie).toHaveLength(24);
    expect(d.vendas).toMatchObject({ valor: 50, liquido: 48, quantidade: 1, ticketMedio: 50, clientes: 1, pendentes: { quantidade: 1, valor: 20 }, conversao: 0.5 });
    expect(d.jogos).toMatchObject({ apostado: 17, premios: 12.5, lucro: 4.5, rodadas: 3, jogadores: 1 });
    expect(d.porJogo.find((j: { jogo: string }) => j.jogo === 'bichos')).toMatchObject({ apostado: 15, premios: 12.5, lucro: 2.5, rodadas: 2 });
    expect(d.serie.reduce((a: number, b: { vendas: number }) => a + b.vendas, 0)).toBe(50);

    const soCrash = await api().get('/admin/dashboard?jogo=crash').set(adminAuth).expect(200);
    expect(soCrash.body.jogos).toMatchObject({ apostado: 2, lucro: 2 });
    expect(soCrash.body.porJogo).toHaveLength(1);

    const ano = await api().get('/admin/dashboard?de=2020-01-01&ate=2020-01-31').set(adminAuth).expect(200);
    expect(ano.body).toMatchObject({ periodo: { granularidade: 'dia' }, vendas: { valor: 30 } });
    expect(ano.body.serie).toHaveLength(31);
    await api().get('/admin/dashboard?de=2020-02-01&ate=2020-01-01').set(adminAuth).expect(400);
    await api().get('/admin/dashboard?de=ontem').set(adminAuth).expect(400);

    const v = await api().get('/admin/vendas?status=pago').set(adminAuth).expect(200);
    expect(v.body).toMatchObject({ total: 1, soma: 50 });
    expect((await api().get('/admin/vendas?q=bruno').set(adminAuth).expect(200)).body.itens.map((x: { id: string }) => x.id)).toEqual(['d2']);
    expect((await api().get('/admin/vendas?min=30').set(adminAuth).expect(200)).body.total).toBe(1);

    const r = await api().get('/admin/rodadas?resultado=ganhou').set(adminAuth).expect(200);
    expect(r.body).toMatchObject({ total: 1, soma: { apostado: 5, premios: 12.5, lucro: -7.5 } });
    expect(r.body.itens[0]).toMatchObject({ jogo: 'bichos', nome: 'Bichos da Sorte', jogador: 'ana@x.com' });
  });

  it('depósito PIX vira venda: grava ao criar e marca pago na consulta (Gatebox)', async () => {
    process.env.PIX_CLIENT_ID = 'x';
    process.env.PIX_CLIENT_SECRET = 'y';
    process.env.PIX_PROVEDOR = 'gatebox';
    const json = (o: unknown) => new Response(JSON.stringify(o));
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ access_token: 't', expires_in: 8000 }))
      .mockResolvedValueOnce(json({ data: { key: '000201-brcode', uuid: 'u1' } }));
    const { body: dep } = await api().post('/depositos').send({ amountCents: 2500, buyerName: 'Carla Dias', buyerDocument: '52998224725', buyerPhone: '11987654321' }).expect(201);
    expect(dep).toMatchObject({ status: 'pending', pixEmv: '000201-brcode', grossAmountCents: 2500 });
    let v = await api().get('/admin/vendas?q=carla').set(adminAuth).expect(200);
    expect(v.body.itens[0]).toMatchObject({ id: dep.id, valor: 25, status: 'pendente', pagoEm: null });

    // pago a menos que o cobrado não conta
    fetchMock.mockResolvedValueOnce(json({ data: { status: 'PAID', amount: '20' }, transaction: {} }));
    expect((await api().get(`/depositos/${dep.id}`).expect(200)).body.status).toBe('pending');

    fetchMock.mockResolvedValueOnce(json({ data: { status: 'PAID', amount: '25' }, transaction: { transactionId: 'tx1' } }));
    expect((await api().get(`/depositos/${dep.id}`).expect(200)).body.status).toBe('paid');
    v = await api().get('/admin/vendas?q=carla').set(adminAuth).expect(200);
    expect(v.body.itens[0]).toMatchObject({ status: 'pago', liquido: 25 });
    expect(v.body.itens[0].pagoEm).not.toBeNull();

    // já pago: não volta a perguntar à Gatebox
    const chamadas = fetchMock.mock.calls.length;
    expect((await api().get(`/depositos/${dep.id}`).expect(200)).body.status).toBe('paid');
    expect(fetchMock.mock.calls.length).toBe(chamadas);
    await api().get('/depositos/nao-existe').expect(404);
    fetchMock.mockRestore();
    delete process.env.PIX_PROVEDOR;
  });

  it('depósito PIX pela Pluggou (padrão): cria, consulta e só credita o valor cheio', async () => {
    process.env.PLUGGOU_PUBLIC_KEY = 'pk';
    process.env.PLUGGOU_SECRET_KEY = 'sk';
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    const uuid = '3f9c1a2e-1111-4222-8333-444455556666';
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ success: true, data: { id: uuid, amount: 2000, platform_tax: 80, liquid_amount: 1920, pix: { emv: '000201-pluggou' } } }, 201));
    const { body: dep } = await api().post('/depositos').send({ amountCents: 2000, buyerName: 'Rita Luz', buyerDocument: '52998224725', buyerPhone: '11987654321' }).expect(201);
    expect(dep).toMatchObject({ id: `plg-${uuid}`, status: 'pending', pixEmv: '000201-pluggou', source: 'pluggou' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.pluggoutech.com/api/transactions');
    expect((init.headers as Record<string, string>)['X-Secret-Key']).toBe('sk');
    expect(JSON.parse(init.body as string)).toMatchObject({ payment_method: 'pix', amount: 2000, buyer: { buyer_document: '52998224725' } });

    fetchMock.mockResolvedValueOnce(json({ success: true, data: { id: uuid, amount: 2000, status: 'pending' } }));
    expect((await api().get(`/depositos/${dep.id}`).expect(200)).body.status).toBe('pending');
    expect(fetchMock.mock.calls[1][0]).toBe(`https://api.pluggoutech.com/api/transactions/${uuid}`);

    fetchMock.mockResolvedValueOnce(json({ success: true, data: { id: uuid, amount: 2000, liquid_amount: 1920, status: 'paid' } }));
    expect((await api().get(`/depositos/${dep.id}`).expect(200)).body.status).toBe('paid');
    const v = await api().get('/admin/vendas?q=rita').set(adminAuth).expect(200);
    expect(v.body.itens[0]).toMatchObject({ status: 'pago', liquido: 19.2 });

    // abaixo de R$ 20,00 nem chega na Pluggou
    const antes = fetchMock.mock.calls.length;
    await api().post('/depositos').send({ amountCents: 1999, buyerName: 'Rita Luz', buyerDocument: '52998224725', buyerPhone: '11987654321' }).expect(400);
    expect(fetchMock.mock.calls.length).toBe(antes);

    // erro de regra da Pluggou chega com a mensagem dela
    fetchMock.mockResolvedValueOnce(json({ success: false, message: 'Valor máximo excedido', data: null }, 400));
    const { body: erro } = await api().post('/depositos').send({ amountCents: 400000, buyerName: 'Rita Luz', buyerDocument: '52998224725', buyerPhone: '11987654321' }).expect(502);
    expect(erro.message).toBe('Valor máximo excedido');
    fetchMock.mockRestore();
  });

  it('webhook da Pluggou marca pago e o saldo entra uma vez só, mesmo depois de reiniciar o site', async () => {
    process.env.PLUGGOU_PUBLIC_KEY = 'pk';
    process.env.PLUGGOU_SECRET_KEY = 'sk';
    process.env.PLUGGOU_WEBHOOK_CODE = 'whk_ok';
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    const uuid = '7b1d0c9e-2222-4333-8444-555566667777';
    const conta = { email: 'Tina@X.com', cpf: '529.982.247-25' };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ success: true, data: { id: uuid, amount: 3000, liquid_amount: 2880, pix: { emv: '000201' } } }, 201));
    const { body: dep } = await api().post('/depositos')
      .send({ amountCents: 3000, buyerName: 'Tina Sol', buyerDocument: '52998224725', buyerPhone: '11987654321', buyerEmail: 'tina@x.com' }).expect(201);

    // nada pago ainda: a conta confere o pendente na Pluggou e não tem o que creditar
    fetchMock.mockResolvedValueOnce(json({ success: true, data: { id: uuid, amount: 3000, status: 'pending' } }));
    expect((await api().get('/depositos/conta').query(conta).expect(200)).body).toEqual([]);

    // webhook sem o código da conta é recusado e não consulta nada
    const antes = fetchMock.mock.calls.length;
    await api().post('/depositos/webhook/pluggou').set('x-webhook-code', 'falso').send({ data: { id: uuid, status: 'paid' } }).expect(401);
    expect(fetchMock.mock.calls.length).toBe(antes);

    // webhook verdadeiro: a API confirma na Pluggou (não confia no corpo) e marca pago
    fetchMock.mockResolvedValueOnce(json({ success: true, data: { id: uuid, amount: 3000, liquid_amount: 2880, status: 'paid' } }));
    await api().post('/depositos/webhook/pluggou').set('x-webhook-code', 'whk_ok').send({ id: 'ev1', event_type: 'transaction', data: { id: uuid, status: 'paid' } }).expect(200);
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = app.get(PrismaService);
    await vi.waitFor(async () => expect((await prisma.deposito.findUnique({ where: { id: dep.id } }))?.status).toBe('pago'));

    // jogador reinicia o site: a conta lista o pago e o crédito sai uma vez só
    const { body: pagos } = await api().get('/depositos/conta').query(conta).expect(200);
    expect(pagos).toEqual([{ id: dep.id, valor: 30 }]);
    await api().post(`/depositos/${dep.id}/credito`).send({ email: 'outra@x.com', cpf: conta.cpf }).expect(200, { creditar: false, valor: 0 });
    await api().post(`/depositos/${dep.id}/credito`).send(conta).expect(200, { creditar: true, valor: 30 });
    await api().post(`/depositos/${dep.id}/credito`).send(conta).expect(200, { creditar: false, valor: 0 });
    expect((await api().get('/depositos/conta').query(conta).expect(200)).body).toEqual([]);
    fetchMock.mockRestore();
    delete process.env.PLUGGOU_WEBHOOK_CODE;
  });

  it('indicação: link, cadastro pelo link, libera com depósito + rodada, credita uma vez e aparece no admin', async () => {
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = app.get(PrismaService);
    const ana = { email: 'Ana.Ind@x.com', cpf: '111.444.777-35', nome: 'Ana Indica' };
    const caio = { email: 'caio.novo@x.com', cpf: '123.456.789-09', nome: 'Caio Novo Silva' };

    const { body: meu } = await api().get('/indicacoes/minhas').query(ana).expect(200);
    expect(meu).toMatchObject({ ativo: true, valor: 5, minRodadas: 1, ganho: 0, indicados: [], paraCreditar: [] });
    expect(meu.codigo).toMatch(/^[A-Z2-9]{7}$/);
    expect((await api().get('/indicacoes/minhas').query(ana).expect(200)).body.codigo).toBe(meu.codigo); // mesmo código sempre

    await api().post('/indicacoes').send({ ...ana, codigo: meu.codigo }).expect(400); // o próprio link
    await api().post('/indicacoes').send({ ...caio, codigo: 'NAOEXISTE' }).expect(400);
    await api().post('/indicacoes').send({ ...caio, codigo: meu.codigo.toLowerCase() }).expect(200);
    await api().post('/indicacoes').send({ ...caio, codigo: meu.codigo }).expect(409); // já indicada

    // cadastrou mas não depositou nem jogou: pendente
    let m = (await api().get('/indicacoes/minhas').query(ana).expect(200)).body;
    expect(m.indicados).toEqual([expect.objectContaining({ nome: 'Caio', depositou: false, rodadas: 0, status: 'pendente', valor: null })]);

    // depositou, mas ainda não jogou: segue pendente
    await prisma.deposito.create({ data: { id: 'plg-caio-1', valorCentavos: 2000, status: 'pago', statusBruto: 'paid', nome: 'Caio', documento: '12345678909', celular: '11987654321', email: 'caio.novo@x.com' } });
    expect((await api().get('/indicacoes/minhas').query(ana).expect(200)).body.paraCreditar).toEqual([]);

    // o admin muda o valor antes de liberar: vale o valor de quando libera
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, indicacao: 7.5 }).expect(200);
    await api().post('/rodadas').send({ chave: 'caio-r1-abcdefgh', jogo: 'bichos', aposta: 2, premio: 0, jogador: 'caio.novo@x.com' }).expect(204);
    m = (await api().get('/indicacoes/minhas').query(ana).expect(200)).body;
    expect(m.paraCreditar).toEqual([{ id: expect.any(String), valor: 7.5 }]);
    const id = m.paraCreditar[0].id;

    await api().post(`/indicacoes/${id}/credito`).send({ ...caio }).expect(200, { creditar: false, valor: 0 }); // não é dele
    await api().post(`/indicacoes/${id}/credito`).send(ana).expect(200, { creditar: true, valor: 7.5 });
    await api().post(`/indicacoes/${id}/credito`).send(ana).expect(200, { creditar: false, valor: 0 });
    m = (await api().get('/indicacoes/minhas').query(ana).expect(200)).body;
    expect(m).toMatchObject({ ganho: 7.5, paraCreditar: [], indicados: [expect.objectContaining({ status: 'recebida', valor: 7.5 })] });

    // admin: lista, resumo e o bônus entra como tipo indicação
    await api().get('/admin/indicacoes').expect(401);
    const { body: adm } = await api().get('/admin/indicacoes').set(adminAuth).expect(200);
    expect(adm.soma).toEqual({ pendentes: 0, liberadas: 0, pagas: 1, valorPago: 7.5 });
    expect(adm.itens[0]).toMatchObject({ indicador: 'ana.ind@x.com', indicadorNome: 'Ana Indica', indicado: 'caio.novo@x.com', depositado: 20, rodadas: 1, status: 'recebida', valor: 7.5 });
    expect((await api().get('/admin/indicacoes?status=pendente').set(adminAuth).expect(200)).body.total).toBe(0);
    expect((await api().get('/admin/indicacoes?q=caio').set(adminAuth).expect(200)).body.total).toBe(1);
    const { body: b } = await api().get('/admin/bonus?tipo=indicacao').set(adminAuth).expect(200);
    expect(b.soma.indicacao).toEqual({ quantidade: 1, valor: 7.5 });

    // desligado: o site esconde e nada novo libera
    const { body: cfg } = await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, indicacaoAtiva: false }).expect(200);
    expect(cfg).toMatchObject({ indicacaoAtiva: false, indicacao: 7.5, indicacaoMinRodadas: 1 });
    expect((await api().get('/indicacoes/minhas').query(ana).expect(200)).body.ativo).toBe(false);
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, indicacaoAtiva: true, indicacao: 5 }).expect(200);
    // não deixa rastro pros testes de bônus/dashboard/saque que vêm depois
    await prisma.bonus.deleteMany({ where: { tipo: 'indicacao' } });
    await prisma.rodada.deleteMany({ where: { jogador: 'caio.novo@x.com' } });
    await prisma.deposito.deleteMany({ where: { id: 'plg-caio-1' } });
  });

  it('influencer: admin cria, link gera comissões (inscrição, 1º depósito e %), dashboard e saque aprovado pelo admin', async () => {
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = app.get(PrismaService);
    const dados = { nome: 'Lia Influencer', email: 'Lia@Insta.com', cpf: '246.813.579-28', celular: '(11) 98888-7777', chavePix: 'lia@insta.com', senha: 'Parceira2026' };

    await api().post('/admin/influencers').send(dados).expect(401);
    await api().post('/admin/influencers').set(adminAuth).send({ ...dados, senha: 'fraca' }).expect(400);
    const { body: criado } = await api().post('/admin/influencers').set(adminAuth).send(dados).expect(201);
    expect(criado.codigo).toMatch(/^[A-Z2-9]{6}$/);
    await api().post('/admin/influencers').set(adminAuth).send(dados).expect(409); // e-mail/CPF já têm conta

    // login no mesmo /auth/login; admin não é influencer e influencer não é admin
    const { body: login } = await api().post('/auth/login').send({ login: 'lia@insta.com', senha: 'Parceira2026' }).expect(200);
    const infAuth = { Authorization: `Bearer ${login.accessToken}` };
    await api().get('/influencer/me').set(adminAuth).expect(403);
    await api().get('/admin/influencers').set(infAuth).expect(403);

    // inscrições pelo link: R$ 1 cada (padrão)
    const rui = { email: 'rui.fa@x.com', cpf: '135.792.468-28', nome: 'Rui Fãzão Costa' };
    const eva = { email: 'eva.fa@x.com', cpf: '864.209.753-10', nome: 'Eva Fã' };
    await api().post('/influencers/indicado').send({ ...rui, codigo: 'NAOEXISTE' }).expect(400);
    await api().post('/influencers/indicado').send({ ...dados, codigo: criado.codigo }).expect(400); // o próprio link
    await api().post('/influencers/indicado').send({ ...rui, codigo: criado.codigo.toLowerCase() }).expect(200);
    await api().post('/influencers/indicado').send({ ...eva, codigo: criado.codigo }).expect(200);
    await api().post('/influencers/indicado').send({ ...rui, codigo: criado.codigo }).expect(409);

    // Rui deposita R$ 200 e depois R$ 50: R$ 5 pelo 1º depósito + 1% de cada (R$ 2 + R$ 0,50)
    const dep = (id: string, cents: number) => prisma.deposito.create({ data: { id, valorCentavos: cents, status: 'pago', statusBruto: 'paid', nome: 'Rui', documento: '13579246828', celular: '11987654321', email: 'rui.fa@x.com' } });
    await dep('plg-rui-1', 20000);
    await dep('plg-rui-2', 5000);
    let { body: me } = await api().get('/influencer/me').set(infAuth).expect(200);
    expect(me).toMatchObject({
      nome: 'Lia Influencer', codigo: criado.codigo, inscritos: 2, depositaram: 1, totalDepositado: 250,
      comissaoCadastro: 2, comissaoPrimeiroDeposito: 5, comissaoDepositos: 2.5, ganho: 9.5, disponivel: 9.5,
      regras: { cadastro: 1, primeiroDeposito: 5, percentual: 1, saqueMinimo: 10 },
    });
    expect(me.comissoes.map((c: { inscrito: string }) => c.inscrito)).toContain('Rui C.'); // nome mascarado
    // conciliar de novo não duplica
    expect((await api().get('/influencer/me').set(infAuth).expect(200)).body.ganho).toBe(9.5);

    const { body: insc } = await api().get('/influencer/inscritos').set(infAuth).expect(200);
    expect(insc.total).toBe(2);
    expect(insc.itens.find((i: { nome: string }) => i.nome === 'Rui C.')).toMatchObject({ depositou: true, depositado: 250, comissao: 8.5 });

    // saque: mínimo R$ 10 e não passa do disponível
    await api().post('/influencer/saques').set(infAuth).send({ valor: 9.5 }).expect(400);
    await dep('plg-rui-3', 100000); // +1% = R$ 10
    const { body: saque } = await api().post('/influencer/saques').set(infAuth).send({ valor: 15 }).expect(201);
    await api().post('/influencer/saques').set(infAuth).send({ valor: 10 }).expect(400); // sobrou R$ 4,50
    me = (await api().get('/influencer/me').set(infAuth).expect(200)).body;
    expect(me).toMatchObject({ ganho: 19.5, saquePendente: 15, disponivel: 4.5 });

    // admin: lista influencers com números, lista saques, aprova uma vez só
    const { body: lista } = await api().get('/admin/influencers?q=lia').set(adminAuth).expect(200);
    expect(lista[0]).toMatchObject({ nome: 'Lia Influencer', inscritos: 2, ganho: 19.5, saquePendente: 15, ativo: true });
    const { body: sq } = await api().get('/admin/influencers/saques?status=pendente').set(adminAuth).expect(200);
    expect(sq).toMatchObject({ total: 1, soma: { pendentes: 1, valorPendente: 15 } });
    expect(sq.itens[0]).toMatchObject({ id: saque.id, influencer: 'Lia Influencer', chavePix: 'lia@insta.com', valor: 15 });
    await api().put(`/admin/influencers/saques/${saque.id}/aprovar`).set(infAuth).expect(403);
    await api().put(`/admin/influencers/saques/${saque.id}/aprovar`).set(adminAuth).expect(200);
    await api().put(`/admin/influencers/saques/${saque.id}/cancelar`).set(adminAuth).send({ motivo: 'x' }).expect(409);
    expect((await api().get('/influencer/me').set(infAuth).expect(200)).body).toMatchObject({ sacado: 15, saquePendente: 0, disponivel: 4.5 });

    // config muda só o que vem depois; desativar derruba a sessão e o link
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, infCadastro: 2, infPercentual: 2.5 }).expect(200);
    await api().patch(`/admin/influencers/${criado.id}`).set(adminAuth).send({ ativo: false }).expect(200);
    await api().get('/influencer/me').set(infAuth).expect(401);
    await api().post('/influencers/indicado').send({ email: 'novo@x.com', cpf: '975.318.642-82', codigo: criado.codigo }).expect(400);
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, infCadastro: 1, infPercentual: 1 }).expect(200);
    await prisma.deposito.deleteMany({ where: { id: { startsWith: 'plg-rui-' } } });
  });

  it('bônus dado pelo admin: fica pendente, o site da conta credita uma vez só', async () => {
    await api().post('/saldos').send({ email: 'Tami@x.com', nome: 'Tami Lima', saldo: 0.42 }).expect(204);
    const tami = { email: 'tami@x.com', cpf: '975.318.642-82' };
    await api().post('/admin/bonus').send({ email: 'tami@x.com', valor: 20 }).expect(401);
    await api().post('/admin/bonus').set(adminAuth).send({ email: 'ninguem@x.com', valor: 20 }).expect(404);
    const { body: b } = await api().post('/admin/bonus').set(adminAuth).send({ email: 'TAMI@x.com', valor: 20, motivo: 'Cortesia' }).expect(201);
    expect(b).toMatchObject({ jogador: 'tami@x.com', nome: 'Tami Lima', valor: 20 });

    const { body: pend } = await api().get('/bonus/pendentes').query(tami).expect(200);
    expect(pend).toEqual([{ id: b.id, valor: 20, motivo: 'Cortesia' }]);
    await api().post(`/bonus/${b.id}/credito`).send({ email: 'outra@x.com', cpf: tami.cpf }).expect(200, { creditar: false, valor: 0 });
    await api().post(`/bonus/${b.id}/credito`).send(tami).expect(200, { creditar: true, valor: 20, motivo: 'Cortesia' });
    await api().post(`/bonus/${b.id}/credito`).send(tami).expect(200, { creditar: false, valor: 0 });
    expect((await api().get('/bonus/pendentes').query(tami).expect(200)).body).toEqual([]);

    const { body: l } = await api().get('/admin/bonus?tipo=manual').set(adminAuth).expect(200);
    expect(l.itens[0]).toMatchObject({ tipo: 'manual', jogador: 'tami@x.com', valor: 20, motivo: 'Cortesia' });
    expect(l.itens[0].creditadoEm).not.toBeNull();
    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    // não mexe nas somas dos testes de bônus/dashboard/saldos
    await app.get(PrismaService).bonus.deleteMany({ where: { tipo: 'manual' } });
    await app.get(PrismaService).jogador.deleteMany({ where: { email: 'tami@x.com' } });
  });

  it('saldos: o site informa, o admin lista com soma, busca e ordem', async () => {
    await api().post('/saldos').send({ email: 'Zeca@X.com', nome: 'Zeca Paz', saldo: 50 }).expect(204);
    await api().post('/saldos').send({ email: 'zeca@x.com', nome: 'Zeca Paz', saldo: 72.35 }).expect(204); // mesma conta: atualiza
    await api().post('/saldos').send({ email: 'lia@x.com', nome: 'Lia Mar', saldo: 10 }).expect(204);
    await api().post('/saldos').send({ email: 'x', nome: 'X', saldo: 1 }).expect(400);
    await api().post('/saldos').send({ email: 'y@x.com', nome: 'Y', saldo: -1 }).expect(400);

    await api().get('/admin/jogadores').expect(401);
    const { body } = await api().get('/admin/jogadores').set(adminAuth).expect(200);
    expect(body).toMatchObject({ total: 2, soma: 82.35 });
    expect(body.itens.map((j: { email: string; saldo: number }) => [j.email, j.saldo])).toEqual([['zeca@x.com', 72.35], ['lia@x.com', 10]]);
    expect((await api().get('/admin/jogadores?q=lia').set(adminAuth).expect(200)).body.itens).toHaveLength(1);
    expect((await api().get('/admin/jogadores?ordem=nome').set(adminAuth).expect(200)).body.itens[0].nome).toBe('Lia Mar');
  });

  it('ao vivo: jogo só grava enquanto um admin assiste, eventos chegam só pra quem vê', async () => {
    await app.listen(0);
    const url = `http://127.0.0.1:${app.getHttpServer().address().port}/ao-vivo`;
    const conectar = (auth: object) => ioClient(url, { auth, transports: ['websocket'], forceNew: true });
    const proximo = <T,>(s: ClientSocket, ev: string, filtro: (x: T) => boolean = () => true) =>
      new Promise<T>((ok) => { const f = (x: T) => { if (filtro(x)) { s.off(ev, f); ok(x); } }; s.on(ev, f); });

    const intruso = conectar({ papel: 'admin', token: 'falso' });
    await proximo(intruso, 'disconnect');

    const admin = conectar({ papel: 'admin', token: adminAuth.Authorization.slice(7) });
    await proximo(admin, 'sessoes');
    const jogador = conectar({ jogo: 'perereca', jogador: 'Rita@X.com', jogadorNome: 'Rita' });
    const lista = await proximo<{ id: string; jogador: string; jogo: string }[]>(admin, 'sessoes', (l) => l.length === 1);
    expect(lista[0]).toMatchObject({ jogo: 'perereca', jogador: 'rita@x.com', assistindo: 0 });

    const gravar = proximo<boolean>(jogador, 'gravar');
    expect(await admin.emitWithAck('assistir', lista[0].id)).toEqual({ ok: true });
    expect(await gravar).toBe(true);

    const chegou = proximo<{ eventos: unknown[] }>(admin, 'ev');
    jogador.emit('ev', [{ type: 2, data: {} }]);
    expect((await chegou).eventos).toHaveLength(1);

    const parou = proximo<boolean>(jogador, 'gravar');
    admin.disconnect();
    expect(await parou).toBe(false);

    const admin2 = conectar({ papel: 'admin', token: adminAuth.Authorization.slice(7) });
    await proximo(admin2, 'sessoes');
    const fim = proximo<{ id: string }[]>(admin2, 'sessoes', (l) => l.length === 0);
    jogador.disconnect();
    expect(await fim).toEqual([]);
    admin2.disconnect();
    intruso.close();
  });

  it('auto-balanço: casa negativa põe todos no mínimo, positiva devolve os RTPs de antes', async () => {
    const rodada = (chave: string, aposta: number, premio: number) => api().post('/rodadas').send({ chave, jogo: 'bichos', aposta, premio }).expect(204);
    const { body: c0 } = await api().get('/admin/config').set(adminAuth).expect(200);
    expect(c0).toMatchObject({ autoBalanco: false, balancoAtivo: false, janelaHoras: 24 });
    const lucro0 = c0.lucroJanela;
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: true, janelaHoras: 5 }).expect(400);
    expect((await api().put('/admin/config').set(adminAuth).send({ autoBalanco: true, janelaHoras: 24 }).expect(200)).body).toMatchObject({ autoBalanco: true, balancoAtivo: lucro0 < 0 });

    await rodada('ab-perda-0001', 1, lucro0 + 50); // casa fica 49 negativa
    const { body: c1 } = await api().get('/admin/config').set(adminAuth).expect(200);
    expect(c1).toMatchObject({ balancoAtivo: true, lucroJanela: -49 });
    const vivo = (await api().get('/rtp').expect(200)).body;
    expect(Object.values(vivo).every((r) => r === 0.85)).toBe(true);
    expect(Object.keys(vivo)).toHaveLength(Object.keys((await import('../src/rtp/rtp.controller.js')).JOGOS).length);
    await api().put('/admin/rtp/crash').set(adminAuth).send({ rtp: 0.95 }).expect(409);

    await rodada('ab-lucro-0001', 100, 0); // volta a positivo
    expect((await api().get('/admin/config').set(adminAuth).expect(200)).body).toMatchObject({ balancoAtivo: false, lucroJanela: 51 });
    expect((await api().get('/rtp').expect(200)).body).toEqual({ crash: 0.93 }); // crash volta pro 0,93; o resto pro de fábrica

    const hist = (await api().get('/admin/rtp/historico').set(adminAuth).expect(200)).body;
    expect(hist.filter((h: { por: string }) => h.por === 'auto-balanço').length).toBeGreaterThanOrEqual(2 * 11);

    // desligar com o balanço ativo restaura na hora
    await rodada('ab-perda-0002', 1, 100);
    expect((await api().get('/admin/config').set(adminAuth).expect(200)).body.balancoAtivo).toBe(true);
    expect((await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24 }).expect(200)).body.balancoAtivo).toBe(false);
    expect((await api().get('/rtp').expect(200)).body).toEqual({ crash: 0.93 });
  });

  it('meta de lucro por hora: abaixo da meta baixa o RTP, bateu a meta volta', async () => {
    const { body: c0 } = await api().get('/admin/config').set(adminAuth).expect(200);
    const h0 = c0.lucroHora, meta = Math.max(h0, 0) + 10; // testes anteriores podem deixar a hora negativa
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, metaHoraAtiva: true, metaHora: -1 }).expect(400);
    const { body: c1 } = await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, metaHoraAtiva: true, metaHora: meta }).expect(200);
    expect(c1).toMatchObject({ metaHoraAtiva: true, metaHora: meta, balancoAtivo: true, motivoBalanco: 'hora' });
    expect(Object.values((await api().get('/rtp').expect(200)).body).every((r) => r === 0.85)).toBe(true);

    await api().post('/rodadas').send({ chave: 'meta-hora-0001', jogo: 'crash', aposta: meta - h0, premio: 0 }).expect(204);
    const { body: c2 } = await api().get('/admin/config').set(adminAuth).expect(200);
    expect(c2).toMatchObject({ balancoAtivo: false, motivoBalanco: null, lucroHora: meta });
    expect((await api().get('/rtp').expect(200)).body).toEqual({ crash: 0.93 });

    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, metaHoraAtiva: false }).expect(200);
  });

  it('saques: pedido pendente, admin aprova ou cancela, estorno só uma vez', async () => {
    const conta = { email: 'Bia@X.com', cpf: '390.533.447-05' };
    await api().post('/saques').send({ ...conta, nome: 'Bia', valor: 5 }).expect(400); // abaixo do mínimo
    await api().post('/saques').send({ ...conta, cpf: '111.111.111-11', nome: 'Bia', valor: 20 }).expect(400);
    const { body: s1 } = await api().post('/saques').send({ ...conta, nome: 'Bia Luz', valor: 30, saldo: 80 }).expect(201);
    const { body: s2 } = await api().post('/saques').send({ ...conta, nome: 'Bia Luz', valor: 20, saldo: 50 }).expect(201);
    expect(s1).toMatchObject({ valor: 30, status: 'pendente' });

    expect((await api().get('/saques').query({ email: 'bia@x.com', cpf: '00000000000' }).expect(200)).body).toEqual([]);
    expect((await api().get('/saques').query(conta).expect(200)).body.map((x: { id: string }) => x.id)).toEqual([s2.id, s1.id]);

    await api().get('/admin/saques').expect(401);
    const { body: l } = await api().get('/admin/saques?status=pendente').set(adminAuth).expect(200);
    expect(l).toMatchObject({ total: 2, soma: 50, pendentes: { quantidade: 2, valor: 50 } });
    expect(l.itens[0]).toMatchObject({ chavePix: '39053344705', conferencia: { depositado: 0, jaSacado: 0, saldoNoPedido: 50 } });

    await api().put(`/admin/saques/${s1.id}/aprovar`).set(adminAuth).expect(200);
    await api().put(`/admin/saques/${s1.id}/aprovar`).set(adminAuth).expect(409);
    await api().put(`/admin/saques/${s1.id}/cancelar`).set(adminAuth).send({ motivo: 'tarde demais' }).expect(409);
    await api().put('/admin/saques/nao-existe/aprovar').set(adminAuth).expect(404);
    await api().put(`/admin/saques/${s2.id}/cancelar`).set(adminAuth).send({ motivo: '' }).expect(400);
    await api().put(`/admin/saques/${s2.id}/cancelar`).set(adminAuth).send({ motivo: 'CPF divergente' }).expect(200);

    const meus = (await api().get('/saques').query(conta).expect(200)).body;
    expect(meus).toMatchObject([{ status: 'cancelado', motivo: 'CPF divergente', estornado: false }, { status: 'aprovado' }]);
    expect((await api().post(`/saques/${s2.id}/estorno`).send(conta).expect(200)).body).toEqual({ devolver: true });
    expect((await api().post(`/saques/${s2.id}/estorno`).send(conta).expect(200)).body).toEqual({ devolver: false }); // outro aparelho não devolve de novo
    expect((await api().post(`/saques/${s1.id}/estorno`).send(conta).expect(200)).body).toEqual({ devolver: false }); // aprovado não estorna
    expect((await api().get('/admin/saques?status=aprovado').set(adminAuth).expect(200)).body.itens[0].conferencia.jaSacado).toBe(30);
  });

  it('config: saque só pra quem já depositou', async () => {
    const conta = { email: 'duda@x.com', cpf: '935.411.347-80', nome: 'Duda Reis' };
    const { body: c } = await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, saqueExigeDeposito: true }).expect(200);
    expect(c.saqueExigeDeposito).toBe(true);
    const { body: erro } = await api().post('/saques').send({ ...conta, valor: 20 }).expect(400);
    expect(erro.message).toBe('Para sacar, faça pelo menos um depósito na sua conta.');

    const { PrismaService } = await import('../src/prisma/prisma.service.js');
    const prisma = app.get(PrismaService);
    await prisma.deposito.create({ data: { id: 'dep-duda-pendente', valorCentavos: 5000, status: 'pendente', statusBruto: 'pending', nome: 'Duda', documento: '93541134780', celular: '11987654321' } });
    await api().post('/saques').send({ ...conta, valor: 20 }).expect(400); // depósito que não foi pago não conta
    await prisma.deposito.update({ where: { id: 'dep-duda-pendente' }, data: { status: 'pago' } });
    await api().post('/saques').send({ ...conta, valor: 20 }).expect(201);

    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, saqueExigeDeposito: false }).expect(200);
    await api().post('/saques').send({ email: 'eli@x.com', cpf: '529.982.247-25', nome: 'Eli', valor: 10 }).expect(201); // desligado: libera
  });

  it('config: valor mínimo de saque configurável', async () => {
    expect((await api().get('/saques/regras').expect(200)).body).toMatchObject({ minimo: 10, exigeDeposito: false });
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, saqueMinimo: 0.5 }).expect(400);
    const { body: c } = await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, saqueMinimo: 25 }).expect(200);
    expect(c.saqueMinimo).toBe(25);
    expect((await api().get('/saques/regras').expect(200)).body.minimo).toBe(25);
    const conta = { email: 'gil@x.com', cpf: '529.982.247-25', nome: 'Gil' };
    const { body: e } = await api().post('/saques').send({ ...conta, valor: 20 }).expect(400);
    expect(e.erros.valor).toBe('Saque mínimo de R$\u00a025,00');
    await api().post('/saques').send({ ...conta, valor: 25 }).expect(201);
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, saqueMinimo: 10 }).expect(200);
  });

  it('bônus de cadastro: um por CPF e por e-mail, aparece na tela Bônus e sai do lucro do dashboard', async () => {
    const conta = { email: 'Bia@X.com', cpf: '390.533.447-05', nome: 'Bia Lima' };
    await api().post('/bonus-cadastro').send({ ...conta, cpf: '111.111.111-11' }).expect(400);
    expect((await api().post('/bonus-cadastro').send(conta).expect(200)).body).toEqual({ valor: 5 });
    await api().post('/bonus-cadastro').send(conta).expect(409); // mesma conta de novo
    await api().post('/bonus-cadastro').send({ ...conta, email: 'outra@x.com' }).expect(409); // mesmo CPF, outro e-mail
    await api().post('/bonus-cadastro').send({ ...conta, cpf: '529.982.247-25' }).expect(409); // mesmo e-mail, outro CPF

    await api().get('/admin/bonus').expect(401);
    const { body: l } = await api().get('/admin/bonus?tipo=cadastro').set(adminAuth).expect(200);
    expect(l.itens[0]).toMatchObject({ tipo: 'cadastro', jogador: 'bia@x.com', nome: 'Bia Lima', valor: 5 });
    expect(l.soma.cadastro).toEqual({ quantidade: 1, valor: 5 });
    expect((await api().get('/admin/bonus?q=bia').set(adminAuth).expect(200)).body.total).toBe(1);
    expect((await api().get('/admin/bonus?tipo=diario').set(adminAuth).expect(200)).body.total).toBe(0);

    const { body: d } = await api().get('/admin/dashboard').set(adminAuth).expect(200);
    expect(d.bonus).toMatchObject({ valor: 5, quantidade: 1, cadastro: { quantidade: 1, valor: 5 } });
    expect(d.lucroLiquido).toBeCloseTo(d.jogos.lucro - 5, 2);
    expect(d.serie.reduce((a: number, b: { bonus: number }) => a + b.bonus, 0)).toBe(5);
    // bônus não é de um jogo: com filtro de jogo não desconta
    const { body: soCrash } = await api().get('/admin/dashboard?jogo=crash').set(adminAuth).expect(200);
    expect(soCrash.bonus.valor).toBe(0);
    expect(soCrash.lucroLiquido).toBe(soCrash.jogos.lucro);

    // bônus diário também entra na lista, com o nome vindo do saldo informado pelo site
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, bonusDiarioAtivo: true, bonusDiario: 2 }).expect(200);
    await api().post('/saldos').send({ email: 'caio@x.com', nome: 'Caio Prado', saldo: 10 }).expect(204);
    await api().post('/rodadas').send({ jogo: 'crash', aposta: 1, premio: 0, chave: 'rodada-bonus-caio', jogador: 'caio@x.com' }).expect(204);
    expect((await api().post('/bonus-diario').send({ email: 'caio@x.com' }).expect(200)).body).toEqual({ valor: 2 });
    await api().post('/bonus-diario').send({ email: 'caio@x.com' }).expect(409);
    const { body: diario } = await api().get('/admin/bonus?tipo=diario').set(adminAuth).expect(200);
    expect(diario.itens[0]).toMatchObject({ tipo: 'diario', jogador: 'caio@x.com', nome: 'Caio Prado', valor: 2 });
    expect((await api().get('/admin/bonus').set(adminAuth).expect(200)).body.soma).toMatchObject({ valor: 7 });
    await api().put('/admin/config').set(adminAuth).send({ autoBalanco: false, janelaHoras: 24, bonusDiarioAtivo: false }).expect(200);
  });
});
