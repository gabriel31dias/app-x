import { Module } from '@nestjs/common';
import { AutoBalancoService, ConfigController } from './auto-balanco.js';
import { RtpController } from './rtp.controller.js';

@Module({ controllers: [RtpController, ConfigController], providers: [AutoBalancoService] })
export class RtpModule {}
