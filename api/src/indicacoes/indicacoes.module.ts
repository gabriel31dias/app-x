import { Module } from '@nestjs/common';
import { AdminIndicacoesController, IndicacoesController } from './indicacoes.controller.js';
import { IndicacoesService } from './indicacoes.service.js';

@Module({ controllers: [IndicacoesController, AdminIndicacoesController], providers: [IndicacoesService] })
export class IndicacoesModule {}
