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
await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
console.log(`API rodando em http://localhost:${process.env.PORT ?? 3000}`);
