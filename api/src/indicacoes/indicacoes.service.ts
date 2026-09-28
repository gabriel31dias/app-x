import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { cpfValido } from '../common/validators.js';
import type { Indicacao, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const digitos = (s: string) => s.replace(/\D/g, '');
const reais = (centavos: number) => Math.round(centavos) / 100;
// sem 0/O/1/I pra ninguém errar ao digitar o código
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const novoCodigo = () => Array.from(randomBytes(7), (b) => LETRAS[b % LETRAS.length]).join('');

export type Conta = { email: string; cpf: string; nome?: string };

/**
 * "Indique e ganhe": cada conta tem um código; quem se cadastra pelo link vira indicado.
 * O indicador ganha o valor da configuração quando o indicado faz 1 depósito pago e joga o mínimo de rodadas.
 * ponytail: a conta ainda é local (e-mail + CPF que o site manda), igual a saques e bônus.
 */
@Injectable()
export class IndicacoesService {
  constructor(private readonly prisma: PrismaService) {}

  private config() {
    return this.prisma.configuracao.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  /** o que o indicado já fez: soma dos depósitos pagos e rodadas com aposta */
  async progresso(itens: Pick<Indicacao, 'indicado' | 'indicadoCpf'>[]) {
    if (!itens.length) return new Map<string, { depositado: number; rodadas: number }>();
    const emails = itens.map((i) => i.indicado), cpfs = itens.map((i) => i.indicadoCpf);
    const [deps, rodadas] = await Promise.all([
      this.prisma.deposito.findMany({ where: { status: 'pago', OR: [{ email: { in: emails } }, { documento: { in: cpfs } }] }, select: { email: true, documento: true, valorCentavos: true } }),
      this.prisma.rodada.groupBy({ by: ['jogador'], where: { jogador: { in: emails }, apostaCentavos: { gt: 0 } }, _count: true }),
    ]);
    return new Map(itens.map((i) => [i.indicado, {
      depositado: deps.filter((d) => d.email === i.indicado || d.documento === i.indicadoCpf).reduce((a, d) => a + d.valorCentavos, 0),
      rodadas: rodadas.find((r) => r.jogador === i.indicado)?._count ?? 0,
    }]));
  }

  /** libera as pendentes que já cumpriram as regras, com o valor da configuração de agora */
  private async liberar(where: Prisma.IndicacaoWhereInput) {
    const cfg = await this.config();
    if (!cfg.indicacaoAtiva) return;
    const pendentes = await this.prisma.indicacao.findMany({ where: { ...where, status: 'pendente' } });
    const prog = await this.progresso(pendentes);
    for (const i of pendentes) {
      const p = prog.get(i.indicado)!;
      if (p.depositado > 0 && p.rodadas >= cfg.indicacaoMinRodadas) {
        await this.prisma.indicacao.updateMany({
          where: { id: i.id, status: 'pendente' },
          data: { status: 'liberada', valorCentavos: cfg.indicacaoCentavos, liberadaEm: new Date() },
        });
      }
    }
  }

  private async afiliado(c: Conta) {
    const email = c.email.toLowerCase();
    const achou = await this.prisma.afiliado.findUnique({ where: { email } });
    if (achou) return achou;
    for (let t = 0; ; t++) {
      try {
        return await this.prisma.afiliado.create({ data: { email, codigo: novoCodigo(), nome: (c.nome ?? '').trim() || email, cpf: digitos(c.cpf) } });
      } catch (e) {
        const outro = await this.prisma.afiliado.findUnique({ where: { email } }); // duas abas criando ao mesmo tempo
        if (outro) return outro;
        if (t >= 4) throw e; // código repetido 5 vezes seguidas: não acontece
      }
    }
  }

  /** painel do jogador: link, regras, indicados e o que já dá pra creditar */
  async minhas(c: Conta) {
    const email = c.email.toLowerCase();
    const [cfg, af] = await Promise.all([this.config(), this.afiliado(c)]);
    await this.liberar({ indicador: email });
    const itens = await this.prisma.indicacao.findMany({ where: { indicador: email }, orderBy: { criadoEm: 'desc' }, take: 100 });
    const prog = await this.progresso(itens);
    return {
      ativo: cfg.indicacaoAtiva,
      valor: reais(cfg.indicacaoCentavos),
      minRodadas: cfg.indicacaoMinRodadas,
      codigo: af.codigo,
      ganho: reais(itens.reduce((a, i) => a + (i.creditadoEm ? i.valorCentavos ?? 0 : 0), 0)),
      indicados: itens.map((i) => ({
        nome: i.indicadoNome.split(/\s+/)[0], // só o primeiro nome: é a lista de outra pessoa
        criadoEm: i.criadoEm,
        depositou: prog.get(i.indicado)!.depositado > 0,
        rodadas: prog.get(i.indicado)!.rodadas,
        status: i.creditadoEm ? 'recebida' : i.status,
        valor: i.valorCentavos != null ? reais(i.valorCentavos) : null,
      })),
      paraCreditar: itens.filter((i) => i.status === 'liberada' && !i.creditadoEm).map((i) => ({ id: i.id, valor: reais(i.valorCentavos ?? 0) })),
    };
  }

  /** conta nova criada pelo link: vale uma vez por e-mail e por CPF, e só pra quem ainda não depositou */
  async registrar(codigo: string, c: Conta) {
    const email = c.email.toLowerCase(), cpf = digitos(c.cpf);
    if (!cpfValido(cpf)) throw new BadRequestException('CPF inválido');
    const af = await this.prisma.afiliado.findUnique({ where: { codigo: codigo.trim().toUpperCase() } });
    if (!af) throw new BadRequestException('Link de indicação inválido');
    if (af.email === email || af.cpf === cpf) throw new BadRequestException('Não dá pra usar o próprio link');
    if (await this.prisma.deposito.count({ where: { OR: [{ email }, { documento: cpf }], status: 'pago' } })) {
      throw new ConflictException('Esta conta já jogava antes do link');
    }
    try {
      await this.prisma.indicacao.create({ data: { codigo: af.codigo, indicador: af.email, indicado: email, indicadoCpf: cpf, indicadoNome: (c.nome ?? '').trim() || email } });
    } catch {
      throw new ConflictException('Esta conta já foi indicada'); // índice único de e-mail/CPF
    }
    return { ok: true };
  }

  /** marca como creditada e registra o bônus; só quem ganha o UPDATE soma no saldo */
  async creditar(id: string, c: Conta) {
    const email = c.email.toLowerCase();
    const af = await this.prisma.afiliado.findUnique({ where: { email } });
    if (!af || af.cpf !== digitos(c.cpf)) return { creditar: false, valor: 0 };
    const agora = new Date();
    const { count } = await this.prisma.indicacao.updateMany({ where: { id, indicador: email, status: 'liberada', creditadoEm: null }, data: { creditadoEm: agora } });
    if (!count) return { creditar: false, valor: 0 };
    const i = await this.prisma.indicacao.findUniqueOrThrow({ where: { id } });
    await this.prisma.bonus.create({ data: { chave: `indicacao:${i.id}`, tipo: 'indicacao', jogador: email, nome: af.nome, valorCentavos: i.valorCentavos ?? 0, criadoEm: agora } });
    return { creditar: true, valor: reais(i.valorCentavos ?? 0) };
  }

  /** lista do admin (libera antes o que já cumpriu as regras) */
  async admin(where: Prisma.IndicacaoWhereInput, pagina: number, porPagina: number) {
    await this.liberar({});
    const [itens, total, porStatus, pagas] = await Promise.all([
      this.prisma.indicacao.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * porPagina, take: porPagina }),
      this.prisma.indicacao.count({ where }),
      this.prisma.indicacao.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.indicacao.aggregate({ where: { ...where, creditadoEm: { not: null } }, _sum: { valorCentavos: true }, _count: true }),
    ]);
    const [prog, afs] = await Promise.all([
      this.progresso(itens),
      this.prisma.afiliado.findMany({ where: { email: { in: [...new Set(itens.map((i) => i.indicador))] } }, select: { email: true, nome: true } }),
    ]);
    const nomes = new Map(afs.map((a) => [a.email, a.nome]));
    const conta = (s: string) => porStatus.find((p) => p.status === s)?._count ?? 0;
    return {
      itens: itens.map((i) => ({
        id: i.id,
        codigo: i.codigo,
        indicador: i.indicador,
        indicadorNome: nomes.get(i.indicador) ?? null,
        indicado: i.indicado,
        indicadoNome: i.indicadoNome,
        depositado: reais(prog.get(i.indicado)!.depositado),
        rodadas: prog.get(i.indicado)!.rodadas,
        status: i.creditadoEm ? 'recebida' : i.status,
        valor: i.valorCentavos != null ? reais(i.valorCentavos) : null,
        criadoEm: i.criadoEm,
        liberadaEm: i.liberadaEm,
        creditadoEm: i.creditadoEm,
      })),
      total,
      pagina,
      porPagina,
      soma: { pendentes: conta('pendente'), liberadas: conta('liberada') - pagas._count, pagas: pagas._count, valorPago: reais(pagas._sum.valorCentavos ?? 0) },
    };
  }
}
