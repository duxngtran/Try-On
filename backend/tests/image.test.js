import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { generateFixtures } from '../scripts/generate-fixtures.js';
import { processProfilePhoto } from '../src/services/image.js';

let files;
const load = (name) => readFile(files[name]);
const codeOf = async (buffer) => {
  try {
    await processProfilePhoto(buffer);
  } catch (err) {
    return err.code;
  }
  return 'OK';
};
const solid = (width, height, orientation) => {
  const img = sharp({ create: { width, height, channels: 3, background: '#c8aa96' } });
  return (orientation ? img.withMetadata({ orientation }) : img).jpeg().toBuffer();
};

beforeAll(async () => {
  files = await generateFixtures(await mkdtemp(path.join(tmpdir(), 'img-')));
}, 60000);

describe('processProfilePhoto: mã lỗi theo fixture (AC-06)', () => {
  it.each([
    ['fake-exe.jpg', 'INVALID_FILE_TYPE'],
    ['too-small-400x800.jpg', 'IMAGE_TOO_SMALL'],
    ['landscape-1920x1080.jpg', 'INVALID_ASPECT_RATIO'],
    ['too-long-edge-600x9000.jpg', 'IMAGE_TOO_LARGE'],
    ['corrupt.jpg', 'INVALID_IMAGE'],
    ['valid-1080x1920.png', 'OK'],
    ['valid-1080x1920.webp', 'OK'],
  ])('%s -> %s', async (name, expected) => {
    expect(await codeOf(await load(name))).toBe(expected);
  });

  it('buffer rỗng hoặc rác -> INVALID_FILE_TYPE (không ném lỗi 500)', async () => {
    expect(await codeOf(Buffer.alloc(0))).toBe('INVALID_FILE_TYPE');
    expect(await codeOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      'INVALID_FILE_TYPE',
    );
  });

  it('GIF (đổi đuôi thành .jpg) bị từ chối theo magic bytes', async () => {
    const gif = await sharp(await solid(600, 1200))
      .gif()
      .toBuffer();
    expect(await codeOf(gif)).toBe('INVALID_FILE_TYPE');
  });

  it('ảnh WEBP động -> INVALID_FILE_TYPE (E16)', async () => {
    // Các khung phải khác nhau, nếu không encoder gộp thành ảnh tĩnh.
    const colors = ['#ffffff', '#000000', '#ff0000'];
    const frames = await Promise.all(
      colors.map((background) =>
        sharp({ create: { width: 600, height: 1200, channels: 3, background } })
          .raw()
          .toBuffer(),
      ),
    );
    const animated = await sharp(Buffer.concat(frames), {
      raw: { width: 600, height: 1200 * frames.length, channels: 3, pageHeight: 1200 },
    })
      .webp({ loop: 0, delay: frames.map(() => 100) })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(frames.length);
    expect(await codeOf(animated)).toBe('INVALID_FILE_TYPE');
  });
});

describe('processProfilePhoto: biên kích thước (sau khi xoay)', () => {
  it.each([
    [512, 1024, 'OK'], // đúng ngưỡng tối thiểu, tỉ lệ 2,0
    [511, 1024, 'IMAGE_TOO_SMALL'],
    [512, 1023, 'IMAGE_TOO_SMALL'],
    [800, 1040, 'OK'], // tỉ lệ đúng 1,3
    [800, 1039, 'INVALID_ASPECT_RATIO'],
    [1000, 2500, 'OK'], // tỉ lệ đúng 2,5
    [1000, 2501, 'INVALID_ASPECT_RATIO'],
    [3200, 8000, 'OK'], // cạnh dài đúng 8000
    [3200, 8001, 'IMAGE_TOO_LARGE'],
  ])('%i x %i -> %s', async (w, h, expected) => {
    expect(await codeOf(await solid(w, h))).toBe(expected);
  });

  it('ảnh lưu ngang 1920x1080 + orientation 6 được đánh giá theo chiều đã xoay (hợp lệ)', async () => {
    expect(await codeOf(await load('valid-rotated-exif6.jpg'))).toBe('OK');
  });

  it('ảnh lưu dọc 1080x1920 + orientation 6 thực chất là ảnh ngang -> INVALID_ASPECT_RATIO', async () => {
    expect(await codeOf(await solid(1080, 1920, 6))).toBe('INVALID_ASPECT_RATIO');
  });
});

describe('processProfilePhoto: đầu ra (D-12)', () => {
  it('xóa EXIF/GPS, xuất JPEG, giữ nguyên kích thước nếu <= 2048', async () => {
    const input = await load('valid-1080x1920-gps.jpg');
    expect((await sharp(input).metadata()).exif).toBeDefined(); // điều kiện đầu vào đúng như kỳ vọng

    const out = await processProfilePhoto(input);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(out.includes(Buffer.from('GPS'))).toBe(false);
    expect([meta.width, meta.height]).toEqual([1080, 1920]);
  });

  it('ảnh xoay EXIF: pixel được xoay thật thành dọc và orientation không còn', async () => {
    const out = await processProfilePhoto(await load('valid-rotated-exif6.jpg'));
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1920]);
    expect(meta.orientation).toBeUndefined();
  });

  it('thu nhỏ cạnh dài về 2048, không phóng to ảnh nhỏ', async () => {
    const big = await sharp(await processProfilePhoto(await solid(3000, 6000))).metadata();
    expect([big.width, big.height]).toEqual([1024, 2048]);
    const small = await sharp(await processProfilePhoto(await solid(600, 1200))).metadata();
    expect([small.width, small.height]).toEqual([600, 1200]);
  });

  it('PNG có alpha được đổ nền trắng', async () => {
    const png = await sharp({
      create: { width: 600, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const { data } = await sharp(await processProfilePhoto(png))
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]].every((v) => v >= 250)).toBe(true);
  });
});
