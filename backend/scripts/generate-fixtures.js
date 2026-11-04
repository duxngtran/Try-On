// Sinh ảnh fixture cho test upload (US-02) vào tests/fixtures/generated/ (đã gitignore). Chạy: npm run fixtures
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/generated');

const blank = (width, height, rgb = { r: 200, g: 170, b: 150 }) =>
  sharp({ create: { width, height, channels: 3, background: rgb } });

const GPS = {
  IFD3: {
    GPSLatitudeRef: 'N',
    GPSLatitude: '10/1 46/1 30/1',
    GPSLongitudeRef: 'E',
    GPSLongitude: '106/1 42/1 0/1',
  },
};

export async function generateFixtures(outDir = OUT_DIR) {
  await mkdir(outDir, { recursive: true });
  const files = {};
  const add = (name, buffer) => {
    files[name] = path.join(outDir, name);
    return writeFile(files[name], buffer);
  };

  // Hợp lệ: 1080x1920 có EXIF GPS (+ orientation 1)
  await add('valid-1080x1920-gps.jpg', await blank(1080, 1920).withExif(GPS).jpeg().toBuffer());
  // Pixel lưu 1920x1080 nhưng orientation = 6 -> sau khi xoay thành 1080x1920 (ảnh hợp lệ)
  await add(
    'valid-rotated-exif6.jpg',
    await blank(1920, 1080).withMetadata({ orientation: 6 }).jpeg().toBuffer(),
  );
  await add('valid-1080x1920.png', await blank(1080, 1920).png().toBuffer());
  await add('valid-1080x1920.webp', await blank(1080, 1920).webp().toBuffer());
  // Lỗi kích thước/tỉ lệ
  await add('too-small-400x800.jpg', await blank(400, 800).jpeg().toBuffer());
  await add('landscape-1920x1080.jpg', await blank(1920, 1080).jpeg().toBuffer());
  await add('too-long-edge-600x9000.jpg', await blank(600, 9000).jpeg().toBuffer());
  // Quá dung lượng: JPEG hợp lệ + đệm cho tới > 10 MB
  const valid = await blank(1080, 1920).jpeg().toBuffer();
  await add('too-large-over-10mb.jpg', Buffer.concat([valid, Buffer.alloc(10 * 1024 * 1024 + 1024)]));
  // Sai loại: nội dung PE (.exe) đổi đuôi .jpg
  await add('fake-exe.jpg', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 0x90)]));
  // JPEG hỏng: header đúng nhưng cắt cụt thân
  await add('corrupt.jpg', valid.subarray(0, 600));
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await generateFixtures();
  console.log(`Đã tạo ${Object.keys(files).length} fixture tại ${OUT_DIR}`);
}
