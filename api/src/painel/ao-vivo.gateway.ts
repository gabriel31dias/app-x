import { JwtService } from '@nestjs/jwt';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { TokenPayload } from '../auth/auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JOGOS } from '../rtp/rtp.controller.js';

type Sessao = { id: string; jogo: string; nome: string; jogador: string | null; jogadorNome: string | null; desde: string; assistindo: number };
const JOGOS_COM_QUEDA = new Set(['crash', 'sapo', 'pato', 'barriga']);

const sala = (id: string) => `ver:${id}`;
const admins = () => (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * Jogos ao vivo. Cada jogo aberto conecta como "jogador" e só grava a tela (rrweb) enquanto algum admin assiste:
 * o servidor manda `gravar: true/false` conforme a sala `ver:<id>` tem ou não gente. Os eventos passam direto
 * pro admin, nada é guardado.
 * ponytail: sessões em memória; com mais de uma instância da API precisa do adapter Redis do socket.io
 */
@WebSocketGateway({ namespace: '/ao-vivo', cors: { origin: true }, maxHttpBufferSize: 5_000_000 })
export class AoVivoGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() ns: Namespace;
  private readonly sessoes = new Map<string, Sessao>();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(s: Socket) {
    const auth = s.handshake.auth ?? {};
    if (auth.papel === 'admin') {
      const email = await this.adminDe(String(auth.token ?? ''));
      if (!email) return s.disconnect(true);
      s.data.admin = email;
      s.join('admins');
      s.emit('sessoes', this.lista());
      return;
    }
    const jogo = String(auth.jogo ?? '');
    if (!JOGOS[jogo]) return s.disconnect(true);
    const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    this.sessoes.set(s.id, {
      id: s.id,
      jogo,
      nome: JOGOS[jogo].nome,
      jogador: texto(auth.jogador, 254)?.toLowerCase() ?? null,
      jogadorNome: texto(auth.jogadorNome, 120),
      desde: new Date().toISOString(),
      assistindo: 0,
    });
    this.avisarAdmins();
  }

  handleDisconnect(s: Socket) {
    if (this.sessoes.delete(s.id)) {
      this.ns.to(sala(s.id)).emit('fim', { id: s.id });
      this.avisarAdmins();
    } else if (s.data.admin && s.data.vendo) {
      this.recontar(s.data.vendo);
    }
  }

  /** admin começa a ver uma sessão (e para de ver a anterior) */
  @SubscribeMessage('assistir')
  async assistir(@ConnectedSocket() s: Socket, @MessageBody() id: string) {
    if (!s.data.admin || !this.sessoes.has(id)) return { ok: false };
    await this.sair(s);
    await s.join(sala(id));
    s.data.vendo = id;
    // (re)começa a gravação: o rrweb abre com uma foto completa da tela, que o player precisa pra montar a página
    this.ns.to(id).emit('gravar', true);
    this.recontar(id);
    return { ok: true };
  }

  @SubscribeMessage('parar')
  async parar(@ConnectedSocket() s: Socket) {
    await this.sair(s);
  }

  /** lote de eventos do rrweb vindo do jogo: repassa só pra quem está assistindo essa sessão */
  @SubscribeMessage('ev')
  eventos(@ConnectedSocket() s: Socket, @MessageBody() eventos: unknown) {
    if (this.sessoes.has(s.id) && Array.isArray(eventos)) this.ns.to(sala(s.id)).emit('ev', { id: s.id, eventos });
  }

  derrubarCrash(id: string, admin: string) {
    const sessao = this.sessoes.get(id);
    if (!sessao) throw new NotFoundException('Sessão ao vivo não encontrada');
    if (!JOGOS_COM_QUEDA.has(sessao.jogo)) throw new BadRequestException('Este comando só funciona em jogos crash');
    this.ns.to(id).emit('controle', { tipo: 'crash:derrubar', por: admin, em: new Date().toISOString() });
    return { ok: true, sessao };
  }

  private async sair(s: Socket) {
    const antes: string | undefined = s.data.vendo;
    if (!antes) return;
    await s.leave(sala(antes));
    s.data.vendo = undefined;
    this.recontar(antes);
  }

  /** quantos admins veem a sessão; sem ninguém, o jogo para de gravar */
  private recontar(id: string) {
    const sessao = this.sessoes.get(id);
    if (!sessao) return;
    sessao.assistindo = this.ns.adapter.rooms.get(sala(id))?.size ?? 0;
    if (!sessao.assistindo) this.ns.to(id).emit('gravar', false);
    this.avisarAdmins();
  }

  private lista() {
    return [...this.sessoes.values()].sort((a, b) => a.desde.localeCompare(b.desde));
  }

  private avisarAdmins() {
    this.ns.to('admins').emit('sessoes', this.lista());
  }

  private async adminDe(token: string) {
    try {
      const p = await this.jwt.verifyAsync<TokenPayload>(token);
      const u = await this.prisma.user.findUnique({ where: { id: p.sub } });
      return u && u.tokenVersion === p.v && admins().includes(u.email) ? u.email : null;
    } catch {
      return null;
    }
  }
}
