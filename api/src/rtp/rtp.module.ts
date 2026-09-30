import { Module } from '@nestjs/common';
import { AutoBalancoService, ConfigController, SiteController } from './auto-balanco.js';
import { RtpController } from './rtp.controller.js';

@Module({ controllers: [RtpController, ConfigController, SiteController], providers: [AutoBalancoService] })
export class RtpModule {}
