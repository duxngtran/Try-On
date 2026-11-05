import { ok } from '../utils/response.js';

/** Mọi handler chỉ dùng `req.user.id` (từ token); API hồ sơ không nhận id user (AC-11). */
export function createProfileController(profileService) {
  const respond = async (res, promise) => ok(res, { profile: await promise });
  return {
    get: (req, res) => respond(res, profileService.getProfile(req.user.id)),
    consent: (req, res) => respond(res, profileService.recordConsent(req.user.id)),
    measurements: (req, res) =>
      respond(res, profileService.saveMeasurements(req.user.id, req.body)),
    replacePhoto: (req, res) =>
      respond(res, profileService.replacePhoto(req.user.id, req.file.buffer)),
    deletePhoto: (req, res) => respond(res, profileService.deletePhoto(req.user.id)),
  };
}

/** Chặn sớm khi chưa consent, trước khi multer nhận file. */
export const requirePhotoConsent = (profileService) => async (req, res, next) => {
  await profileService.assertPhotoConsent(req.user.id);
  next();
};
