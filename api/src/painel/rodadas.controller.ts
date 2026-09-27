import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsEmail, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { JOGOS } from '../rtp/rtp.controller.js';

class RodadaDto {
  @IsIn(Object.keys(JOGOS))
  jogo: string;

  @IsNumber()
  @Min(0.01)
  @Max(100_000)
  aposta: number;

  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  premio: number;

  @IsString()
  @Matches(/^[\w-]{8,64}$/)
  chave: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  jogador?: string;
}

const centavos = (reais: number) => Math.round(reais * 100);

// ponytail: o jogo roda no navegador, então esses números são "o que o jogo disse".
// Confiável só quando o sorteio for pro servidor (docs/plano-logica-de-ganho.md).
@Controller('rodadas')
export class RodadasController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async create(@Body() dto: RodadaDto) {
    const data = { chave: dto.chave, jogo: dto.jogo, apostaCentavos: centavos(dto.aposta), premioCentavos: centavos(dto.premio), jogador: dto.jogador?.toLowerCase() || null };
    // reenvio da mesma chave não conta duas vezes
    await this.prisma.rodada.upsert({ where: { chave: dto.chave }, create: data, update: {} });
  }
}

class SaldoDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nome: string;

  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  saldo: number;
}

// ponytail: mesmo caso das rodadas, é o saldo que o aparelho diz ter. Vira carteira no servidor depois.
@Controller('saldos')
export class SaldosController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async informar(@Body() dto: SaldoDto) {
    const email = dto.email.toLowerCase(), data = { nome: dto.nome.trim(), saldoCentavos: centavos(dto.saldo) };
    await this.prisma.jogador.upsert({ where: { email }, create: { email, ...data }, update: data });
  }
}
