import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { AppError } from '../utils/AppError.js';

export const IMAGE_RULES = Object.freeze({
  allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
  minWidth: 512,
  minHeight: 1024,
  maxLongEdge: 8000,
  // Tỉ lệ cao/rộng trong [1,3 ; 2,5]; so sánh bằng số nguyên (x10) để tránh sai số dấu phẩy động.
  minRatioTimes10: 13,
  maxRatioTimes10: 25,
  outputLongEdge: 2048,
  jpegQuality: 85,
});

// Chặn ảnh "bom": quá 8000x8000 điểm ảnh thì sharp từ chối giải mã.
const LIMIT_INPUT_PIXELS = IMAGE_RULES.maxLongEdge * IMAGE_RULES.maxLongEdge;

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
function assertDimensions({ width, height }) {
  const r = IMAGE_RULES;
  if (Math.max(width, height) > r.maxLongEdge) {
    throw new AppError(400, 'IMAGE_TOO_LARGE', 'Ảnh quá lớn, cạnh dài tối đa 8000 px.');
  }
  if (width < r.minWidth || height < r.minHeight) {
    throw new AppError(400, 'IMAGE_TOO_SMALL', 'Ảnh cần tối thiểu 512 × 1024 px.');
  }
  if (height * 10 < width * r.minRatioTimes10 || height * 10 > width * r.maxRatioTimes10) {
    throw new AppError(400, 'INVALID_ASPECT_RATIO', 'Vui lòng dùng ảnh dọc chụp toàn thân.');
  }
}

/**
 * Kiểm tra ảnh người dùng gửi và chuẩn hóa thành JPEG sạch metadata (D-11, D-12).
 * Luồng: design/flows/profile-photo-upload.md. Định dạng xác định bằng magic bytes, bỏ qua MIME/tên file của client.
 * @param {Buffer} input
 * @returns {Promise<Buffer>} JPEG đã xoay theo EXIF, không còn EXIF/GPS, cạnh dài tối đa 2048 px.
 * @throws {AppError} INVALID_FILE_TYPE | INVALID_IMAGE | IMAGE_TOO_LARGE | IMAGE_TOO_SMALL | INVALID_ASPECT_RATIO
 */
export async function processProfilePhoto(input) {
  const type = await fileTypeFromBuffer(input);
  if (!type || !IMAGE_RULES.allowedMimes.includes(type.mime)) throw invalidType();

  assertDimensions(await readOrientedSize(input));

  try {
    return await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({
        width: IMAGE_RULES.outputLongEdge,
        height: IMAGE_RULES.outputLongEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      // Không gọi withMetadata/keepMetadata: sharp mặc định bỏ toàn bộ metadata (EXIF, GPS, ICC).
      .jpeg({ quality: IMAGE_RULES.jpegQuality })
      .toBuffer();
  } catch {
    throw invalidImage();
  }
}
