import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { DepositsModule } from './deposits/deposits.module.js';
import { IndicacoesModule } from './indicacoes/indicacoes.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { PainelModule } from './painel/painel.module.js';
import { RtpModule } from './rtp/rtp.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), // 120 req/min por IP no geral
    PrismaModule,
    AuthModule,
    ProfileModule,
    DepositsModule,
    RtpModule,
    PainelModule,
    IndicacoesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
