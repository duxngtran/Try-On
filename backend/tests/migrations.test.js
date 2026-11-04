import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadMigrationFiles, planMigrations } from '../scripts/lib/migrations.js';

const f = (filename, checksum) => ({ filename, checksum });

describe('planMigrations', () => {
  it('chỉ trả file chưa áp dụng, giữ thứ tự (chạy lần 2 không áp dụng lại)', () => {
    const files = [f('001_a.sql', 'h1'), f('002_b.sql', 'h2')];
    expect(
      planMigrations(files, new Map([['001_a.sql', 'h1']])).pending.map((x) => x.filename),
    ).toEqual(['002_b.sql']);
    expect(
      planMigrations(
        files,
        new Map([
          ['001_a.sql', 'h1'],
          ['002_b.sql', 'h2'],
        ]),
      ).pending,
    ).toEqual([]);
  });

  it('file đã áp dụng mà nội dung đổi -> lỗi', () => {
    expect(() => planMigrations([f('001_a.sql', 'new')], new Map([['001_a.sql', 'old']]))).toThrow(
      /đã đổi/,
    );
  });

  it('migration đã áp dụng nhưng file bị xóa -> lỗi', () => {
    expect(() => planMigrations([], new Map([['001_a.sql', 'h']]))).toThrow(/không còn file/);
  });
});

describe('loadMigrationFiles', () => {
  it('sắp theo tên và từ chối tên sai quy ước', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mig-'));
    await writeFile(path.join(dir, '002_b.sql'), 'select 2;');
    await writeFile(path.join(dir, '001_a.sql'), 'select 1;');
    expect((await loadMigrationFiles(dir)).map((x) => x.filename)).toEqual([
      '001_a.sql',
      '002_b.sql',
    ]);
    await writeFile(path.join(dir, 'bad.sql'), 'x');
    await expect(loadMigrationFiles(dir)).rejects.toThrow(/sai quy ước/);
  });
});
