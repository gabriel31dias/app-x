import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard.js';
import type { Prisma } from '../generated/prisma/client.js';
import { IndicacoesService } from './indicacoes.service.js';

class ContaDto {
  @IsEmail() @MaxLength(254) email: string;
  @Matches(/^[\d.\-\s]{11,14}$/, { message: 'CPF inválido' }) cpf: string;
  @IsOptional() @IsString() @MaxLength(120) nome?: string;
}

class RegistrarDto extends ContaDto {
  @Matches(/^[A-Za-z0-9]{4,16}$/, { message: 'Código inválido' }) codigo: string;
}

class AdminDto {
  @IsOptional() @IsIn(['pendente', 'liberada', 'recebida']) status?: string;
  @IsOptional() @IsString() @MaxLength(254) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) porPagina?: number;
}

@Controller('indicacoes')
export class IndicacoesController {
  constructor(private readonly indicacoes: IndicacoesService) {}

  // o site chama ao abrir, ao entrar e a cada 30 s (link, indicados e o que já dá pra creditar)
  @Get('minhas')
  minhas(@Query() q: ContaDto) {
    return this.indicacoes.minhas(q);
  }

  // logo depois de criar a conta, se ela veio de um link ?ref=
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  registrar(@Body() dto: RegistrarDto) {
    return this.indicacoes.registrar(dto.codigo, dto);
  }

  @Post(':id/credito')
  @HttpCode(200)
  creditar(@Param('id') id: string, @Body() dto: ContaDto) {
    return this.indicacoes.creditar(id, dto);
  }
}

@Controller('admin/indicacoes')
@UseGuards(AdminGuard)
export class AdminIndicacoesController {
  constructor(private readonly indicacoes: IndicacoesService) {}

  @Get()
  listar(@Query() q: AdminDto) {
    const where: Prisma.IndicacaoWhereInput = {
      ...(q.status === 'pendente' && { status: 'pendente' }),
      ...(q.status === 'liberada' && { status: 'liberada', creditadoEm: null }),
      ...(q.status === 'recebida' && { creditadoEm: { not: null } }),
      ...(q.q && { OR: [{ indicador: { contains: q.q.toLowerCase(), mode: 'insensitive' } }, { indicado: { contains: q.q.toLowerCase(), mode: 'insensitive' } }, { indicadoNome: { contains: q.q, mode: 'insensitive' } }, { codigo: { contains: q.q.toUpperCase(), mode: 'insensitive' } }] }),
    };
    return this.indicacoes.admin(where, q.pagina ?? 1, q.porPagina ?? 20);
  }
}
