import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const MIGRATION_NAME = /^(\d{3})_[a-z0-9_]+\.sql$/;

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Đọc `migrations/NNN_*.sql`, sắp theo tên; file sai quy ước tên bị báo lỗi (tránh bỏ sót im lặng). */
export async function loadMigrationFiles(dir) {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort();
  const bad = names.filter((n) => !MIGRATION_NAME.test(n));
  if (bad.length) throw new Error(`Tên migration sai quy ước NNN_ten.sql: ${bad.join(', ')}`);
  return Promise.all(
    names.map(async (filename) => {
      const sql = await readFile(path.join(dir, filename), 'utf8');
      return { filename, sql, checksum: sha256(sql) };
    }),
  );
}

/**
 * So khớp file với bảng schema_migrations (D-19).
 * @param {{filename:string, checksum:string}[]} files
 * @param {Map<string,string>} applied filename -> checksum đã áp dụng
 * @returns {{pending: typeof files}} file chưa áp dụng, theo thứ tự chạy
 * @throws file đã áp dụng mà checksum đổi, hoặc migration đã áp dụng nhưng file bị xóa
 */
export function planMigrations(files, applied) {
  const present = new Set(files.map((f) => f.filename));
  for (const name of applied.keys()) {
    if (!present.has(name)) throw new Error(`Migration đã áp dụng nhưng không còn file: ${name}`);
  }
  const pending = [];
  for (const file of files) {
    const appliedChecksum = applied.get(file.filename);
    if (appliedChecksum === undefined) pending.push(file);
    else if (appliedChecksum !== file.checksum) {
      throw new Error(
        `Migration ${file.filename} đã áp dụng nhưng nội dung đã đổi. Không sửa migration cũ, hãy viết file mới.`,
      );
    }
  }
  return { pending };
}
