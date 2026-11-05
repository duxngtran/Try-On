/** Phiên bản câu đồng ý hiện hành (D-22). Đổi nội dung câu đồng ý thì tăng số này. */
export const PHOTO_CONSENT_VERSION = 1;

const toIso = (value) => (value ? new Date(value).toISOString() : null);

/**
 * Nguồn duy nhất cho `profileCompleted` (D-09, D-24): có ảnh + chiều cao + cân nặng.
 * Cùng điều kiện với cột generated `profiles.profile_completed`.
 * @param {{ photo_path?: string | null, height_cm?: number | null, weight_kg?: number | string | null } | null | undefined} row
 */
export function deriveCompletion(row) {
  const hasPhoto = Boolean(row?.photo_path);
  const hasMeasurements = row?.height_cm != null && row?.weight_kg != null;
  const missing = [];
  if (!hasPhoto) missing.push('photo');
  if (!hasMeasurements) missing.push('measurements');
  return { profileCompleted: hasPhoto && hasMeasurements, missing };
}

/** Consent chỉ có hiệu lực với đúng phiên bản hiện hành. */
export function hasCurrentConsent(row) {
  return Boolean(row?.photo_consent_at) && row.photo_consent_version === PHOTO_CONSENT_VERSION;
}

/**
 * Chuyển hàng `profiles` (snake_case) sang `Profile` của API (mục 6.2). Không bao giờ có `photo_path`.
 * @param {object} row
 * @param {{ url: string | null, expiresAt: string | null } | null} signed Kết quả ký URL; null nếu không có ảnh.
 */
export function toProfileDto(row, signed) {
  const { profileCompleted, missing } = deriveCompletion(row);
  return {
    heightCm: row.height_cm ?? null,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    photo: row.photo_path
      ? {
          url: signed?.url ?? null,
          expiresAt: signed?.url ? (signed.expiresAt ?? null) : null,
          version: row.photo_version,
          updatedAt: toIso(row.photo_updated_at),
        }
      : null,
    consent: {
      accepted: hasCurrentConsent(row),
      acceptedAt: toIso(row.photo_consent_at),
      version: row.photo_consent_version ?? null,
    },
    profileCompleted,
    missing,
  };
}
