import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/AppError.js';

/**
 * Bọc Supabase Storage cho bucket ảnh hồ sơ (private, D-03). Đường dẫn: `<userId>/<uuid>.jpg`.
 * Không log và không trả đường dẫn thô ra ngoài service.
 * @param {{ client: import('@supabase/supabase-js').SupabaseClient, bucket: string, signedUrlTtlSeconds: number }} options
 */
export function createPhotoStorage({ client, bucket, signedUrlTtlSeconds }) {
  const files = () => client.storage.from(bucket);

  return {
    /** Tải ảnh lên với tên ngẫu nhiên do server sinh; không bao giờ ghi đè. */
    async upload(userId, jpegBuffer) {
      const path = `${userId}/${randomUUID()}.jpg`;
      let error;
      try {
        ({ error } = await files().upload(path, jpegBuffer, {
          contentType: 'image/jpeg',
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

    /** Ký URL ngắn hạn. Lỗi thì trả `{ url: null, expiresAt: null }` để hồ sơ vẫn trả 200. */
    async sign(path) {
      try {
        const { data, error } = await files().createSignedUrl(path, signedUrlTtlSeconds);
        if (error || !data?.signedUrl) return { url: null, expiresAt: null };
        return {
          url: data.signedUrl,
          expiresAt: new Date(Date.now() + signedUrlTtlSeconds * 1000).toISOString(),
        };
      } catch {
        return { url: null, expiresAt: null };
      }
    },
  };
}
