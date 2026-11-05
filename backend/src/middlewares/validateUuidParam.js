import { AppError } from '../utils/AppError.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id sai định dạng UUID -> 404 NOT_FOUND, không gọi DB (Postgres sẽ báo 22P02 và thành 500).
 * @param {string} message Thông báo theo loại tài nguyên.
 * @param {string} [param]
 */
export const validateUuidParam =
  (message, param = 'id') =>
  (req, res, next) => {
    if (!UUID.test(req.params[param] ?? '')) throw new AppError(404, 'NOT_FOUND', message);
    next();
  };
