import { Module } from '@nestjs/common';
import { AoVivoGateway } from './ao-vivo.gateway.js';
import { BonusController } from './bonus.controller.js';
import { PainelController } from './painel.controller.js';
import { RodadasController, SaldosController } from './rodadas.controller.js';
import { AdminSaquesController, SaquesController } from './saques.controller.js';

@Module({ controllers: [PainelController, BonusController, RodadasController, SaldosController, SaquesController, AdminSaquesController], providers: [AoVivoGateway] })
export class PainelModule {}
