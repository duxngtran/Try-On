import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { generateFixtures } from '../scripts/generate-fixtures.js';

describe('script sinh ảnh fixture', () => {
  let files;
  beforeAll(async () => {
    files = await generateFixtures(await mkdtemp(path.join(tmpdir(), 'fx-')));
  }, 60000);

  it('JPG chính có EXIF GPS; ảnh xoay có orientation 6', async () => {
    const meta = await sharp(files['valid-1080x1920-gps.jpg']).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1920]);
    expect(meta.exif).toBeDefined();
    const rotated = await sharp(files['valid-rotated-exif6.jpg']).metadata();
    expect(rotated.orientation).toBe(6);
  });

  it('có ảnh cạnh 9000 px và file > 10 MB', async () => {
    const meta = await sharp(files['too-long-edge-600x9000.jpg']).metadata();
    expect(meta.height).toBe(9000);
    expect((await stat(files['too-large-over-10mb.jpg'])).size).toBeGreaterThan(10 * 1024 * 1024);
  });
});
