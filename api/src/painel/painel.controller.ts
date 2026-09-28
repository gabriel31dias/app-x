import { BadRequestException, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JOGOS } from '../rtp/rtp.controller.js';
import { AoVivoGateway } from './ao-vivo.gateway.js';

// ponytail: Brasil sem horário de verão desde 2019, então São Paulo = UTC-3 fixo
const FUSO_MS = 3 * 3600_000;
const DIA_MS = 24 * 3600_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const reais = (centavos: number) => Math.round(centavos) / 100;
const hojeSP = () => new Date(Date.now() - FUSO_MS).toISOString().slice(0, 10);

class PeriodoDto {
  @IsOptional() @Matches(DATA, { message: 'Data no formato AAAA-MM-DD' }) de?: string;
  @IsOptional() @Matches(DATA, { message: 'Data no formato AAAA-MM-DD' }) ate?: string;
}

class DashboardDto extends PeriodoDto {
  @IsOptional() @IsIn(Object.keys(JOGOS)) jogo?: string;
}

class PaginaDto extends PeriodoDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) porPagina?: number;
}

class VendasDto extends PaginaDto {
  @IsOptional() @IsIn(['pago', 'pendente', 'falhou']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) min?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) max?: number;
}

class RodadasDto extends PaginaDto {
  @IsOptional() @IsIn(Object.keys(JOGOS)) jogo?: string;
  @IsOptional() @IsString() @MaxLength(254) jogador?: string;
  @IsOptional() @IsIn(['ganhou', 'perdeu']) resultado?: string;
}

class BonusDto extends PaginaDto {
  @IsOptional() @IsIn(['cadastro', 'diario', 'indicacao']) tipo?: string;
  @IsOptional() @IsString() @MaxLength(254) q?: string;
}

class JogadoresDto {
  @IsOptional() @IsString() @MaxLength(254) q?: string;
  @IsOptional() @IsIn(['saldo', 'recente', 'nome']) ordem?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) porPagina?: number;
}

/** dias "AAAA-MM-DD" de São Paulo → intervalo UTC [inicio, fim) */
function intervalo({ de, ate }: PeriodoDto) {
  de ??= hojeSP();
  ate ??= de;
  const inicio = new Date(Date.parse(de) + FUSO_MS), fim = new Date(Date.parse(ate) + FUSO_MS + DIA_MS);
  if (fim <= inicio) throw new BadRequestException('A data final vem antes da inicial');
  if (fim.getTime() - inicio.getTime() > 366 * DIA_MS) throw new BadRequestException('Período máximo de 1 ano');
  return { de, ate, inicio, fim, where: { gte: inicio, lt: fim } };
}

@Controller('admin')
@UseGuards(AdminGuard)
export class PainelController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aoVivo: AoVivoGateway,
  ) {}

  @Get('dashboard')
  async dashboard(@Query() q: DashboardDto) {
    const p = intervalo(q);
    // ponytail: soma em memória; troque por GROUP BY no banco quando passar de ~100 mil linhas por período
    const [deps, rodadas, rtps, bonus] = await Promise.all([
      this.prisma.deposito.findMany({ where: { criadoEm: p.where }, orderBy: { criadoEm: 'desc' } }),
      this.prisma.rodada.findMany({ where: { criadoEm: p.where, ...(q.jogo && { jogo: q.jogo }) } }),
      this.prisma.gameRtp.findMany(),
      // bônus não é de um jogo só: com filtro de jogo não entra no lucro
      q.jogo ? [] : this.prisma.bonus.findMany({ where: { criadoEm: p.where }, select: { tipo: true, valorCentavos: true, criadoEm: true } }),
    ]);

    // série: por hora se for um dia só, senão por dia
    const porHora = p.de === p.ate;
    const n = porHora ? 24 : Math.round((p.fim.getTime() - p.inicio.getTime()) / DIA_MS);
    const serie = Array.from({ length: n }, (_, i) => {
      const d = new Date(p.inicio.getTime() - FUSO_MS + i * DIA_MS);
      const rotulo = porHora ? `${String(i).padStart(2, '0')}h` : `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)}`;
      return { rotulo, vendas: 0, quantidade: 0, apostado: 0, lucro: 0, bonus: 0 };
    });
    const balde = (t: Date) => serie[Math.floor((t.getTime() - p.inicio.getTime()) / (porHora ? 3600_000 : DIA_MS))];

    const pagos = deps.filter((d) => d.status === 'pago');
    for (const d of pagos) {
      const b = balde(d.criadoEm);
      b.vendas += d.valorCentavos;
      b.quantidade++;
    }
    const jogos = new Map<string, { apostado: number; premios: number; rodadas: number }>();
    for (const r of rodadas) {
      const b = balde(r.criadoEm);
      b.apostado += r.apostaCentavos;
      b.lucro += r.apostaCentavos - r.premioCentavos;
      const j = jogos.get(r.jogo) ?? { apostado: 0, premios: 0, rodadas: 0 };
      j.apostado += r.apostaCentavos;
      j.premios += r.premioCentavos;
      j.rodadas++;
      jogos.set(r.jogo, j);
    }

    for (const b of bonus) balde(b.criadoEm).bonus += b.valorCentavos;

    const soma = (xs: { valorCentavos: number }[]) => xs.reduce((a, d) => a + d.valorCentavos, 0);
    const totalBonus = soma(bonus), porTipo = (tipo: string) => bonus.filter((b) => b.tipo === tipo);
    const valorPago = soma(pagos), apostado = rodadas.reduce((a, r) => a + r.apostaCentavos, 0), premios = rodadas.reduce((a, r) => a + r.premioCentavos, 0);
    const pendentes = deps.filter((d) => d.status === 'pendente'), falhas = deps.filter((d) => d.status === 'falhou');
    const rtpConfig = new Map(rtps.map((r) => [r.jogo, r.rtp]));

    return {
      periodo: { de: p.de, ate: p.ate, granularidade: porHora ? 'hora' : 'dia' },
      vendas: {
        valor: reais(valorPago),
        liquido: reais(pagos.reduce((a, d) => a + (d.liquidoCentavos ?? d.valorCentavos), 0)),
        quantidade: pagos.length,
        ticketMedio: pagos.length ? reais(valorPago / pagos.length) : 0,
        clientes: new Set(pagos.map((d) => d.documento)).size,
        pendentes: { quantidade: pendentes.length, valor: reais(soma(pendentes)) },
        falhas: { quantidade: falhas.length, valor: reais(soma(falhas)) },
        conversao: deps.length ? pagos.length / deps.length : null, // PIX gerados que foram pagos
      },
      jogos: {
        apostado: reais(apostado),
        premios: reais(premios),
        lucro: reais(apostado - premios),
        rtpReal: apostado ? premios / apostado : null,
        rodadas: rodadas.length,
        jogadores: new Set(rodadas.map((r) => r.jogador).filter(Boolean)).size,
      },
      // dinheiro dado pela casa (cadastro, diário): o lucro de verdade é o dos jogos menos isso
      bonus: {
        valor: reais(totalBonus),
        quantidade: bonus.length,
        cadastro: { quantidade: porTipo('cadastro').length, valor: reais(soma(porTipo('cadastro'))) },
        diario: { quantidade: porTipo('diario').length, valor: reais(soma(porTipo('diario'))) },
        indicacao: { quantidade: porTipo('indicacao').length, valor: reais(soma(porTipo('indicacao'))) },
      },
      lucroLiquido: reais(apostado - premios - totalBonus),
      serie: serie.map((b) => ({ ...b, vendas: reais(b.vendas), apostado: reais(b.apostado), lucro: reais(b.lucro), bonus: reais(b.bonus), lucroLiquido: reais(b.lucro - b.bonus) })),
      porJogo: Object.entries(JOGOS)
        .filter(([id]) => !q.jogo || id === q.jogo)
        .map(([id, info]) => {
          const j = jogos.get(id) ?? { apostado: 0, premios: 0, rodadas: 0 };
          return { jogo: id, nome: info.nome, apostado: reais(j.apostado), premios: reais(j.premios), lucro: reais(j.apostado - j.premios), rtpReal: j.apostado ? j.premios / j.apostado : null, rtpConfig: rtpConfig.get(id) ?? info.fabrica, rodadas: j.rodadas };
        })
        .sort((a, b) => b.lucro - a.lucro),
      ultimasVendas: deps.slice(0, 8).map(venda),
    };
  }

  @Get('vendas')
  async vendas(@Query() q: VendasDto) {
    const p = intervalo(q), pagina = q.pagina ?? 1, porPagina = q.porPagina ?? 20;
    const where: Prisma.DepositoWhereInput = {
      criadoEm: p.where,
      ...(q.status && { status: q.status }),
      ...((q.min != null || q.max != null) && { valorCentavos: { gte: q.min != null ? Math.round(q.min * 100) : undefined, lte: q.max != null ? Math.round(q.max * 100) : undefined } }),
      ...(q.q && { OR: [{ nome: { contains: q.q, mode: 'insensitive' } }, { documento: { contains: q.q.replace(/\D/g, '') || q.q, mode: 'insensitive' } }, { email: { contains: q.q.toLowerCase(), mode: 'insensitive' } }, { id: { contains: q.q, mode: 'insensitive' } }] }),
    };
    const [itens, total, agg] = await Promise.all([
      this.prisma.deposito.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * porPagina, take: porPagina }),
      this.prisma.deposito.count({ where }),
      this.prisma.deposito.aggregate({ where, _sum: { valorCentavos: true } }),
    ]);
    return { itens: itens.map(venda), total, pagina, porPagina, soma: reais(agg._sum.valorCentavos ?? 0) };
  }

  @Get('jogadores')
  async jogadores(@Query() q: JogadoresDto) {
    const pagina = q.pagina ?? 1, porPagina = q.porPagina ?? 20;
    const where: Prisma.JogadorWhereInput = q.q ? { OR: [{ email: { contains: q.q.toLowerCase(), mode: 'insensitive' } }, { nome: { contains: q.q, mode: 'insensitive' } }] } : {};
    const orderBy: Prisma.JogadorOrderByWithRelationInput = q.ordem === 'recente' ? { atualizadoEm: 'desc' } : q.ordem === 'nome' ? { nome: 'asc' } : { saldoCentavos: 'desc' };
    const [itens, total, agg] = await Promise.all([
      this.prisma.jogador.findMany({ where, orderBy, skip: (pagina - 1) * porPagina, take: porPagina }),
      this.prisma.jogador.count({ where }),
      this.prisma.jogador.aggregate({ where, _sum: { saldoCentavos: true } }),
    ]);
    return {
      itens: itens.map((j) => ({ email: j.email, nome: j.nome, saldo: reais(j.saldoCentavos), criadoEm: j.criadoEm, atualizadoEm: j.atualizadoEm })),
      total,
      pagina,
      porPagina,
      soma: reais(agg._sum.saldoCentavos ?? 0),
    };
  }

  @Get('bonus')
  async bonus(@Query() q: BonusDto) {
    const p = intervalo(q), pagina = q.pagina ?? 1, porPagina = q.porPagina ?? 20;
    const where: Prisma.BonusWhereInput = {
      criadoEm: p.where,
      ...(q.tipo && { tipo: q.tipo }),
      ...(q.q && { OR: [{ jogador: { contains: q.q.toLowerCase(), mode: 'insensitive' } }, { nome: { contains: q.q, mode: 'insensitive' } }] }),
    };
    const [itens, total, tipos] = await Promise.all([
      this.prisma.bonus.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * porPagina, take: porPagina }),
      this.prisma.bonus.count({ where }),
      this.prisma.bonus.groupBy({ by: ['tipo'], where, _sum: { valorCentavos: true }, _count: true }),
    ]);
    // bônus diário não guarda o nome: vem do último saldo informado pelo site
    const semNome = [...new Set(itens.filter((b) => !b.nome).map((b) => b.jogador))];
    const nomes = new Map((await this.prisma.jogador.findMany({ where: { email: { in: semNome } }, select: { email: true, nome: true } })).map((j) => [j.email, j.nome]));
    const doTipo = (tipo: string) => tipos.find((t) => t.tipo === tipo);
    const resumo = (tipo: string) => ({ quantidade: doTipo(tipo)?._count ?? 0, valor: reais(doTipo(tipo)?._sum.valorCentavos ?? 0) });
    return {
      itens: itens.map((b) => ({ id: b.id, tipo: b.tipo, jogador: b.jogador, nome: b.nome ?? nomes.get(b.jogador) ?? null, valor: reais(b.valorCentavos), criadoEm: b.criadoEm })),
      total,
      pagina,
      porPagina,
      soma: { valor: reais(tipos.reduce((a, t) => a + (t._sum.valorCentavos ?? 0), 0)), cadastro: resumo('cadastro'), diario: resumo('diario'), indicacao: resumo('indicacao') },
    };
  }

  @Post('ao-vivo/:id/derrubar-crash')
  derrubarCrash(@Param('id') id: string, @CurrentUser() user: { email: string }) {
    return this.aoVivo.derrubarCrash(id, user.email);
  }

  @Get('rodadas')
  async rodadas(@Query() q: RodadasDto) {
    const p = intervalo(q), pagina = q.pagina ?? 1, porPagina = q.porPagina ?? 20;
    const where: Prisma.RodadaWhereInput = {
      criadoEm: p.where,
      ...(q.jogo && { jogo: q.jogo }),
      ...(q.jogador && { jogador: { contains: q.jogador.toLowerCase(), mode: 'insensitive' } }),
      ...(q.resultado === 'ganhou' && { premioCentavos: { gt: 0 } }),
      ...(q.resultado === 'perdeu' && { premioCentavos: 0 }),
    };
    const [itens, total, agg] = await Promise.all([
      this.prisma.rodada.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * porPagina, take: porPagina }),
      this.prisma.rodada.count({ where }),
      this.prisma.rodada.aggregate({ where, _sum: { apostaCentavos: true, premioCentavos: true } }),
    ]);
    const apostado = agg._sum.apostaCentavos ?? 0, premios = agg._sum.premioCentavos ?? 0;
    return {
      itens: itens.map((r) => ({ id: r.id, jogo: r.jogo, nome: JOGOS[r.jogo]?.nome ?? r.jogo, jogador: r.jogador, aposta: reais(r.apostaCentavos), premio: reais(r.premioCentavos), lucro: reais(r.apostaCentavos - r.premioCentavos), criadoEm: r.criadoEm })),
      total,
      pagina,
      porPagina,
      soma: { apostado: reais(apostado), premios: reais(premios), lucro: reais(apostado - premios) },
    };
  }
}

function venda(d: { id: string; nome: string; documento: string; email: string | null; celular: string; valorCentavos: number; liquidoCentavos: number | null; status: string; statusBruto: string; criadoEm: Date; pagoEm: Date | null }) {
  return { id: d.id, nome: d.nome, documento: d.documento, email: d.email, celular: d.celular, valor: reais(d.valorCentavos), liquido: d.liquidoCentavos == null ? null : reais(d.liquidoCentavos), status: d.status, statusBruto: d.statusBruto, criadoEm: d.criadoEm, pagoEm: d.pagoEm };
}
