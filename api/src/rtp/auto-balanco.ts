import { Body, Controller, Get, Injectable, OnModuleDestroy, OnModuleInit, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JOGOS, RTP_MIN } from './rtp.controller.js';

const POR = 'auto-balanço';
const JANELAS = [24, 168, 720]; // 24 h, 7 dias, 30 dias

/**
 * Auto-balanço: se o lucro dos jogos (apostado − prêmios) na janela ficar negativo, ou (com a meta por hora ligada)
 * o lucro da última hora ficar abaixo da meta, guarda o RTP de cada jogo e põe todos no mínimo; quando as regras
 * ligadas voltarem a ser atendidas (janela positiva e hora na meta), devolve os RTPs guardados. Vale igual pra todos os
 * jogadores e aparece pra eles (rtp-live.js avisa e redesenha a tabela). Confere a cada minuto.
 * ponytail: o lucro vem das rodadas informadas pelos jogos no navegador; fica confiável com o sorteio no servidor
 */
@Injectable()
export class AutoBalancoService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.verificar().catch((e) => console.error('auto-balanço:', e)), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  config() {
    return this.prisma.configuracao.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  /** lucro da casa (centavos) nas últimas `horas` */
  async lucro(horas: number) {
    const r = await this.prisma.rodada.aggregate({
      where: { criadoEm: { gte: new Date(Date.now() - horas * 3600_000) } },
      _sum: { apostaCentavos: true, premioCentavos: true },
    });
    return (r._sum.apostaCentavos ?? 0) - (r._sum.premioCentavos ?? 0);
  }

  /** liga/desliga o RTP mínimo conforme o lucro; devolve o estado depois da checagem */
  async verificar() {
    const c = await this.config();
    const [lucro, lucroHora] = await Promise.all([this.lucro(c.janelaHoras), this.lucro(1)]);
    const porJanela = c.autoBalanco && lucro < 0, porHora = c.metaHoraAtiva && lucroHora < c.metaHoraCentavos;
    // volta só com folga: janela acima de zero (não igual) e a hora na meta; hora parada dá 0 e não baixa com meta 0
    const ok = (!c.autoBalanco || lucro > 0) && (!c.metaHoraAtiva || lucroHora >= c.metaHoraCentavos);
    if (!c.balancoAtivo && (porJanela || porHora)) await this.baixar(porJanela && porHora ? 'janela+hora' : porJanela ? 'janela' : 'hora');
    else if (c.balancoAtivo && ok) await this.restaurar();
    const { metaHoraCentavos, bonusDiarioCentavos, saqueMinimoCentavos, indicacaoCentavos, ...resto } = await this.config();
    return { ...resto, metaHora: metaHoraCentavos / 100, bonusDiario: bonusDiarioCentavos / 100, saqueMinimo: saqueMinimoCentavos / 100, indicacao: indicacaoCentavos / 100, lucroJanela: lucro / 100, lucroHora: lucroHora / 100 };
  }

  private async baixar(motivo: string) {
    const rows = new Map((await this.prisma.gameRtp.findMany()).map((r) => [r.jogo, r.rtp]));
    const antes = Object.fromEntries(Object.keys(JOGOS).map((j) => [j, rows.get(j) ?? null]));
    await this.prisma.$transaction([
      ...Object.keys(JOGOS).flatMap((jogo) => [
        this.prisma.gameRtp.upsert({ where: { jogo }, create: { jogo, rtp: RTP_MIN, atualizadoPor: POR }, update: { rtp: RTP_MIN, atualizadoPor: POR } }),
        this.prisma.rtpAlteracao.create({ data: { jogo, de: antes[jogo], para: RTP_MIN, por: POR } }),
      ]),
      this.prisma.configuracao.update({ where: { id: 1 }, data: { balancoAtivo: true, motivoBalanco: motivo, rtpsAntes: JSON.stringify(antes), ativadoEm: new Date() } }),
    ]);
  }

  private async restaurar() {
    const c = await this.config();
    const antes: Record<string, number | null> = JSON.parse(c.rtpsAntes ?? '{}');
    await this.prisma.$transaction([
      ...Object.keys(JOGOS).flatMap((jogo) => {
        const rtp = antes[jogo] ?? null;
        return [
          // null = estava no de fábrica: apaga a linha e o jogo volta pro RTP do próprio motor
          rtp == null
            ? this.prisma.gameRtp.deleteMany({ where: { jogo } })
            : this.prisma.gameRtp.upsert({ where: { jogo }, create: { jogo, rtp, atualizadoPor: POR }, update: { rtp, atualizadoPor: POR } }),
          this.prisma.rtpAlteracao.create({ data: { jogo, de: RTP_MIN, para: rtp ?? JOGOS[jogo].fabrica, por: POR } }),
        ];
      }),
      this.prisma.configuracao.update({ where: { id: 1 }, data: { balancoAtivo: false, motivoBalanco: null, rtpsAntes: null, ativadoEm: null } }),
    ]);
  }
}

class ConfigDto {
  @IsBoolean() autoBalanco: boolean;
  @IsIn(JANELAS, { message: 'Janela inválida' }) janelaHoras: number;
  @IsOptional() @IsBoolean() metaHoraAtiva?: boolean;
  @IsOptional() @IsBoolean() saqueExigeDeposito?: boolean;
  @IsOptional() @IsNumber({}, { message: 'Valor inválido' }) @Min(1, { message: 'O mínimo de saque tem que ser pelo menos R$ 1' }) @Max(50_000) saqueMinimo?: number;
  @IsOptional() @IsBoolean() bonusDiarioAtivo?: boolean;
  @IsOptional() @IsNumber({}, { message: 'Valor inválido' }) @Min(0.01, { message: 'O bônus precisa ser maior que zero' }) @Max(1000, { message: 'Máximo R$ 1.000' }) bonusDiario?: number;
  @IsOptional() @IsBoolean() indicacaoAtiva?: boolean;
  @IsOptional() @IsNumber({}, { message: 'Valor inválido' }) @Min(0.01, { message: 'O valor precisa ser maior que zero' }) @Max(1000, { message: 'Máximo R$ 1.000' }) indicacao?: number;
  @IsOptional() @IsInt({ message: 'Número inteiro' }) @Min(0) @Max(1000) indicacaoMinRodadas?: number;
  @IsOptional() @IsNumber({}, { message: 'Meta inválida' }) @Min(0, { message: 'A meta não pode ser negativa' }) @Max(1_000_000) metaHora?: number;
}

@Controller('admin/config')
@UseGuards(AdminGuard)
export class ConfigController {
  constructor(
    private readonly auto: AutoBalancoService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  get() {
    return this.auto.verificar();
  }

  @Put()
  async set(@Body() dto: ConfigDto, @CurrentUser() user: User) {
    await this.auto.config();
    const { metaHora, bonusDiario, saqueMinimo, indicacao, ...resto } = dto;
    await this.prisma.configuracao.update({
      where: { id: 1 },
      data: {
        ...resto,
        ...(metaHora != null && { metaHoraCentavos: Math.round(metaHora * 100) }),
        ...(bonusDiario != null && { bonusDiarioCentavos: Math.round(bonusDiario * 100) }),
        ...(saqueMinimo != null && { saqueMinimoCentavos: Math.round(saqueMinimo * 100) }),
        ...(indicacao != null && { indicacaoCentavos: Math.round(indicacao * 100) }),
        atualizadoPor: user.email,
      },
    });
    return this.auto.verificar(); // aplica na hora: ligar com a casa negativa já baixa; desligar já restaura
  }
}
