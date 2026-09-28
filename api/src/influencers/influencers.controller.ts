import { Body, Controller, createParamDecorator, ExecutionContext, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { Influencer, User } from '../generated/prisma/client.js';
import { InfluencerGuard } from './influencer.guard.js';
import { InfluencersService } from './influencers.service.js';

const InfluencerAtual = createParamDecorator((_: unknown, ctx: ExecutionContext): Influencer => ctx.switchToHttp().getRequest().influencer);
const SENHA = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

class IndicadoDto {
  @Matches(/^[A-Za-z0-9]{4,16}$/, { message: 'Código inválido' }) codigo: string;
  @IsEmail() @MaxLength(254) email: string;
  @Matches(/^[\d.\-\s]{11,14}$/, { message: 'CPF inválido' }) cpf: string;
  @IsOptional() @IsString() @MaxLength(120) nome?: string;
}

class PaginaDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) porPagina?: number;
}

class SaqueDto {
  @IsNumber({}, { message: 'Valor inválido' }) @Min(0.01, { message: 'Valor inválido' }) @Max(1_000_000) valor: number;
}

class CriarDto {
  @IsString() @MinLength(3, { message: 'Nome muito curto' }) @MaxLength(120) nome: string;
  @IsEmail({}, { message: 'E-mail inválido' }) @MaxLength(254) email: string;
  @Matches(/^[\d.\-\s]{11,14}$/, { message: 'CPF inválido' }) cpf: string;
  @Matches(/^[\d()\-\s+]{10,20}$/, { message: 'Celular inválido' }) celular: string;
  @IsString() @MinLength(3, { message: 'Informe a chave PIX' }) @MaxLength(140) chavePix: string;
  @Matches(SENHA, { message: 'Mínimo 8 caracteres, com letras e números' }) senha: string;
}

class AtualizarDto {
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsString() @MinLength(3, { message: 'Informe a chave PIX' }) @MaxLength(140) chavePix?: string;
  @IsOptional() @Matches(SENHA, { message: 'Mínimo 8 caracteres, com letras e números' }) senha?: string;
}

class ListaDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
}

class SaquesDto extends PaginaDto {
  @IsOptional() @IsIn(['pendente', 'pago', 'cancelado']) status?: string;
}

class CancelarDto {
  @IsOptional() @IsString() @MaxLength(200) motivo?: string;
}

// site: conta criada pelo link ?inf=
@Controller('influencers')
export class InfluencersSiteController {
  constructor(private readonly inf: InfluencersService) {}

  @Post('indicado')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // por IP: várias pessoas no mesmo Wi-Fi/4G se cadastrando pelo link
  indicado(@Body() dto: IndicadoDto) {
    return this.inf.registrarIndicado(dto.codigo, dto);
  }
}

// dashboard do próprio influencer (login no painel)
@Controller('influencer')
@UseGuards(InfluencerGuard)
export class InfluencerPainelController {
  constructor(private readonly inf: InfluencersService) {}

  @Get('me')
  me(@InfluencerAtual() i: Influencer) {
    return this.inf.painel(i.id);
  }

  @Get('inscritos')
  inscritos(@InfluencerAtual() i: Influencer, @Query() q: PaginaDto) {
    return this.inf.inscritos(i.id, q.pagina ?? 1, q.porPagina ?? 20);
  }

  @Post('saques')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  saque(@InfluencerAtual() i: Influencer, @Body() dto: SaqueDto) {
    return this.inf.pedirSaque(i.id, dto.valor);
  }
}

@Controller('admin/influencers')
@UseGuards(AdminGuard)
export class AdminInfluencersController {
  constructor(private readonly inf: InfluencersService) {}

  @Get()
  listar(@Query() q: ListaDto) {
    return this.inf.listar(q.q);
  }

  @Post()
  async criar(@Body() dto: CriarDto, @CurrentUser() u: User) {
    const i = await this.inf.criar(dto, u.email);
    return { id: i.id, codigo: i.codigo };
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarDto) {
    return this.inf.atualizar(id, dto);
  }

  @Get('saques')
  saques(@Query() q: SaquesDto) {
    return this.inf.saques(q.status, q.pagina ?? 1, q.porPagina ?? 20);
  }

  @Put('saques/:id/aprovar')
  aprovar(@Param('id') id: string, @CurrentUser() u: User) {
    return this.inf.decidir(id, 'pago', u.email);
  }

  @Put('saques/:id/cancelar')
  cancelar(@Param('id') id: string, @Body() dto: CancelarDto, @CurrentUser() u: User) {
    return this.inf.decidir(id, 'cancelado', u.email, dto.motivo);
  }
}
