import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import request from 'supertest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { nivelDe } from '../src/profile/levels.js';

// banco próprio de teste (test.db), recriado a cada execução com as migrações reais
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'segredo-de-teste';
rmSync('test.db', { force: true });
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

  it('depósito PIX vira venda: grava ao criar e marca pago na consulta', async () => {
    process.env.BULLSCASH_PUBLIC_KEY = 'pk';
    process.env.BULLSCASH_SECRET_KEY = 'sk';
    const resposta = (status: string) => new Response(JSON.stringify({ id: 'bc-1', gross_amount_cents: 2500, net_amount_cents: 2400, status, pix_emv: '000201' }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(resposta('pending'));
    await api().post('/depositos').send({ amountCents: 2500, buyerName: 'Carla Dias', buyerDocument: '52998224725', buyerPhone: '11987654321' }).expect(201);
    let v = await api().get('/admin/vendas?q=carla').set(adminAuth).expect(200);
    expect(v.body.itens[0]).toMatchObject({ id: 'bc-1', valor: 25, status: 'pendente', pagoEm: null });

    fetchMock.mockResolvedValueOnce(resposta('paid'));
    await api().get('/depositos/bc-1').expect(200);
    v = await api().get('/admin/vendas?q=carla').set(adminAuth).expect(200);
    expect(v.body.itens[0]).toMatchObject({ status: 'pago', liquido: 24 });
    expect(v.body.itens[0].pagoEm).not.toBeNull();
    fetchMock.mockRestore();
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
