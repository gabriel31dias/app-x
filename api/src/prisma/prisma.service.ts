import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Configure DATABASE_URL (postgresql://...) no .env da API');
    // ?schema= (os testes usam "e2e") o driver pg não entende: vai pro adapter
    const schema = new URL(url).searchParams.get('schema') ?? undefined;
    super({ adapter: new PrismaPg({ connectionString: url }, { schema }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
