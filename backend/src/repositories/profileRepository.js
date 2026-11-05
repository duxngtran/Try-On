import { getSupabase } from '../config/supabase.js';

// Không có cột `profile_completed`: giá trị suy ra bằng deriveCompletion (một nguồn duy nhất).
const COLUMNS =
  'height_cm, weight_kg, photo_path, photo_version, photo_updated_at, photo_consent_at, photo_consent_version';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/**
 * Truy cập bảng `profiles` qua Supabase (service role). Mọi hàm chỉ nhận `userId` lấy từ token.
 * Trả hàng snake_case; service map ra API.
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 */
export function createProfileRepository(client = getSupabase()) {
  const profiles = () => client.from('profiles');

  return {
    async findByUserId(userId) {
      return unwrap(await profiles().select(COLUMNS).eq('user_id', userId).maybeSingle());
    },

    /** Ghi consent nếu chưa có hoặc đã lỗi thời; đã đúng phiên bản thì giữ nguyên thời điểm lần đầu (idempotent). */
    async recordConsent(userId, version) {
      const { error } = await profiles()
        .update({ photo_consent_at: new Date().toISOString(), photo_consent_version: version })
        .eq('user_id', userId)
        .or(`photo_consent_at.is.null,photo_consent_version.neq.${version}`);
      if (error) throw error;
    },

    /** Trả về hàng đã cập nhật, hoặc null nếu không có hồ sơ. */
    async saveMeasurements(userId, { heightCm, weightKg }) {
      return unwrap(
        await profiles()
          .update({ height_cm: heightCm, weight_kg: weightKg })
          .eq('user_id', userId)
          .select(COLUMNS)
          .maybeSingle(),
      );
    },

    /**
     * Đổi (path) hoặc xóa (null) ảnh bằng một lệnh SQL nguyên tử (D-25).
     * @returns {Promise<{ oldPath: string | null, photoVersion: number, photoUpdatedAt: string | null }>}
     */
    async setPhoto(userId, newPath) {
      const data = unwrap(
        await client.rpc('set_profile_photo', { p_user_id: userId, p_new_path: newPath }),
      );
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('set_profile_photo không trả về dòng nào');
      return {
        oldPath: row.out_old_path ?? null,
        photoVersion: row.out_photo_version,
        photoUpdatedAt: row.out_photo_updated_at ?? null,
      };
    },
  };
}
