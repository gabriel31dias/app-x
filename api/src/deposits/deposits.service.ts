import { BadGatewayException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePixDepositDto } from './dto/create-pix-deposit.dto.js';

// Cash-in Pix. Provedor das cobranças novas: PIX_PROVEDOR = pluggou (padrão) | gatebox.
// O id diz quem gerou cada cobrança, pra consulta ir sempre ao provedor certo:
//   plg-<uuid> → Pluggou · orama-<hex> → Gatebox · resto (uuid) → BullsCash, de antes das trocas.
// Só o servidor fala com eles: o cliente nunca vê as chaves nem opina sobre quanto foi pago.
const EXPIRA_S = 3600; // validade da cobrança na Gatebox
const PLUGGOU = 'plg-';
const CONFERE_MS = 24 * 3600_000; // pendente mais velho que isso não é mais conferido ao abrir o site
const digitos = (s: string) => s.replace(/\D/g, '');
const PAGO = new Set(['DONE', 'PAID', 'COMPLETED', 'CONFIRMED', 'APPROVED', 'SETTLED', 'SUCCESS']);

type PluggouTransacao = { id?: unknown; amount?: unknown; liquid_amount?: unknown; status?: unknown; e2e_id?: unknown; pix?: { emv?: unknown } };
type GateboxResposta = { data?: { key?: unknown; uuid?: unknown; status?: unknown; amount?: unknown }; transaction?: unknown; message?: unknown };

@Injectable()
export class DepositsService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly log = new Logger('Depositos');

  // lido na hora do uso: o .env pode carregar depois do import
  private get base() {
    return (process.env.PIX_BASE ?? 'https://api.gatebox.com.br/v1/customers').replace(/\/+$/, '');
  }
  private cache = { token: '', expira: 0 };

  async create(dto: CreatePixDepositDto) {
    return (process.env.PIX_PROVEDOR ?? 'pluggou').toLowerCase() === 'gatebox' ? this.createGatebox(dto) : this.createPluggou(dto);
  }

  async find(id: string) {
    const dep = await this.prisma.deposito.findUnique({ where: { id } });
    if (!dep) throw new NotFoundException('Depósito não encontrado');
    if (dep.status !== 'pendente') {
      return this.saida(dep.id, dep.status === 'pago' ? 'paid' : 'expired', dep.valorCentavos, null, dep.criadoEm, dep.pagoEm);
    }
    if (id.startsWith(PLUGGOU)) return this.findPluggou(dep);
    if (id.startsWith('orama-')) return this.findGatebox(dep);
    return this.findBullsCash(dep);
  }

  /**
   * Webhook da Pluggou: ela manda uma vez só e espera 200 em até 1 s. O corpo é só o gatilho —
   * o status vem da nossa consulta autenticada à Pluggou, então um webhook forjado não credita nada.
   */
  webhookPluggou(codigo: string | undefined, body: { data?: { id?: unknown } }) {
    const esperado = process.env.PLUGGOU_WEBHOOK_CODE;
    if (esperado && codigo !== esperado) throw new UnauthorizedException('Código de webhook inválido');
    const id = body?.data?.id;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) {
      void this.find(`${PLUGGOU}${id}`).catch((e: Error) => this.log.warn(`webhook ${id}: ${e.message}`));
    }
    return { received: true };
  }

  /**
   * Depósitos pagos da conta que ainda não entraram no saldo. Antes, confere no provedor os pendentes
   * recentes: quem pagou e fechou/reiniciou o site recebe ao voltar, mesmo sem webhook.
   * ponytail: a conta se identifica por e-mail + CPF (login ainda é local), igual aos saques.
   */
  async conta(email: string, cpf: string) {
    const dono = { email: email.toLowerCase(), documento: digitos(cpf) };
    const pendentes = await this.prisma.deposito.findMany({
      where: { ...dono, status: 'pendente', criadoEm: { gte: new Date(Date.now() - CONFERE_MS) } },
      select: { id: true },
    });
    await Promise.all(pendentes.map((d) => this.find(d.id).catch(() => null)));
    const pagos = await this.prisma.deposito.findMany({
      where: { ...dono, status: 'pago', creditadoEm: null },
      orderBy: { criadoEm: 'asc' },
    });
    return pagos.map((d) => ({ id: d.id, valor: d.valorCentavos / 100 }));
  }

  /** Marca como creditado. Só quem ganha o UPDATE soma no saldo: dois cliques ou duas abas não creditam duas vezes. */
  async creditar(id: string, email: string, cpf: string) {
    const { count } = await this.prisma.deposito.updateMany({
      where: { id, email: email.toLowerCase(), documento: digitos(cpf), status: 'pago', creditadoEm: null },
      data: { creditadoEm: new Date() },
    });
    if (!count) return { creditar: false, valor: 0 };
    const dep = await this.prisma.deposito.findUniqueOrThrow({ where: { id } });
    return { creditar: true, valor: dep.valorCentavos / 100 };
  }

  // --- Pluggou (https://docs.pluggoucash.com) ---

  private async createPluggou(dto: CreatePixDepositDto) {
    const t = await this.pluggou('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        payment_method: 'pix',
        amount: dto.amountCents,
        buyer: { buyer_name: dto.buyerName, buyer_document: dto.buyerDocument, buyer_phone: dto.buyerPhone },
        metadata: { origem: 'orama-games', email: dto.buyerEmail ?? null },
        postback_url: process.env.PLUGGOU_POSTBACK_URL || undefined,
      }),
    });
    const emv = t.pix?.emv ? String(t.pix.emv) : null;
    if (!t.id || !emv) throw new BadGatewayException('Pluggou não devolveu o código Pix');
    const dep = await this.prisma.deposito.create({
      data: {
        id: `${PLUGGOU}${String(t.id)}`,
        valorCentavos: dto.amountCents,
        liquidoCentavos: this.inteiro(t.liquid_amount),
        status: 'pendente',
        statusBruto: 'pending',
        nome: dto.buyerName,
        documento: dto.buyerDocument,
        celular: dto.buyerPhone,
        email: dto.buyerEmail?.toLowerCase() ?? null,
      },
    });
    return this.saida(dep.id, 'pending', dto.amountCents, emv, dep.criadoEm, null, 'pluggou');
  }

  private async findPluggou(dep: { id: string; valorCentavos: number; criadoEm: Date }) {
    const t = await this.pluggou(`/transactions/${encodeURIComponent(dep.id.slice(PLUGGOU.length))}`, { method: 'GET' });
    const bruto = String(t.status ?? 'pending').toLowerCase();
    // só vale como pago se entrou pelo menos o valor cobrado
    const pago = bruto === 'paid' && (this.inteiro(t.amount) ?? 0) >= dep.valorCentavos;
    const falhou = ['failed', 'canceled', 'refunded', 'chargeback'].includes(bruto);
    await this.prisma.deposito.updateMany({
      where: { id: dep.id, status: 'pendente' },
      data: {
        status: pago ? 'pago' : falhou ? 'falhou' : 'pendente',
        statusBruto: bruto,
        liquidoCentavos: this.inteiro(t.liquid_amount) ?? undefined,
        ...(pago ? { pagoEm: new Date() } : {}),
      },
    });
    return this.saida(dep.id, pago ? 'paid' : falhou ? 'expired' : 'pending', dep.valorCentavos, null, dep.criadoEm, pago ? new Date() : null, 'pluggou');
  }

  private async pluggou(rota: string, init: RequestInit): Promise<PluggouTransacao> {
    const pk = process.env.PLUGGOU_PUBLIC_KEY;
    const sk = process.env.PLUGGOU_SECRET_KEY;
    if (!pk || !sk) throw new InternalServerErrorException('Configure PLUGGOU_PUBLIC_KEY e PLUGGOU_SECRET_KEY no ambiente da API');
    const base = (process.env.PLUGGOU_BASE_URL ?? 'https://api.pluggoutech.com/api').replace(/\/+$/, '');
    const r = await this.fetch(`${base}${rota}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Public-Key': pk, 'X-Secret-Key': sk },
    }, 'Pluggou');
    const j = (await r.json().catch(() => ({}))) as { message?: unknown; data?: PluggouTransacao };
    if (!r.ok) {
      throw new BadGatewayException({ message: String(j.message ?? 'Pluggou recusou a requisicao'), statusCode: r.status, detail: j });
    }
    return j.data ?? {};
  }

  // --- Gatebox (a mesma integração do sinuca-mult) ---

  private async createGatebox(dto: CreatePixDepositDto) {
    const id = `orama-${randomBytes(8).toString('hex')}`;
    const r = await this.call('/pix/create-immediate-qrcode', {
      method: 'POST',
      body: JSON.stringify({
        amount: dto.amountCents / 100,
        externalId: id,
        expire: EXPIRA_S,
        description: 'Deposito Orama Games',
        name: dto.buyerName,
        email: dto.buyerEmail,
      }),
    });
    const brcode = r.data?.key ? String(r.data.key) : null;
    if (!brcode) throw new BadGatewayException('Gatebox não devolveu o código Pix');

    const dep = await this.prisma.deposito.create({
      data: {
        id,
        valorCentavos: dto.amountCents,
        status: 'pendente',
        statusBruto: 'CREATED',
        nome: dto.buyerName,
        documento: dto.buyerDocument,
        celular: dto.buyerPhone,
        email: dto.buyerEmail?.toLowerCase() ?? null,
      },
    });
    return this.saida(dep.id, 'pending', dto.amountCents, brcode, dep.criadoEm, null, 'gatebox');
  }

  private async findGatebox(dep: { id: string; valorCentavos: number; criadoEm: Date; statusBruto: string }) {
    const id = dep.id;
    const r = await this.call(`/pix/invoice?externalId=${encodeURIComponent(id)}`, { method: 'GET' });
    const bruto = String(r.data?.status ?? '').toUpperCase();
    const recebido = Math.round(Number(r.data?.amount ?? 0) * 100);
    // `transaction` só aparece quando o dinheiro entrou; a lista de status é cinto extra.
    // Só vale como pago se entrou pelo menos o valor cobrado.
    const pago = (!!r.transaction || PAGO.has(bruto)) && recebido >= dep.valorCentavos;
    const expirou = !pago && Date.now() > dep.criadoEm.getTime() + EXPIRA_S * 1000;
    const status = pago ? 'pago' : expirou ? 'falhou' : 'pendente';

    // updateMany com status pendente: pagoEm fica com a primeira vez que vimos pago
    await this.prisma.deposito.updateMany({
      where: { id, status: 'pendente' },
      data: { status, statusBruto: bruto || dep.statusBruto, ...(pago ? { pagoEm: new Date(), liquidoCentavos: recebido } : {}) },
    });
    return this.saida(id, pago ? 'paid' : expirou ? 'expired' : 'pending', dep.valorCentavos, null, dep.criadoEm, pago ? new Date() : null, 'gatebox');
  }

  // --- BullsCash: só consulta, pros PIX gerados antes das trocas ---: só a BullsCash sabe dele
  private async findBullsCash(dep: { id: string; valorCentavos: number; criadoEm: Date; statusBruto: string }) {
    const pk = process.env.BULLSCASH_PUBLIC_KEY;
    const sk = process.env.BULLSCASH_SECRET_KEY;
    if (!pk || !sk) return this.saida(dep.id, 'pending', dep.valorCentavos, null, dep.criadoEm, null, 'bullscash');
    const base = (process.env.BULLSCASH_BASE_URL ?? 'https://v1.pagintermediacao.com/api/v1').replace(/\/+$/, '');
    const r = await this.fetch(`${base}/deposit/${encodeURIComponent(dep.id)}`, {
      headers: { 'Content-Type': 'application/json', 'X-Public-Key': pk, 'X-Secret-Key': sk, 'X-Private-Key': sk },
    }, 'BullsCash');
    const j = (await r.json().catch(() => ({}))) as { status?: unknown; net_amount_cents?: unknown; paid_at?: unknown };
    if (!r.ok) throw new BadGatewayException({ message: 'BullsCash recusou a requisicao', statusCode: r.status, detail: j });
    const bruto = String(j.status ?? 'pending').toLowerCase();
    const pago = ['paid', 'pago', 'approved', 'completed', 'concluido', 'concluida'].includes(bruto);
    const falhou = ['failed', 'canceled', 'cancelled', 'cancelado', 'refunded', 'expired', 'expirado'].includes(bruto);
    const liquido = Number(j.net_amount_cents);
    await this.prisma.deposito.updateMany({
      where: { id: dep.id, status: 'pendente' },
      data: {
        status: pago ? 'pago' : falhou ? 'falhou' : 'pendente',
        statusBruto: bruto,
        ...(Number.isFinite(liquido) ? { liquidoCentavos: liquido } : {}),
        ...(pago ? { pagoEm: new Date() } : {}),
      },
    });
    return this.saida(dep.id, pago ? 'paid' : falhou ? 'expired' : 'pending', dep.valorCentavos, null, dep.criadoEm, pago ? new Date() : null, 'bullscash');
  }

  // mesmo formato que o app.js já consome
  private saida(id: string, status: string, cents: number, pixEmv: string | null, criado: Date, pago: Date | null, source?: string) {
    return {
      id,
      e2e: null,
      grossAmountCents: cents,
      netAmountCents: null,
      status,
      source: source ?? null,
      pixEmv,
      createdAt: criado.toISOString(),
      paidAt: pago ? pago.toISOString() : null,
    };
  }

  private async token(renovar: boolean) {
    if (!renovar && this.cache.token && Date.now() < this.cache.expira) return this.cache.token;
    const id = process.env.PIX_CLIENT_ID;
    const secret = process.env.PIX_CLIENT_SECRET;
    if (!id || !secret) throw new InternalServerErrorException('Configure PIX_CLIENT_ID e PIX_CLIENT_SECRET no ambiente da API');
    const r = await this.fetch(`${this.base}/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: id, client_secret: secret }),
    }, 'Gatebox');
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: unknown };
    if (!r.ok || !j.access_token) throw new BadGatewayException(`Gatebox auth ${r.status}`);
    this.cache = { token: j.access_token, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000 };
    return this.cache.token;
  }

  private async call(rota: string, init: RequestInit, renovou = false): Promise<GateboxResposta> {
    const t = await this.token(renovou);
    const r = await this.fetch(`${this.base}${rota}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
    }, 'Gatebox');
    if (r.status === 401 && !renovou) return this.call(rota, init, true); // token vencido
    const j = (await r.json().catch(() => ({}))) as GateboxResposta;
    if (!r.ok) {
      throw new BadGatewayException({ message: 'Gatebox recusou a requisicao', statusCode: r.status, detail: j });
    }
    return j;
  }

  private async fetch(url: string, init: RequestInit, quem: string) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new BadGatewayException(`Nao foi possivel conectar na ${quem}`);
    }
  }

  private inteiro(v: unknown) {
    const n = typeof v === 'number' ? v : Number(v);
    return v != null && Number.isFinite(n) ? Math.round(n) : null;
  }
}
