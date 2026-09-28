// Copia os dados do SQLite antigo (prod.db) pro Postgres de DATABASE_URL, uma vez só, na troca de banco.
// Uso: node tools/sqlite-para-postgres.mjs [caminho/do/prod.db]
// Antes: `npx prisma migrate deploy` (cria as tabelas vazias). Recusa se alguma tabela do Postgres já tiver dados.
// Tudo numa transação: ou copia tudo, ou nada.
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

try {
  process.loadEnvFile();
} catch {
  // variáveis do ambiente
}
const arquivo = process.argv[2] ?? 'prod.db';
const url = process.env.DATABASE_URL;
if (!url?.startsWith('postgres')) throw new Error('DATABASE_URL precisa ser postgresql://...');

const lite = new DatabaseSync(arquivo, { readOnly: true });
const tabelas = lite
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'")
  .all()
  .map((t) => t.name);

const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  await db.query('BEGIN');
  for (const t of tabelas) {
    const tipos = new Map(
      (await db.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1', [t])).rows.map((r) => [r.column_name, r.data_type]),
    );
    if (!tipos.size) throw new Error(`Tabela "${t}" não existe no Postgres — rode prisma migrate deploy antes`);
    const { rows: [{ n }] } = await db.query(`SELECT count(*)::int AS n FROM "${t}"`);
    if (n) throw new Error(`"${t}" já tem ${n} linha(s) no Postgres — a cópia é só pra banco vazio`);

    const linhas = lite.prepare(`SELECT * FROM "${t}"`).all();
    for (const l of linhas) {
      const cols = Object.keys(l);
      const valores = cols.map((c) => {
        const v = l[c], tipo = tipos.get(c);
        if (!tipo) throw new Error(`Coluna "${t}.${c}" não existe no Postgres`);
        if (v == null) return null;
        // o Prisma no SQLite guarda DateTime como milissegundos (ou texto ISO) e Boolean como 0/1
        if (tipo.startsWith('timestamp')) return new Date(typeof v === 'bigint' ? Number(v) : v);
        if (tipo === 'boolean') return !!Number(v);
        return typeof v === 'bigint' ? Number(v) : v;
      });
      await db.query(`INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, valores);
    }
    // ids autoincrementais: a sequência continua depois do maior id copiado
    if (tipos.get('id') === 'integer') {
      await db.query(`SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT max(id) FROM "${t}"), 0) + 1, false)`);
    }
    console.log(`${t}: ${linhas.length}`);
  }
  await db.query('COMMIT');
  console.log('cópia concluída');
} catch (e) {
  await db.query('ROLLBACK');
  throw e;
} finally {
  await db.end();
}
