import { BadRequestException, INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

// configuração compartilhada entre main.ts e os testes
export function setupApp(app: INestApplication) {
  const origins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins?.length ? origins : true });
  (app as NestExpressApplication).useStaticAssets(join(import.meta.dirname, '..', 'public'));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // { erros: { campo: "mensagem" } } — fácil de mostrar embaixo de cada campo no site
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: 'Dados inválidos',
          erros: Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})[0]])),
        }),
    }),
  );
  return app;
}
