import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { IsEmail, Matches, MaxLength } from 'class-validator';
import { DepositsService } from './deposits.service.js';
import { CreatePixDepositDto } from './dto/create-pix-deposit.dto.js';

class ContaDto {
  @IsEmail() @MaxLength(254) email: string;
  @Matches(/^[\d.\-\s]{11,14}$/, { message: 'CPF inválido' }) cpf: string;
}

// o site consulta o PIX da tela a cada 3 s e a conta a cada 30 s; várias abas/aparelhos no mesmo IP (Wi-Fi, 4G com NAT)
// não podem cair no limite geral de 120/min
@Controller('depositos')
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post()
  @Throttle({ default: { limit: 15, ttl: 60_000 } }) // gerar cobrança: 15/min por IP basta
  create(@Body() dto: CreatePixDepositDto) {
    return this.deposits.create(dto);
  }

  // cadastrar no painel da Pluggou: https://jogos.oramagames.site/api/depositos/webhook/pluggou
  @Post('webhook/pluggou')
  @HttpCode(200)
  @SkipThrottle()
  webhookPluggou(@Headers('x-webhook-code') codigo: string | undefined, @Body() body: { data?: { id?: unknown } }) {
    return this.deposits.webhookPluggou(codigo, body);
  }

  // pagos e ainda não creditados desta conta (o site chama ao abrir e ao entrar)
  @Get('conta')
  conta(@Query() q: ContaDto) {
    return this.deposits.conta(q.email, q.cpf);
  }

  @Post(':id/credito')
  @HttpCode(200)
  creditar(@Param('id') id: string, @Body() dto: ContaDto) {
    return this.deposits.creditar(id, dto.email, dto.cpf);
  }

  @Get(':id')
  find(@Param('id') id: string) {
    return this.deposits.find(id);
  }
}
