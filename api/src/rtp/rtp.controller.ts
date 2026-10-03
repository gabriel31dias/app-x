import { Body, ConflictException, Controller, Delete, Get, Header, NotFoundException, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsNumber, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// jogos com motor próprio. `fabrica` = RTP do motor sem ajuste; tem que bater com o BASE de cada <jogo>.js
export const JOGOS: Record<string, { nome: string; fabrica: number }> = {
  capivara: { nome: 'Capivara da Sorte', fabrica: 0.97 },
  gatinho: { nome: 'Gatinho Flash', fabrica: 0.97 },
  papagaio: { nome: 'Papagaio Gay', fabrica: 0.97 },
  macaco: { nome: 'Macaco Pelado', fabrica: 0.95 },
  raspa: { nome: 'Raspadinha Premiada', fabrica: 0.96 },
  bichos: { nome: 'Bichos da Sorte', fabrica: 0.96 },
  crash: { nome: 'Galinha Angola Crash', fabrica: 0.97 },
  truco: { nome: 'Truco Aposta', fabrica: 0.96 },
  sinuca: { nome: 'Sinuca Aposta', fabrica: 0.96 },
  velha: { nome: 'Jogo da Velha Aposta', fabrica: 0.96 },
  perereca: { nome: 'Perereca Suicida', fabrica: 0.96 },
  sapo: { nome: 'Sapinho Pulador Crash', fabrica: 0.96 },
  lulinha: { nome: 'Lulinha', fabrica: 0.96 },
  crodila: { nome: 'Crodila Transex', fabrica: 0.96 },
  pato: { nome: 'Pato Bolado Crash', fabrica: 0.96 },
  urubu: { nome: 'Urubuzinho Carioca', fabrica: 0.96 },
  calango: { nome: 'Calango do Nordeste', fabrica: 0.96 },
  penalti: { nome: 'Pênalti na Várzea', fabrica: 0.85 },
  jegues: { nome: 'Corrida dos Jegues', fabrica: 0.90 },
  tartarugas: { nome: 'Corrida das Toruguitas', fabrica: 0.90 },
  lagartas: { nome: 'Corrida das Lagartas', fabrica: 0.90 },
  velhinhas: { nome: 'Corrida das Velhinhas', fabrica: 0.90 },
  briga: { nome: 'Briga de Bêbados', fabrica: 0.92 },
  barriga: { nome: 'Barriguinho', fabrica: 0.96 },
  dragao: { nome: 'Dragão da Sorte', fabrica: 0.965 },
  hipopota: { nome: 'Hipopota do Job', fabrica: 0.965 },
  tigrinho: { nome: 'Tigrinho Bolado', fabrica: 0.965 },
  lalau: { nome: 'Jogo do Lalau', fabrica: 0.965 },
};

// piso de 85% (mínimo exigido pela SPA pra jogo online); acima de 99% a casa perde dinheiro na prática
export const RTP_MIN = 0.85, RTP_MAX = 0.99;

class SetRtpDto {
  @IsNumber({}, { message: 'RTP inválido' })
  @Min(RTP_MIN, { message: `Mínimo ${RTP_MIN * 100}%` })
  @Max(RTP_MAX, { message: `Máximo ${RTP_MAX * 100}%` })
  rtp: number;
}

const normalizarEmail = (email?: string | null) => email?.trim().toLowerCase() || null;

function jogadorDaReq(req: Request, query?: string) {
  const q = normalizarEmail(query);
  if (q) return q;
  const cookie = req.headers.cookie ?? '';
  const item = cookie.split(';').map((x) => x.trim()).find((x) => x.startsWith('orama_session='));
  return item ? normalizarEmail(decodeURIComponent(item.slice('orama_session='.length))) : null;
}

@Controller()
export class RtpController {
  constructor(private readonly prisma: PrismaService) {}

  private async mapaRtp(jogador?: string | null) {
    const email = normalizarEmail(jogador);
    const [globais, especificos] = await Promise.all([
      this.prisma.gameRtp.findMany(),
      email ? this.prisma.jogadorRtp.findMany({ where: { email } }) : Promise.resolve([]),
    ]);
    return {
      globais: new Map(globais.map((r) => [r.jogo, r])),
      especificos: new Map(especificos.map((r) => [r.jogo, r])),
    };
  }

  private async rtpPublico(jogador?: string | null) {
    const { globais, especificos } = await this.mapaRtp(jogador);
    const out: Record<string, number> = {};
    for (const jogo of Object.keys(JOGOS)) {
      const rtp = especificos.get(jogo)?.rtp ?? globais.get(jogo)?.rtp;
      if (rtp != null) out[jogo] = rtp;
    }
    return out;
  }

  /** carregado com <script> por cada jogo ANTES do motor: define window.RTP_JOGOS */
  @Get('rtp.js')
  @Header('content-type', 'text/javascript; charset=utf-8')
  @Header('cache-control', 'no-store')
  async script(@Req() req: Request, @Query('jogador') jogador?: string) {
    const inicial = JSON.stringify(await this.rtpPublico(jogadorDaReq(req, jogador)));
    return `window.RTP_JOGOS=${inicial};try{var j=localStorage.getItem('orama_session');if(j){var x=new XMLHttpRequest();x.open('GET','api/rtp?jogador='+encodeURIComponent(j),false);x.send();if(x.status>=200&&x.status<300)window.RTP_JOGOS=JSON.parse(x.responseText)||window.RTP_JOGOS;}}catch(e){}`;
  }

  /** mesma coisa em JSON: o rtp-live.js de cada jogo consulta a cada 10 s pra trocar o RTP com o jogo aberto */
  @Get('rtp')
  @Header('cache-control', 'no-store')
  async json(@Req() req: Request, @Query('jogador') jogador?: string) {
    return this.rtpPublico(jogadorDaReq(req, jogador));
  }

  @Get('admin/rtp')
  @UseGuards(AdminGuard)
  async list() {
    const rows = new Map((await this.prisma.gameRtp.findMany()).map((r) => [r.jogo, r]));
    return {
      min: RTP_MIN,
      max: RTP_MAX,
      jogos: Object.entries(JOGOS).map(([jogo, j]) => {
        const r = rows.get(jogo);
        return { jogo, ...j, rtp: r?.rtp ?? j.fabrica, atualizadoPor: r?.atualizadoPor ?? null, atualizadoEm: r?.atualizadoEm ?? null };
      }),
    };
  }

  @Put('admin/rtp/:jogo')
  @UseGuards(AdminGuard)
  async set(@Param('jogo') jogo: string, @Body() dto: SetRtpDto, @CurrentUser() user: User) {
    if (!JOGOS[jogo]) throw new NotFoundException('Jogo não existe');
    if ((await this.prisma.configuracao.findUnique({ where: { id: 1 } }))?.balancoAtivo)
      throw new ConflictException('Auto-balanço ativo: os RTPs voltam sozinhos quando a casa ficar positiva. Desligue em Configurações pra mudar na mão.');
    const rtp = Math.round(dto.rtp * 10000) / 10000; // 0,01% de precisão
    const antes = await this.prisma.gameRtp.findUnique({ where: { jogo } });
    const [row] = await this.prisma.$transaction([
      this.prisma.gameRtp.upsert({ where: { jogo }, create: { jogo, rtp, atualizadoPor: user.email }, update: { rtp, atualizadoPor: user.email } }),
      this.prisma.rtpAlteracao.create({ data: { jogo, de: antes?.rtp ?? null, para: rtp, por: user.email } }),
    ]);
    return row;
  }

  @Get('admin/rtp/historico')
  @UseGuards(AdminGuard)
  historico() {
    return this.prisma.rtpAlteracao.findMany({ orderBy: { id: 'desc' }, take: 100 });
  }

  @Get('admin/jogadores/:email/rtp')
  @UseGuards(AdminGuard)
  async jogadorRtp(@Param('email') rawEmail: string) {
    const email = normalizarEmail(decodeURIComponent(rawEmail));
    if (!email) throw new NotFoundException('Jogador não existe');
    const jogador = await this.prisma.jogador.findUnique({ where: { email } });
    if (!jogador) throw new NotFoundException('Jogador não existe');
    const { globais, especificos } = await this.mapaRtp(email);
    return {
      jogador: { email: jogador.email, nome: jogador.nome },
      min: RTP_MIN,
      max: RTP_MAX,
      jogos: Object.entries(JOGOS).map(([jogo, j]) => {
        const global = globais.get(jogo);
        const especifico = especificos.get(jogo);
        return {
          jogo,
          ...j,
          globalRtp: global?.rtp ?? j.fabrica,
          rtp: especifico?.rtp ?? global?.rtp ?? j.fabrica,
          especifico: especifico?.rtp ?? null,
          atualizadoPor: especifico?.atualizadoPor ?? null,
          atualizadoEm: especifico?.atualizadoEm ?? null,
        };
      }),
    };
  }

  @Put('admin/jogadores/:email/rtp/:jogo')
  @UseGuards(AdminGuard)
  async setJogadorRtp(@Param('email') rawEmail: string, @Param('jogo') jogo: string, @Body() dto: SetRtpDto, @CurrentUser() user: User) {
    if (!JOGOS[jogo]) throw new NotFoundException('Jogo não existe');
    const email = normalizarEmail(decodeURIComponent(rawEmail));
    if (!email) throw new NotFoundException('Jogador não existe');
    const jogador = await this.prisma.jogador.findUnique({ where: { email } });
    if (!jogador) throw new NotFoundException('Jogador não existe');
    const rtp = Math.round(dto.rtp * 10000) / 10000;
    const antes = await this.prisma.jogadorRtp.findUnique({ where: { email_jogo: { email, jogo } } });
    const [row] = await this.prisma.$transaction([
      this.prisma.jogadorRtp.upsert({ where: { email_jogo: { email, jogo } }, create: { email, jogo, rtp, atualizadoPor: user.email }, update: { rtp, atualizadoPor: user.email } }),
      this.prisma.jogadorRtpAlteracao.create({ data: { email, jogo, de: antes?.rtp ?? null, para: rtp, por: user.email } }),
    ]);
    return row;
  }

  @Delete('admin/jogadores/:email/rtp/:jogo')
  @UseGuards(AdminGuard)
  async deleteJogadorRtp(@Param('email') rawEmail: string, @Param('jogo') jogo: string, @CurrentUser() user: User) {
    if (!JOGOS[jogo]) throw new NotFoundException('Jogo não existe');
    const email = normalizarEmail(decodeURIComponent(rawEmail));
    if (!email) throw new NotFoundException('Jogador não existe');
    const antes = await this.prisma.jogadorRtp.findUnique({ where: { email_jogo: { email, jogo } } });
    if (!antes) return { ok: true };
    await this.prisma.$transaction([
      this.prisma.jogadorRtp.delete({ where: { email_jogo: { email, jogo } } }),
      this.prisma.jogadorRtpAlteracao.create({ data: { email, jogo, de: antes.rtp, para: null, por: user.email } }),
    ]);
    return { ok: true };
  }
}
