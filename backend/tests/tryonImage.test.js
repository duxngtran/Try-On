import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import sharp from 'sharp';
import {
  TryOnImageError,
  normalizeResult,
  prepareModelImage,
} from '../src/services/tryon/tryonImage.js';

const withMetadata = (fmt = 'jpeg', width = 400, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: '#336699' } })
    .withExif({ IFD0: { Copyright: 'cua-nha-cung-cap' } })
    [fmt]()
    .toBuffer();

describe('normalizeResult (T-66)', () => {
  it('kết quả đã mã hóa lại không còn EXIF, đọc đúng width/height', async () => {
    const input = await withMetadata('jpeg', 864, 1296);
    expect((await sharp(input).metadata()).exif).toBeDefined(); // điều kiện đầu: ảnh gốc CÓ metadata
    const out = await normalizeResult(input);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect([meta.format, out.width, out.height]).toEqual(['jpeg', 864, 1296]);
  });

  it('PNG, WEBP của dịch vụ được đổi thành JPEG', async () => {
    for (const fmt of ['png', 'webp']) {
      const out = await normalizeResult(await withMetadata(fmt));
      expect((await sharp(out.buffer).metadata()).format).toBe('jpeg');
    }
  });

  it('không tin MIME: byte rác, văn bản, ảnh hỏng đều bị từ chối', async () => {
    const good = await withMetadata();
    const truncated = good.subarray(0, 300);
    await expect(normalizeResult(Buffer.from('<html>not an image</html>'))).rejects.toBeInstanceOf(
      TryOnImageError,
    );
    await expect(normalizeResult(Buffer.alloc(100, 7))).rejects.toBeInstanceOf(TryOnImageError);
    await expect(normalizeResult(truncated)).rejects.toBeInstanceOf(TryOnImageError);
  });

  it('định dạng ảnh khác danh sách (GIF) bị từ chối dù đọc được', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();
    await expect(normalizeResult(gif)).rejects.toBeInstanceOf(TryOnImageError);
  });

  it('vượt dung lượng cho phép của bucket thì từ chối trước khi upload', async () => {
    await expect(normalizeResult(await withMetadata(), { maxBytes: 10 })).rejects.toThrow(
      /dung lượng/,
    );
  });

  it('không ghi file tạm xuống đĩa (D-82)', async () => {
    const spies = [
      vi.spyOn(fs, 'writeFileSync'),
      vi.spyOn(fs, 'createWriteStream'),
      vi.spyOn(fs.promises, 'writeFile'),
    ];
    const input = await withMetadata();
    await normalizeResult(input);
    await prepareModelImage(input, 100);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('prepareModelImage (T-66, D-82)', () => {
  it('thu nhỏ cạnh dài về maxSide, giữ tỉ lệ, không phóng to, bỏ metadata', async () => {
    const big = await withMetadata('jpeg', 1000, 2000);
    const small = await sharp(await prepareModelImage(big, 1536)).metadata();
    expect([small.width, small.height]).toEqual([768, 1536]);
    expect(small.exif).toBeUndefined();

    const tiny = await sharp(
      await prepareModelImage(await withMetadata('jpeg', 300, 400), 1536),
    ).metadata();
    expect([tiny.width, tiny.height]).toEqual([300, 400]);
  });

  it('ảnh hỏng -> TryOnImageError, không lộ nội dung', async () => {
    await expect(prepareModelImage(Buffer.from('rac'), 1536)).rejects.toBeInstanceOf(
      TryOnImageError,
    );
  });
});
