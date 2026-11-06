import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

const RESULT_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
// Kết quả của model khoảng 864 x 1296; chặn ảnh "bom" từ phía dịch vụ.
const MAX_RESULT_PIXELS = 4096 * 4096;
const MAX_INPUT_PIXELS = 8000 * 8000;

/** Lỗi xử lý ảnh try-on. `message` chỉ mô tả loại lỗi, không chứa dữ liệu ảnh. */
export class TryOnImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TryOnImageError';
  }
}

/**
 * Bản tạm của ảnh người gửi đi (D-82): thu nhỏ cạnh dài về `maxSide`, JPEG, chỉ trong bộ nhớ, không ghi đĩa.
 * Không gọi withMetadata: sharp mặc định bỏ EXIF/GPS/ICC (ảnh hồ sơ đã sạch, đây là lớp phòng thủ thứ hai).
 * @param {Buffer} buffer
 * @param {number} maxSide
 * @returns {Promise<Buffer>}
 * @throws {TryOnImageError}
 */
export async function prepareModelImage(buffer, maxSide) {
  try {
    return await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    throw new TryOnImageError('Không đọc được ảnh hồ sơ để tạo bản tạm');
  }
}

/**
 * Chuẩn hóa ảnh kết quả của dịch vụ trước khi lưu (flows/tryon-job-finish.md): không tin MIME của dịch vụ,
 * định dạng xác định bằng magic bytes; giải mã thật bằng sharp (chứng minh là ảnh); mã hóa lại JPEG không metadata
 * dù nhà cung cấp đã trả JPEG.
 * @param {Buffer} buffer
 * @param {{ maxBytes?: number }} [options] `maxBytes`: dung lượng tối đa của file lưu (bucket giới hạn TRYON_IMAGE_MAX_MB)
 * @returns {Promise<{ buffer: Buffer, width: number, height: number }>}
 * @throws {TryOnImageError}
 */
export async function normalizeResult(buffer, { maxBytes = Infinity } = {}) {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !RESULT_MIMES.includes(type.mime)) {
    throw new TryOnImageError('Kết quả không phải ảnh JPEG, PNG hoặc WEBP');
  }
  let result;
  try {
    result = await sharp(buffer, { limitInputPixels: MAX_RESULT_PIXELS, failOn: 'error' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new TryOnImageError('Không giải mã được ảnh kết quả');
  }
  const { data, info } = result;
  if (!info.width || !info.height) throw new TryOnImageError('Ảnh kết quả không có kích thước');
  if (data.length > maxBytes) throw new TryOnImageError('Ảnh kết quả vượt dung lượng cho phép');
  return { buffer: data, width: info.width, height: info.height };
}
