import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { cpfValido } from '../common/validators.js';
import type { Prisma, Saque, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const SAQUE_MIN_PADRAO = 10, SAQUE_MAX = 50_000; // o mínimo de verdade vem de Configuracao.saqueMinimoCentavos
const reais = (c: number) => Math.round(c) / 100;
const digitos = (s: string) => s.replace(/\D/g, '');

class ContaDto {
  @IsEmail() @MaxLength(254) email: string;
  @Matches(/^[\d.\-\s]{11,14}$/, { message: 'CPF inválido' }) cpf: string;
}

class PedirSaqueDto extends ContaDto {
  @IsString() @MinLength(1) @MaxLength(120) nome: string;
  @IsNumber({}, { message: 'Valor inválido' }) @Min(0.01, { message: 'Valor inválido' }) @Max(SAQUE_MAX, { message: `Saque máximo de R$ ${SAQUE_MAX}` }) valor: number;
  @IsOptional() @IsNumber() @Min(0) saldo?: number;
}

/** o que o jogador pode ver dos próprios saques */
const brl = (reaisValor: number) => reaisValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const doJogador = (s: Saque) => ({ id: s.id, valor: reais(s.valorCentavos), status: s.status, motivo: s.motivo, criadoEm: s.criadoEm, decididoEm: s.decididoEm, estornado: !!s.estornadoEm });

// Rotas do site. O login do site ainda é local, então a conta se identifica por e-mail + CPF.
// ponytail: o saldo mora no aparelho; a API não tem como conferir se o jogador tem esse dinheiro.
// Por isso o saque é manual: o admin confere depósitos e rodadas antes de fazer o PIX.
@Controller('saques')
export class SaquesController {
  constructor(private readonly prisma: PrismaService) {}

  /** regras que o modal de saque do site mostra e valida antes de pedir */
  @Get('regras')
  async regras() {
    const c = await this.prisma.configuracao.findUnique({ where: { id: 1 } });
    return { minimo: (c?.saqueMinimoCentavos ?? SAQUE_MIN_PADRAO * 100) / 100, maximo: SAQUE_MAX, exigeDeposito: c?.saqueExigeDeposito ?? false };
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // por IP: segura robô, não atrapalha quem erra o valor
  async pedir(@Body() dto: PedirSaqueDto) {
    const cpf = digitos(dto.cpf);
    if (!cpfValido(cpf)) throw new BadRequestException({ message: 'Dados inválidos', erros: { cpf: 'CPF inválido' } });
    const cfg = await this.prisma.configuracao.findUnique({ where: { id: 1 } });
    const minimo = cfg?.saqueMinimoCentavos ?? SAQUE_MIN_PADRAO * 100;
    if (Math.round(dto.valor * 100) < minimo) throw new BadRequestException({ message: 'Dados inválidos', erros: { valor: `Saque mínimo de ${brl(minimo / 100)}` } });
    if (cfg?.saqueExigeDeposito && !(await this.prisma.deposito.count({ where: { documento: cpf, status: 'pago' } })))
      throw new BadRequestException('Para sacar, faça pelo menos um depósito na sua conta.');
    const s = await this.prisma.saque.create({
      data: {
        email: dto.email.toLowerCase(),
        nome: dto.nome.trim(),
        cpf,
        chavePix: cpf, // saque só pro CPF da própria conta
        valorCentavos: Math.round(dto.valor * 100),
        saldoInformado: dto.saldo != null ? Math.round(dto.saldo * 100) : null,
      },
    });
    return doJogador(s);
  }

  @Get()
  async meus(@Query() q: ContaDto) {
    const lista = await this.prisma.saque.findMany({ where: { email: q.email.toLowerCase(), cpf: digitos(q.cpf) }, orderBy: { criadoEm: 'desc' }, take: 30 });
    return lista.map(doJogador);
  }

  /** o site avisa que devolveu ao saldo o valor de um saque cancelado; só a primeira chamada diz "pode devolver" */
  @Post(':id/estorno')
  @HttpCode(200)
  async estorno(@Param('id') id: string, @Body() dto: ContaDto) {
    const r = await this.prisma.saque.updateMany({
      where: { id, email: dto.email.toLowerCase(), cpf: digitos(dto.cpf), status: 'cancelado', estornadoEm: null },
      data: { estornadoEm: new Date() },
    });
    return { devolver: r.count === 1 };
  }
}

class ListaDto {
  @IsOptional() @IsIn(['pendente', 'aprovado', 'cancelado']) status?: string;
  @IsOptional() @IsString() @MaxLength(254) q?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) de?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) ate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) porPagina?: number;
}

class CancelarDto {
  @IsString() @MinLength(3, { message: 'Escreva o motivo (o jogador vê)' }) @MaxLength(300) motivo: string;
}

@Controller('admin/saques')
@UseGuards(AdminGuard)
export class AdminSaquesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async lista(@Query() q: ListaDto) {
    const pagina = q.pagina ?? 1, porPagina = q.porPagina ?? 20;
    const fuso = 3 * 3600_000; // São Paulo, UTC-3
    const where: Prisma.SaqueWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.de && { criadoEm: { gte: new Date(Date.parse(q.de) + fuso), ...(q.ate && { lt: new Date(Date.parse(q.ate) + fuso + 86400_000) }) } }),
      ...(q.q && { OR: [{ email: { contains: q.q.toLowerCase(), mode: 'insensitive' } }, { nome: { contains: q.q, mode: 'insensitive' } }, { cpf: { contains: digitos(q.q) || q.q, mode: 'insensitive' } }] }),
    };
    const [itens, total, agg, pend] = await Promise.all([
      this.prisma.saque.findMany({ where, orderBy: [{ status: 'desc' }, { criadoEm: 'desc' }], skip: (pagina - 1) * porPagina, take: porPagina }),
      this.prisma.saque.count({ where }),
      this.prisma.saque.aggregate({ where, _sum: { valorCentavos: true } }),
      this.prisma.saque.aggregate({ where: { status: 'pendente' }, _sum: { valorCentavos: true }, _count: true }),
    ]);

    // conferência pro admin decidir: quanto a pessoa depositou, como foi nas rodadas e o saldo que o site informou
    const emails = [...new Set(itens.map((s) => s.email))], cpfs = [...new Set(itens.map((s) => s.cpf))];
    const [deps, rods, jogs, saquesPagos] = await Promise.all([
      this.prisma.deposito.groupBy({ by: ['documento'], where: { documento: { in: cpfs }, status: 'pago' }, _sum: { valorCentavos: true } }),
      this.prisma.rodada.groupBy({ by: ['jogador'], where: { jogador: { in: emails } }, _sum: { apostaCentavos: true, premioCentavos: true }, _count: true }),
      this.prisma.jogador.findMany({ where: { email: { in: emails } } }),
      this.prisma.saque.groupBy({ by: ['cpf'], where: { cpf: { in: cpfs }, status: 'aprovado' }, _sum: { valorCentavos: true } }),
    ]);
    const dep = new Map(deps.map((d) => [d.documento, d._sum.valorCentavos ?? 0]));
    const rod = new Map(rods.map((r) => [r.jogador, r]));
    const sal = new Map(jogs.map((j) => [j.email, j.saldoCentavos]));
    const pago = new Map(saquesPagos.map((s) => [s.cpf, s._sum.valorCentavos ?? 0]));

    return {
      itens: itens.map((s) => {
        const r = rod.get(s.email);
        return {
          id: s.id, email: s.email, nome: s.nome, cpf: s.cpf, chavePix: s.chavePix, valor: reais(s.valorCentavos), status: s.status, motivo: s.motivo,
          criadoEm: s.criadoEm, decididoEm: s.decididoEm, decididoPor: s.decididoPor, estornado: !!s.estornadoEm,
          conferencia: {
            depositado: reais(dep.get(s.cpf) ?? 0),
            jaSacado: reais(pago.get(s.cpf) ?? 0),
            rodadas: r?._count ?? 0,
            resultadoJogos: reais((r?._sum.premioCentavos ?? 0) - (r?._sum.apostaCentavos ?? 0)), // positivo = jogador ganhou da casa
            saldoNoPedido: s.saldoInformado == null ? null : reais(s.saldoInformado),
            saldoAgora: sal.has(s.email) ? reais(sal.get(s.email)!) : null,
          },
        };
      }),
      total, pagina, porPagina,
      soma: reais(agg._sum.valorCentavos ?? 0),
      pendentes: { quantidade: pend._count, valor: reais(pend._sum.valorCentavos ?? 0) },
    };
  }

  /** admin já fez o PIX na mão: fecha o saque */
  @Put(':id/aprovar')
  aprovar(@Param('id') id: string, @CurrentUser() u: User) {
    return this.decidir(id, u, { status: 'aprovado' });
  }

  /** cancela: o site devolve o valor ao saldo do jogador na próxima conferência */
  @Put(':id/cancelar')
  cancelar(@Param('id') id: string, @Body() dto: CancelarDto, @CurrentUser() u: User) {
    return this.decidir(id, u, { status: 'cancelado', motivo: dto.motivo.trim() });
  }

  private async decidir(id: string, u: User, data: { status: string; motivo?: string }) {
    const r = await this.prisma.saque.updateMany({ where: { id, status: 'pendente' }, data: { ...data, decididoPor: u.email, decididoEm: new Date() } });
    if (!r.count) {
      if (!(await this.prisma.saque.findUnique({ where: { id } }))) throw new NotFoundException('Saque não existe');
      throw new ConflictException('Esse saque já foi decidido');
    }
    return this.prisma.saque.findUnique({ where: { id } });
  }
}
