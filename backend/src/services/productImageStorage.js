import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/AppError.js';

/**
 * Bọc Supabase Storage cho bucket ảnh sản phẩm (public, D-46). Đường dẫn: `<productId>/<uuid>.jpg`,
 * do server sinh và không bao giờ dùng lại nên CDN cache lâu được (US-04 §9).
 * @param {{ client: import('@supabase/supabase-js').SupabaseClient, bucket: string, cacheSeconds: number }} options
 */
export function createProductImageStorage({ client, bucket, cacheSeconds }) {
  const files = () => client.storage.from(bucket);

  return {
    /** Tải ảnh lên với tên ngẫu nhiên, không ghi đè. Lỗi -> 500 UPLOAD_FAILED. @returns {Promise<string>} đường dẫn */
    async upload(productId, jpegBuffer) {
      const path = `${productId}/${randomUUID()}.jpg`;
      let error;
      try {
        ({ error } = await files().upload(path, jpegBuffer, {
          contentType: 'image/jpeg',
          cacheControl: String(cacheSeconds),
          upsert: false,
        }));
      } catch (err) {
        error = err;
      }
      if (error) {
        throw new AppError(500, 'UPLOAD_FAILED', 'Tải ảnh thất bại, vui lòng thử lại.');
      }
      return path;
    },

    /** Xóa một file. Ném lỗi nếu Storage báo lỗi (người gọi quyết định thử lại/ghi log). */
    async remove(path) {
      const { error } = await files().remove([path]);
      if (error) throw error;
    },

    /** URL công khai, không hết hạn (không gọi mạng). */
    publicUrl(path) {
      return files().getPublicUrl(path).data.publicUrl;
    },
  };
}
