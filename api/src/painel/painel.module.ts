import { Module } from '@nestjs/common';
import { AoVivoGateway } from './ao-vivo.gateway.js';
import { AdminBonusController, BonusCadastroController, BonusController, BonusManualController } from './bonus.controller.js';
import { PainelController } from './painel.controller.js';
import { RodadasController, SaldosController } from './rodadas.controller.js';
import { AdminSaquesController, SaquesController } from './saques.controller.js';

@Module({ controllers: [PainelController, BonusController, BonusCadastroController, BonusManualController, AdminBonusController, RodadasController, SaldosController, SaquesController, AdminSaquesController], providers: [AoVivoGateway] })
export class PainelModule {}
