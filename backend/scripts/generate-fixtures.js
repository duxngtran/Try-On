// Sinh ảnh fixture cho test upload (US-02) vào tests/fixtures/generated/ (đã gitignore). Chạy: npm run fixtures
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tests/fixtures/generated',
);

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
  await add(
    'too-large-over-10mb.jpg',
    Buffer.concat([valid, Buffer.alloc(10 * 1024 * 1024 + 1024)]),
  );
  // Sai loại: nội dung PE (.exe) đổi đuôi .jpg
  await add('fake-exe.jpg', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 0x90)]));
  // JPEG hỏng: header đúng nhưng cắt cụt thân
  await add('corrupt.jpg', valid.subarray(0, 600));

  // Ảnh sản phẩm (US-04): chỉ là khối màu, không chứa ảnh người (bucket sản phẩm là public).
  const flat = (size, rgb) => blank(size, size, rgb);
  await add(
    'product-800x800-gps.jpg',
    await flat(800, { r: 240, g: 240, b: 235 }).withExif(GPS).jpeg().toBuffer(),
  );
  // PNG nền trong suốt, có khối màu ở giữa và metadata EXIF, để kiểm tra nền trắng + bỏ metadata.
  const square = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer();
  await add(
    'product-3000x3000-alpha.png',
    await sharp({
      create: {
        width: 3000,
        height: 3000,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: square, left: 900, top: 900 }])
      .withExif(GPS)
      .png()
      .toBuffer(),
  );
  await add('product-800x800.webp', await flat(800, { r: 30, g: 90, b: 160 }).webp().toBuffer());
  await add('product-512x512.jpg', await flat(512, { r: 90, g: 160, b: 90 }).jpeg().toBuffer());
  await add('product-512x1536.jpg', await blank(512, 1536).jpeg().toBuffer()); // đúng tỉ lệ 3
  await add('product-600x2000.jpg', await blank(600, 2000).jpeg().toBuffer()); // tỉ lệ > 3
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await generateFixtures();
  console.log(`Đã tạo ${Object.keys(files).length} fixture tại ${OUT_DIR}`);
}
