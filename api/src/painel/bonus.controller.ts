import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';

class ContaDto {
  @IsEmail() @MaxLength(254) email: string;
}

// Brasil não tem horário de verão desde 2019: o dia de Brasília começa às 03:00 UTC
const FUSO_MS = 3 * 3600_000;
const hoje = () => new Date(Date.now() - FUSO_MS).toISOString().slice(0, 10);
const inicioDeHoje = () => new Date(Date.parse(hoje() + 'T00:00:00Z') + FUSO_MS);

/**
 * Bônus diário do perfil: liga/desliga e valor no painel (Configurações). Só resgata quem apostou hoje
 * (pelo menos uma rodada com aposta registrada em nome da conta) e só uma vez por dia.
 * ponytail: as rodadas vêm do navegador e a conta se identifica só pelo e-mail (login ainda é local);
 * fica confiável quando o login e o sorteio forem pro servidor.
 */
@Controller('bonus-diario')
export class BonusController {
  constructor(private readonly prisma: PrismaService) {}

  private async estado(email: string) {
    const jogador = email.toLowerCase();
    const [cfg, apostas, resgate] = await Promise.all([
      this.prisma.configuracao.findUnique({ where: { id: 1 } }),
      this.prisma.rodada.aggregate({ where: { jogador, criadoEm: { gte: inicioDeHoje() } }, _sum: { apostaCentavos: true } }),
      this.prisma.bonusResgate.findUnique({ where: { jogador_dia: { jogador, dia: hoje() } } }),
    ]);
    return {
      jogador,
      ativo: !!cfg?.bonusDiarioAtivo,
      valorCentavos: cfg?.bonusDiarioCentavos ?? 500,
      apostadoHoje: (apostas._sum.apostaCentavos ?? 0) / 100,
      resgatadoHoje: !!resgate,
    };
  }

  @Get()
  async status(@Query() q: ContaDto) {
    const { jogador, valorCentavos, ...e } = await this.estado(q.email);
    return { ...e, valor: valorCentavos / 100 };
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resgatar(@Body() dto: ContaDto) {
    const e = await this.estado(dto.email);
    if (!e.ativo) throw new BadRequestException('O bônus diário está desligado.');
    if (e.resgatadoHoje) throw new ConflictException('Você já resgatou o bônus hoje. Volte amanhã!');
    if (e.apostadoHoje <= 0) throw new BadRequestException('Jogue pelo menos uma rodada hoje para liberar o bônus.');
    try {
      await this.prisma.bonusResgate.create({ data: { jogador: e.jogador, dia: hoje(), valorCentavos: e.valorCentavos } });
    } catch {
      throw new ConflictException('Você já resgatou o bônus hoje. Volte amanhã!'); // dois cliques ao mesmo tempo: o índice único segura
    }
    return { valor: e.valorCentavos / 100 };
  }
}
