import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { AppError } from '../utils/AppError.js';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_LONG_EDGE = 8000;
const OUTPUT_LONG_EDGE = 2048;

/**
 * Bộ quy tắc theo loại ảnh. Tỉ lệ so sánh bằng số nguyên (x10) để tránh sai số dấu phẩy động.
 * `ratio.kind`: 'portrait' = cao/rộng trong [min ; max] (ảnh người); 'any' = cạnh dài/cạnh ngắn <= max.
 */
export const IMAGE_RULES = Object.freeze({
  allowedMimes: ALLOWED_MIMES,
  maxLongEdge: MAX_LONG_EDGE,
  outputLongEdge: OUTPUT_LONG_EDGE,
  profile: Object.freeze({
    minWidth: 512,
    minHeight: 1024,
    ratio: { kind: 'portrait', minTimes10: 13, maxTimes10: 25 },
    jpeg: { quality: 85 },
    tooSmall: 'Ảnh cần tối thiểu 512 × 1024 px.',
    badRatio: 'Vui lòng dùng ảnh dọc chụp toàn thân.',
  }),
  // D-48: flat lay, không bắt buộc dọc hay ngang; giữ chi tiết họa tiết (chroma 4:4:4).
  product: Object.freeze({
    minWidth: 512,
    minHeight: 512,
    ratio: { kind: 'any', maxTimes10: 30 },
    jpeg: { quality: 90, chromaSubsampling: '4:4:4' },
    tooSmall: 'Ảnh sản phẩm cần tối thiểu 512 × 512 px.',
    badRatio: 'Ảnh quá dài hoặc quá hẹp, cạnh dài tối đa gấp 3 lần cạnh ngắn.',
  }),
});

// Chặn ảnh "bom": quá 8000x8000 điểm ảnh thì sharp từ chối giải mã.
const LIMIT_INPUT_PIXELS = MAX_LONG_EDGE * MAX_LONG_EDGE;

const invalidType = () =>
  new AppError(400, 'INVALID_FILE_TYPE', 'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.');
const invalidImage = () =>
  new AppError(400, 'INVALID_IMAGE', 'Không đọc được ảnh, vui lòng chọn ảnh khác.');

// EXIF orientation 5-8 là xoay 90 độ: chiều rộng/cao thực tế bị hoán đổi.
const swapsAxes = (orientation) => orientation >= 5 && orientation <= 8;

/** Đọc header (không giải mã toàn ảnh), trả về kích thước sau khi áp EXIF. */
async function readOrientedSize(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, {
      limitInputPixels: LIMIT_INPUT_PIXELS,
      failOn: 'error',
    }).metadata();
  } catch {
    throw invalidImage();
  }
  if ((meta.pages ?? 1) > 1) throw invalidType(); // ảnh động (E16)
  if (!meta.width || !meta.height) throw invalidImage();
  const swapped = swapsAxes(meta.orientation ?? 1);
  return {
    width: swapped ? meta.height : meta.width,
    height: swapped ? meta.width : meta.height,
  };
}

/** Kiểm tra kích thước/tỉ lệ theo thứ tự ưu tiên mã lỗi của contract. */
function assertDimensions({ width, height }, rules) {
  if (Math.max(width, height) > MAX_LONG_EDGE) {
    throw new AppError(400, 'IMAGE_TOO_LARGE', 'Ảnh quá lớn, cạnh dài tối đa 8000 px.');
  }
  if (width < rules.minWidth || height < rules.minHeight) {
    throw new AppError(400, 'IMAGE_TOO_SMALL', rules.tooSmall);
  }
  const { ratio } = rules;
  const bad =
    ratio.kind === 'portrait'
      ? height * 10 < width * ratio.minTimes10 || height * 10 > width * ratio.maxTimes10
      : Math.max(width, height) * 10 > Math.min(width, height) * ratio.maxTimes10;
  if (bad) throw new AppError(400, 'INVALID_ASPECT_RATIO', rules.badRatio);
}

/**
 * Kiểm tra ảnh rồi chuẩn hóa thành JPEG sạch metadata. Định dạng xác định bằng magic bytes,
 * bỏ qua MIME/tên file của client.
 */
async function processImage(input, rules) {
  const type = await fileTypeFromBuffer(input);
  if (!type || !ALLOWED_MIMES.includes(type.mime)) throw invalidType();

  assertDimensions(await readOrientedSize(input), rules);

  try {
    return await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({
        width: OUTPUT_LONG_EDGE,
        height: OUTPUT_LONG_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      // Không gọi withMetadata/keepMetadata: sharp mặc định bỏ toàn bộ metadata (EXIF, GPS, ICC) và xuất sRGB.
      .jpeg(rules.jpeg)
      .toBuffer();
  } catch {
    throw invalidImage();
  }
}

/**
 * Ảnh người dùng gửi (D-11, D-12). Luồng: design/flows/profile-photo-upload.md.
 * @param {Buffer} input
 * @returns {Promise<Buffer>} JPEG đã xoay theo EXIF, không còn EXIF/GPS, cạnh dài tối đa 2048 px.
 * @throws {AppError} INVALID_FILE_TYPE | INVALID_IMAGE | IMAGE_TOO_LARGE | IMAGE_TOO_SMALL | INVALID_ASPECT_RATIO
 */
export const processProfilePhoto = (input) => processImage(input, IMAGE_RULES.profile);

/**
 * Ảnh flat lay của sản phẩm (D-48, US-04 §6.2). Cùng mã lỗi với ảnh hồ sơ, message riêng.
 * @param {Buffer} input
 * @returns {Promise<Buffer>} JPEG q90 4:4:4, nền trắng nếu có alpha, cạnh dài tối đa 2048 px, không metadata.
 */
export const processProductImage = (input) => processImage(input, IMAGE_RULES.product);
