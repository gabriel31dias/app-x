import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { setupApp } from './setup.js';

try {
  process.loadEnvFile();
} catch {
  // sem .env: variáveis vêm do ambiente (produção)
}

const app = setupApp(await NestFactory.create<NestExpressApplication>(AppModule));
// atrás do nginx: req.ip vem do X-Forwarded-For (o limite de login é por IP do jogador, não do proxy)
(app as NestExpressApplication).set('trust proxy', 'loopback');
// produção: HOST=127.0.0.1, só o nginx fala com a API
await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
console.log(`API rodando em http://localhost:${process.env.PORT ?? 3000}`);
