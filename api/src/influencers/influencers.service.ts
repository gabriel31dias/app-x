import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password.js';
import { cpfValido } from '../common/validators.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const digitos = (s: string) => s.replace(/\D/g, '');
const reais = (centavos: number) => Math.round(centavos) / 100;
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
const novoCodigo = () => Array.from(randomBytes(6), (b) => LETRAS[b % LETRAS.length]).join('');
/** "Maria Souza" → "Maria S." — o influencer vê quem se inscreveu, mas não o nome completo nem o e-mail */
const mascarar = (nome: string) => {
  const [p, ...r] = nome.trim().split(/\s+/);
  return r.length ? `${p} ${r[r.length - 1][0]}.` : p;
};

export type NovoInfluencer = { nome: string; email: string; cpf: string; celular: string; chavePix: string; senha: string };
type Conta = { email: string; cpf: string; nome?: string };

/**
 * Programa de influencers: link ?inf=CODIGO. Comissão por inscrição, pelo 1º depósito do inscrito e uma % de
 * cada depósito pago dele. Cada comissão vira uma linha com o valor de quando foi gerada (chave única, não duplica).
 * Saldo do influencer = comissões − saques pendentes/pagos.
 */
@Injectable()
export class InfluencersService {
  constructor(private readonly prisma: PrismaService) {}

  private config() {
    return this.prisma.configuracao.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  // ---------- site ----------

  /** conta nova criada pelo link: vale uma vez por e-mail/CPF e só pra quem ainda não depositou */
  async registrarIndicado(codigo: string, c: Conta) {
    const email = c.email.toLowerCase(), cpf = digitos(c.cpf);
    if (!cpfValido(cpf)) throw new BadRequestException('CPF inválido');
    const inf = await this.prisma.influencer.findUnique({ where: { codigo: codigo.trim().toUpperCase() } });
    if (!inf?.ativo) throw new BadRequestException('Link inválido');
    if (inf.email === email || inf.cpf === cpf) throw new BadRequestException('Não dá pra usar o próprio link');
    if (await this.prisma.deposito.count({ where: { OR: [{ email }, { documento: cpf }], status: 'pago' } })) {
      throw new ConflictException('Esta conta já jogava antes do link');
    }
    const cfg = await this.config();
    try {
      await this.prisma.$transaction([
        this.prisma.influencerIndicado.create({ data: { influencerId: inf.id, email, cpf, nome: (c.nome ?? '').trim() || email } }),
        this.prisma.influencerComissao.create({
          data: { influencerId: inf.id, chave: `cadastro:${email}`, tipo: 'cadastro', indicado: email, valorCentavos: cfg.infCadastroCentavos },
        }),
      ]);
    } catch {
      throw new ConflictException('Esta conta já veio pelo link de alguém'); // índice único de e-mail/CPF
    }
    return { ok: true };
  }

  // ---------- comissões ----------

  /**
   * Gera as comissões de depósito que faltam: 1º depósito pago de cada inscrito e a % de cada depósito pago
   * depois da inscrição. Idempotente (chave única), roda antes de mostrar qualquer número.
   */
  async conciliar(influencerId?: string) {
    const cfg = await this.config();
    const indicados = await this.prisma.influencerIndicado.findMany({ where: influencerId ? { influencerId } : {} });
    if (!indicados.length) return;
    const deps = await this.prisma.deposito.findMany({
      where: { status: 'pago', OR: [{ email: { in: indicados.map((i) => i.email) } }, { documento: { in: indicados.map((i) => i.cpf) } }] },
      orderBy: { criadoEm: 'asc' },
    });
    const novas: Prisma.InfluencerComissaoCreateManyInput[] = [];
    for (const i of indicados) {
      const dele = deps.filter((d) => (d.email === i.email || d.documento === i.cpf) && d.criadoEm >= i.criadoEm);
      if (!dele.length) continue;
      novas.push({ influencerId: i.influencerId, chave: `primeiro:${i.email}`, tipo: 'primeiro_deposito', indicado: i.email, depositoId: dele[0].id, valorCentavos: cfg.infPrimeiroDepositoCentavos });
      for (const d of dele) {
        const valor = Math.floor((d.valorCentavos * cfg.infComissaoBp) / 10_000);
        if (valor > 0) novas.push({ influencerId: i.influencerId, chave: `deposito:${d.id}`, tipo: 'deposito', indicado: i.email, depositoId: d.id, baseCentavos: d.valorCentavos, valorCentavos: valor });
      }
    }
    if (novas.length) await this.prisma.influencerComissao.createMany({ data: novas, skipDuplicates: true });
  }

  /** números de um influencer (ou de todos, pro admin) */
  private async numeros(ids: string[]) {
    const [indicados, comissoes, saques] = await Promise.all([
      this.prisma.influencerIndicado.groupBy({ by: ['influencerId'], where: { influencerId: { in: ids } }, _count: true }),
      this.prisma.influencerComissao.groupBy({ by: ['influencerId', 'tipo'], where: { influencerId: { in: ids } }, _sum: { valorCentavos: true, baseCentavos: true }, _count: true }),
      this.prisma.influencerSaque.groupBy({ by: ['influencerId', 'status'], where: { influencerId: { in: ids } }, _sum: { valorCentavos: true } }),
    ]);
    return new Map(ids.map((id) => {
      const c = (tipo: string) => comissoes.find((x) => x.influencerId === id && x.tipo === tipo);
      const s = (st: string) => saques.find((x) => x.influencerId === id && x.status === st)?._sum.valorCentavos ?? 0;
      const ganho = comissoes.filter((x) => x.influencerId === id).reduce((a, x) => a + (x._sum.valorCentavos ?? 0), 0);
      return [id, {
        inscritos: indicados.find((x) => x.influencerId === id)?._count ?? 0,
        depositaram: c('primeiro_deposito')?._count ?? 0,
        totalDepositado: reais(c('deposito')?._sum.baseCentavos ?? 0),
        comissaoCadastro: reais(c('cadastro')?._sum.valorCentavos ?? 0),
        comissaoPrimeiroDeposito: reais(c('primeiro_deposito')?._sum.valorCentavos ?? 0),
        comissaoDepositos: reais(c('deposito')?._sum.valorCentavos ?? 0),
        ganho: reais(ganho),
        sacado: reais(s('pago')),
        saquePendente: reais(s('pendente')),
        disponivel: reais(ganho - s('pago') - s('pendente')),
      }];
    }));
  }

  // ---------- dashboard do influencer ----------

  async painel(influencerId: string) {
    await this.conciliar(influencerId);
    const [inf, cfg, n, recentes, saques] = await Promise.all([
      this.prisma.influencer.findUniqueOrThrow({ where: { id: influencerId } }),
      this.config(),
      this.numeros([influencerId]),
      this.prisma.influencerComissao.findMany({ where: { influencerId }, orderBy: { criadoEm: 'desc' }, take: 30 }),
      this.prisma.influencerSaque.findMany({ where: { influencerId }, orderBy: { criadoEm: 'desc' }, take: 30 }),
    ]);
    const nomes = new Map((await this.prisma.influencerIndicado.findMany({ where: { email: { in: [...new Set(recentes.map((r) => r.indicado))] } }, select: { email: true, nome: true } })).map((i) => [i.email, mascarar(i.nome)]));
    return {
      nome: inf.nome,
      codigo: inf.codigo,
      chavePix: inf.chavePix,
      regras: { cadastro: reais(cfg.infCadastroCentavos), primeiroDeposito: reais(cfg.infPrimeiroDepositoCentavos), percentual: cfg.infComissaoBp / 100, saqueMinimo: reais(cfg.infSaqueMinimoCentavos) },
      ...n.get(influencerId)!,
      comissoes: recentes.map((r) => ({ id: r.id, tipo: r.tipo, inscrito: nomes.get(r.indicado) ?? '—', base: r.baseCentavos != null ? reais(r.baseCentavos) : null, valor: reais(r.valorCentavos), criadoEm: r.criadoEm })),
      saques: saques.map((s) => ({ id: s.id, valor: reais(s.valorCentavos), chavePix: s.chavePix, status: s.status, motivo: s.motivo, criadoEm: s.criadoEm, decididoEm: s.decididoEm })),
    };
  }

  /** inscritos do influencer, com o que cada um já rendeu pra ele */
  async inscritos(influencerId: string, pagina: number, porPagina: number) {
    await this.conciliar(influencerId);
    const [itens, total] = await Promise.all([
      this.prisma.influencerIndicado.findMany({ where: { influencerId }, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * porPagina, take: porPagina }),
      this.prisma.influencerIndicado.count({ where: { influencerId } }),
    ]);
    const com = await this.prisma.influencerComissao.groupBy({ by: ['indicado', 'tipo'], where: { influencerId, indicado: { in: itens.map((i) => i.email) } }, _sum: { valorCentavos: true, baseCentavos: true } });
    return {
      itens: itens.map((i) => {
        const doTipo = (t: string) => com.find((c) => c.indicado === i.email && c.tipo === t)?._sum;
        const rendeu = com.filter((c) => c.indicado === i.email).reduce((a, c) => a + (c._sum.valorCentavos ?? 0), 0);
        return { id: i.id, nome: mascarar(i.nome), criadoEm: i.criadoEm, depositou: !!doTipo('primeiro_deposito'), depositado: reais(doTipo('deposito')?.baseCentavos ?? 0), comissao: reais(rendeu) };
      }),
      total,
      pagina,
      porPagina,
    };
  }

  /** pedido de saque: trava a linha do influencer pra dois cliques não sacarem o mesmo saldo */
  async pedirSaque(influencerId: string, valor: number) {
    await this.conciliar(influencerId);
    const cfg = await this.config();
    const centavos = Math.round(valor * 100);
    if (centavos < cfg.infSaqueMinimoCentavos) throw new BadRequestException(`O saque mínimo é de R$ ${reais(cfg.infSaqueMinimoCentavos).toFixed(2).replace('.', ',')}`);
    return this.prisma.$transaction(async (tx) => {
      // UPDATE na própria linha = trava até o fim da transação (o 2º pedido espera e já vê o 1º)
      const inf = await tx.influencer.update({ where: { id: influencerId }, data: { id: influencerId } });
      const [g, s] = await Promise.all([
        tx.influencerComissao.aggregate({ where: { influencerId }, _sum: { valorCentavos: true } }),
        tx.influencerSaque.aggregate({ where: { influencerId, status: { in: ['pendente', 'pago'] } }, _sum: { valorCentavos: true } }),
      ]);
      const disponivel = (g._sum.valorCentavos ?? 0) - (s._sum.valorCentavos ?? 0);
      if (centavos > disponivel) throw new BadRequestException(`Saldo disponível: R$ ${reais(disponivel).toFixed(2).replace('.', ',')}`);
      const saque = await tx.influencerSaque.create({ data: { influencerId, valorCentavos: centavos, chavePix: inf.chavePix } });
      return { id: saque.id, valor: reais(centavos), status: saque.status };
    });
  }

  // ---------- admin ----------

  async criar(d: NovoInfluencer, admin: string) {
    const email = d.email.toLowerCase(), cpf = digitos(d.cpf);
    if (!cpfValido(cpf)) throw new BadRequestException({ message: 'Dados inválidos', erros: { cpf: 'CPF inválido' } });
    const [emailUsado, cpfUsado] = await Promise.all([this.prisma.user.findUnique({ where: { email } }), this.prisma.user.findUnique({ where: { cpf } })]);
    if (emailUsado || cpfUsado) {
      throw new ConflictException({ message: 'Dados inválidos', erros: { ...(emailUsado && { email: 'E-mail já tem conta' }), ...(cpfUsado && { cpf: 'CPF já tem conta' }) } });
    }
    const senhaHash = await hashPassword(d.senha);
    for (let t = 0; ; t++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // ponytail: o User exige nascimento; influencer é criado pelo admin, então fica uma data neutra
          const user = await tx.user.create({ data: { nome: d.nome.trim(), email, cpf, celular: digitos(d.celular), nascimento: new Date('2000-01-01T00:00:00Z'), senhaHash, termosAceitosEm: new Date() } });
          return tx.influencer.create({ data: { userId: user.id, codigo: novoCodigo(), nome: d.nome.trim(), email, cpf, chavePix: d.chavePix.trim(), criadoPor: admin } });
        });
      } catch (e) {
        if (t >= 4) throw e; // código repetido 5 vezes seguidas: não acontece
      }
    }
  }

  async atualizar(id: string, d: { ativo?: boolean; chavePix?: string; senha?: string }) {
    const inf = await this.prisma.influencer.findUnique({ where: { id } });
    if (!inf) throw new NotFoundException('Influencer não encontrado');
    await this.prisma.$transaction([
      this.prisma.influencer.update({ where: { id }, data: { ...(d.ativo != null && { ativo: d.ativo }), ...(d.chavePix && { chavePix: d.chavePix.trim() }) } }),
      // senha nova ou desativado: derruba as sessões abertas dele
      ...(d.senha || d.ativo === false
        ? [this.prisma.user.update({ where: { id: inf.userId }, data: { ...(d.senha && { senhaHash: await hashPassword(d.senha) }), tokenVersion: { increment: 1 } } })]
        : []),
    ]);
    return { ok: true };
  }

  async listar(q?: string) {
    await this.conciliar();
    const where: Prisma.InfluencerWhereInput = q ? { OR: [{ nome: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { codigo: { contains: q.toUpperCase() } }] } : {};
    const itens = await this.prisma.influencer.findMany({ where, orderBy: { criadoEm: 'desc' } });
    const n = await this.numeros(itens.map((i) => i.id));
    return itens.map((i) => ({ id: i.id, nome: i.nome, email: i.email, codigo: i.codigo, chavePix: i.chavePix, ativo: i.ativo, criadoEm: i.criadoEm, ...n.get(i.id)! }));
  }

  async saques(status: string | undefined, pagina: number, porPagina: number) {
    const where: Prisma.InfluencerSaqueWhereInput = status ? { status } : {};
    const [itens, total, pendentes] = await Promise.all([
      this.prisma.influencerSaque.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * porPagina, take: porPagina }),
      this.prisma.influencerSaque.count({ where }),
      this.prisma.influencerSaque.aggregate({ where: { status: 'pendente' }, _sum: { valorCentavos: true }, _count: true }),
    ]);
    const infs = new Map((await this.prisma.influencer.findMany({ where: { id: { in: [...new Set(itens.map((s) => s.influencerId))] } } })).map((i) => [i.id, i]));
    return {
      itens: itens.map((s) => ({ id: s.id, influencer: infs.get(s.influencerId)?.nome ?? '—', email: infs.get(s.influencerId)?.email ?? '', valor: reais(s.valorCentavos), chavePix: s.chavePix, status: s.status, motivo: s.motivo, decididoPor: s.decididoPor, decididoEm: s.decididoEm, criadoEm: s.criadoEm })),
      total,
      pagina,
      porPagina,
      soma: { pendentes: pendentes._count, valorPendente: reais(pendentes._sum.valorCentavos ?? 0) },
    };
  }

  /** só sai de "pendente" uma vez: aprovar (PIX já feito na mão) ou cancelar (valor volta pro disponível) */
  async decidir(id: string, status: 'pago' | 'cancelado', admin: string, motivo?: string) {
    const { count } = await this.prisma.influencerSaque.updateMany({
      where: { id, status: 'pendente' },
      data: { status, decididoPor: admin, decididoEm: new Date(), motivo: status === 'cancelado' ? motivo?.trim() || null : null },
    });
    if (!count) throw new ConflictException('Esse saque já foi decidido');
    return { ok: true };
  }
}
