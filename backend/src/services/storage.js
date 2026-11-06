import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/AppError.js';

/**
 * Bọc Supabase Storage cho bucket ảnh hồ sơ (private, D-03). Đường dẫn: `<userId>/<uuid>.jpg`.
 * Không log và không trả đường dẫn thô ra ngoài service.
 * @param {{ client: import('@supabase/supabase-js').SupabaseClient, bucket: string, signedUrlTtlSeconds: number }} options
 */
export function createPhotoStorage({ client, bucket, signedUrlTtlSeconds }) {
  const files = () => client.storage.from(bucket);

  const newPath = (userId) => `${userId}/${randomUUID()}.jpg`;

  /** Tải lên đúng đường dẫn cho trước (không ghi đè). Lỗi -> 500 UPLOAD_FAILED. */
  const uploadAt = async (path, jpegBuffer) => {
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
  };

  return {
    newPath,
    uploadAt,

    /** Đọc nội dung file bằng service role (worker try-on lấy ảnh hồ sơ). Lỗi thì ném. */
    async download(path) {
      const { data, error } = await files().download(path);
      if (error || !data) throw error ?? new Error('download trả về rỗng');
      return Buffer.from(await data.arrayBuffer());
    },

    /** Xóa nhiều file một lần. File không tồn tại không phải lỗi. Lỗi Storage thì ném. */
    async removeMany(paths) {
      if (paths.length === 0) return;
      const { error } = await files().remove(paths);
      if (error) throw error;
    },

    /** Tải ảnh lên với tên ngẫu nhiên do server sinh; không bao giờ ghi đè. */
    upload: (userId, jpegBuffer) => uploadAt(newPath(userId), jpegBuffer),

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
