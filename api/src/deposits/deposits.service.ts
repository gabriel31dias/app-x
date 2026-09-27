import { BadGatewayException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePixDepositDto } from './dto/create-pix-deposit.dto.js';

// status da BullsCash → status do painel (mesmas listas do app.js)
const PAGO = new Set(['paid', 'pago', 'approved', 'completed', 'concluido', 'concluida']);
const FALHOU = new Set(['failed', 'canceled', 'cancelled', 'cancelado', 'refunded', 'expired', 'expirado']);
const dataOuAgora = (s: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : new Date());
const statusDe = (s: string) => (PAGO.has(s) ? 'pago' : FALHOU.has(s) ? 'falhou' : 'pendente');

type BullsCashDeposit = {
  id?: unknown;
  e2e?: unknown;
  gross_amount_cents?: unknown;
  net_amount_cents?: unknown;
  status?: unknown;
  source?: unknown;
  pix_emv?: unknown;
  created_at?: unknown;
  paid_at?: unknown;
};

@Injectable()
export class DepositsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly baseUrl = (process.env.BULLSCASH_BASE_URL ?? 'https://v1.pagintermediacao.com/api/v1').replace(/\/+$/, '');

  async create(dto: CreatePixDepositDto) {
    const data = await this.bullsCashRequest('/deposit', {
      method: 'POST',
      body: JSON.stringify({
        amount: dto.amountCents,
        buyer_name: dto.buyerName,
        buyer_document: dto.buyerDocument,
        buyer_phone: dto.buyerPhone,
        buyer_email: dto.buyerEmail,
        description: 'Deposito Orama Games',
        metadata: { player_document: dto.buyerDocument },
        postback_url: process.env.BULLSCASH_POSTBACK_URL || undefined,
      }),
    });
    const dep = this.normalize(data);
    await this.prisma.deposito.create({
      data: {
        id: dep.id,
        valorCentavos: dep.grossAmountCents ?? dto.amountCents,
        liquidoCentavos: dep.netAmountCents,
        status: statusDe(dep.status),
        statusBruto: dep.status,
        nome: dto.buyerName,
        documento: dto.buyerDocument,
        celular: dto.buyerPhone,
        email: dto.buyerEmail ?? null,
      },
    });
    return dep;
  }

  async find(id: string) {
    const dep = this.normalize(await this.bullsCashRequest(`/deposit/${encodeURIComponent(id)}`, { method: 'GET' }));
    const status = statusDe(dep.status);
    // só atualiza depósito que nasceu aqui; pagoEm fica com a primeira vez que vimos pago
    await this.prisma.deposito.updateMany({
      where: { id: dep.id },
      data: { status, statusBruto: dep.status, liquidoCentavos: dep.netAmountCents ?? undefined },
    });
    if (status === 'pago')
      await this.prisma.deposito.updateMany({ where: { id: dep.id, pagoEm: null }, data: { pagoEm: dataOuAgora(dep.paidAt) } });
    return dep;
  }

  private async bullsCashRequest(path: string, init: RequestInit): Promise<BullsCashDeposit> {
    const publicKey = process.env.BULLSCASH_PUBLIC_KEY;
    const secretKey = process.env.BULLSCASH_SECRET_KEY ?? process.env.BULLSCASH_PRIVATE_KEY;
    if (!publicKey || !secretKey) {
      throw new InternalServerErrorException('Configure BULLSCASH_PUBLIC_KEY e BULLSCASH_SECRET_KEY no ambiente da API');
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'X-Public-Key': publicKey,
          'X-Secret-Key': secretKey,
          'X-Private-Key': secretKey,
          ...init.headers,
        },
      });
    } catch {
      throw new BadGatewayException('Nao foi possivel conectar na BullsCash');
    }

    const body = await response.text();
    const parsed = body ? this.safeJson(body) : {};
    if (!response.ok) {
      throw new BadGatewayException({
        message: 'BullsCash recusou a requisicao',
        statusCode: response.status,
        detail: parsed,
      });
    }
    return parsed;
  }

  private safeJson(body: string): BullsCashDeposit {
    try {
      return JSON.parse(body) as BullsCashDeposit;
    } catch {
      return { status: body };
    }
  }

  private normalize(data: BullsCashDeposit) {
    if (!data.id) throw new BadGatewayException('Resposta da BullsCash sem id de transacao');
    return {
      id: String(data.id),
      e2e: data.e2e ? String(data.e2e) : null,
      grossAmountCents: this.toCents(data.gross_amount_cents),
      netAmountCents: this.toCents(data.net_amount_cents),
      status: String(data.status ?? 'pending').toLowerCase(),
      source: data.source ? String(data.source) : null,
      pixEmv: data.pix_emv ? String(data.pix_emv) : null,
      createdAt: data.created_at ? String(data.created_at) : null,
      paidAt: data.paid_at ? String(data.paid_at) : null,
    };
  }

  private toCents(value: unknown) {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }
}
