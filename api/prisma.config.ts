import { defineConfig, env } from 'prisma/config';

try {
  process.loadEnvFile();
} catch {
  // sem .env: variáveis vêm do ambiente
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
