import { AppError } from '../utils/AppError.js';
import { PHOTO_CONSENT_VERSION, hasCurrentConsent, toProfileDto } from './profileDomain.js';
import { processProfilePhoto } from './image.js';

const CONSENT_REQUIRED = () =>
  new AppError(
    400,
    'CONSENT_REQUIRED',
    'Vui lòng đồng ý điều khoản sử dụng ảnh trước khi tải lên.',
  );

/**
 * Nghiệp vụ hồ sơ (US-02). Mọi hàm nhận `userId` lấy từ token, không nhận id từ client (AC-11).
 * Log chỉ chứa mã sự kiện + userId: không số đo, không đường dẫn ảnh (US-02 §9).
 * @param {{
 *   profileRepository: ReturnType<import('../repositories/profileRepository.js').createProfileRepository>,
 *   photoStorage: ReturnType<import('./storage.js').createPhotoStorage>,
 *   processPhoto?: (buffer: Buffer) => Promise<Buffer>,
 *   logger?: Pick<Console, 'error'>,
 * }} deps
 */
export function createProfileService({
  profileRepository,
  photoStorage,
  processPhoto = processProfilePhoto,
  logger = console,
}) {
  const requireProfile = async (userId) => {
    const row = await profileRepository.findByUserId(userId);
    // Trigger DB bảo đảm mỗi user có đúng 1 hồ sơ; thiếu là lỗi hệ thống, không phải lỗi của client.
    if (!row) throw new Error('Không tìm thấy hồ sơ của user (trigger tạo hồ sơ có thể chưa chạy)');
    return row;
  };

  const buildDto = async (row) =>
    toProfileDto(row, row.photo_path ? await photoStorage.sign(row.photo_path) : null);

  /** Xóa file, thử lại 1 lần; vẫn lỗi thì ghi ORPHAN_PHOTO (không làm request lỗi). Trả về đã xóa được hay chưa. */
  const removeBestEffort = async (path, userId) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await photoStorage.remove(path);
        return true;
      } catch {
        // thử lại một lần
      }
    }
    logger.error('ORPHAN_PHOTO', { userId });
    return false;
  };

  return {
    async getProfile(userId) {
      return buildDto(await requireProfile(userId));
    },

    async recordConsent(userId) {
      await requireProfile(userId);
      await profileRepository.recordConsent(userId, PHOTO_CONSENT_VERSION);
      return buildDto(await requireProfile(userId));
    },

    async saveMeasurements(userId, { heightCm, weightKg }) {
      const row = await profileRepository.saveMeasurements(userId, { heightCm, weightKg });
      if (!row) throw new Error('Không tìm thấy hồ sơ của user khi lưu số đo');
      return buildDto(row);
    },

    /** Chạy trước khi nhận file (không nhận 10 MB vô ích). @throws {AppError} CONSENT_REQUIRED */
    async assertPhotoConsent(userId) {
      if (!hasCurrentConsent(await requireProfile(userId))) throw CONSENT_REQUIRED();
    },

    /**
     * Thứ tự (D-25): xử lý ảnh -> upload file mới -> ghi DB -> xóa file cũ.
     * Lỗi trước khi ghi DB: hồ sơ và ảnh cũ không đổi. DB lỗi: xóa file mới, không để mồ côi.
     */
    async replacePhoto(userId, rawBuffer) {
      const jpeg = await processPhoto(rawBuffer);
      const newPath = await photoStorage.upload(userId, jpeg);

      let result;
      try {
        result = await profileRepository.setPhoto(userId, newPath);
      } catch (err) {
        await removeBestEffort(newPath, userId);
        throw err;
      }
      if (result.oldPath) await removeBestEffort(result.oldPath, userId);
      return buildDto(await requireProfile(userId));
    },

    /** Idempotent: chưa có ảnh vẫn trả hồ sơ, không tăng version. */
    async deletePhoto(userId) {
      const result = await profileRepository.setPhoto(userId, null);
      if (result.oldPath) await removeBestEffort(result.oldPath, userId);
      return buildDto(await requireProfile(userId));
    },
  };
}
