import { Module } from '@nestjs/common';
import { AdminInfluencersController, InfluencerPainelController, InfluencersSiteController } from './influencers.controller.js';
import { InfluencersService } from './influencers.service.js';

// o InfluencerGuard estende o AuthGuard: JwtService e Prisma vêm dos módulos globais
@Module({ controllers: [InfluencersSiteController, InfluencerPainelController, AdminInfluencersController], providers: [InfluencersService] })
export class InfluencersModule {}
