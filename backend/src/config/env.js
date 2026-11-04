import { z } from 'zod';

const positiveInt = (fallback) => z.coerce.number().int().positive().default(fallback);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positiveInt(4000),
  CORS_ORIGIN: z.url({ message: 'CORS_ORIGIN phải là URL hợp lệ' }),
  SUPABASE_URL: z.url({ message: 'SUPABASE_URL phải là URL hợp lệ' }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Chỉ script migrate cần; optional để server vẫn khởi động khi không có.
  DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET phải có ít nhất 32 ký tự'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(10),
  LOGIN_MAX_FAILS: positiveInt(5),
  LOGIN_LOCK_MINUTES: positiveInt(15),
  AUTH_RATE_LIMIT_PER_MIN: positiveInt(20),
  PROFILE_PHOTO_BUCKET: z.string().min(1).default('profile-photos'),
  PHOTO_MAX_MB: positiveInt(10),
  PHOTO_UPLOADS_PER_HOUR: positiveInt(10),
  SIGNED_URL_TTL_SECONDS: positiveInt(900),
  // Chỉ script seed admin dùng.
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

/**
 * Validate biến môi trường. Thiếu/sai thì ném lỗi liệt kê tên biến (không in giá trị để tránh lộ secret).
 * @param {Record<string, string | undefined>} source
 */
export function parseEnv(source = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}`);
  }
  return Object.freeze(result.data);
}

let cached;
/** Env đã validate, parse một lần khi lần đầu cần. */
export function getEnv() {
  cached ??= parseEnv();
  return cached;
}
