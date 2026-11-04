// Chạy: npm run migrate (cần DATABASE_URL trong backend/.env). Thiết kế: sprint-01/design/db/README.md mục 7.2.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadMigrationFiles, planMigrations } from './lib/migrations.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

const CREATE_TRACKING_TABLE = `
  create table if not exists public.schema_migrations (
    filename   text primary key,
    checksum   text not null,
    applied_at timestamptz not null default now()
  );
  alter table public.schema_migrations enable row level security;
  revoke all on public.schema_migrations from anon, authenticated;
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Thiếu DATABASE_URL trong backend/.env');
  if (/:6543\b/.test(url)) {
    console.warn(
      'Cảnh báo: cổng 6543 là transaction pooler; DDL nên dùng direct/session connection (cổng 5432).',
    );
  }

  const files = await loadMigrationFiles(MIGRATIONS_DIR);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(CREATE_TRACKING_TABLE);
    const { rows } = await client.query('select filename, checksum from public.schema_migrations');
    const { pending } = planMigrations(files, new Map(rows.map((r) => [r.filename, r.checksum])));

    if (pending.length === 0) {
      console.log('Không có migration mới.');
      return;
    }
    for (const file of pending) {
      try {
        await client.query('begin');
        await client.query(file.sql);
        await client.query(
          'insert into public.schema_migrations (filename, checksum) values ($1, $2)',
          [file.filename, file.checksum],
        );
        await client.query('commit');
        console.log(`Đã áp dụng: ${file.filename}`);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file.filename} lỗi (đã rollback): ${err.message}`, {
          cause: err,
        });
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
