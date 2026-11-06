import { z } from 'zod';

const positiveInt = (fallback) => z.coerce.number().int().positive().default(fallback);
const positiveNumber = (fallback) => z.coerce.number().positive().default(fallback);
// z.coerce.boolean coi chuỗi 'false' là true, nên chỉ nhận đúng 'true' | 'false'.
const flag = (fallback) =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const baseEnvSchema = z.object({
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
  PRODUCT_IMAGE_BUCKET: z.string().min(1).default('product-images'),
  PRODUCT_IMAGE_MAX_MB: positiveInt(10),
  PRODUCT_IMAGE_CACHE_SECONDS: positiveInt(604800),
  PRODUCT_WRITES_PER_HOUR: positiveInt(120),
  // Phòng thử đồ (sprint 03). Mặc định an toàn: adapter giả, không gọi dịch vụ thật.
  TRYON_ENABLED: flag('true'),
  TRYON_PREFETCH_ENABLED: flag('true'),
  TRYON_PROVIDER: z.enum(['fake', 'fashn']).default('fake'),
  TRYON_FAKE_DELAY_MS: z.coerce.number().int().min(0).default(1500),
  TRYON_IMAGE_BUCKET: z.string().min(1).default('tryon-images'),
  TRYON_IMAGE_MAX_MB: positiveInt(5),
  TRYON_DAILY_LIMIT: positiveInt(20),
  TRYON_MONTHLY_LIMIT: positiveInt(100),
  TRYON_MONTHLY_BUDGET_USD: positiveNumber(50),
  TRYON_BUDGET_WARN_PERCENT: z.coerce.number().int().min(1).max(100).default(80),
  TRYON_COST_PER_IMAGE_USD: positiveNumber(0.075),
  TRYON_PREFETCH_MIN_REMAINING: z.coerce.number().int().min(0).default(3),
  TRYON_MAX_RUNNING_PER_USER: positiveInt(2),
  TRYON_MAX_ACTIVE_PER_USER: positiveInt(4),
  TRYON_SYSTEM_CONCURRENCY: positiveInt(6),
  TRYON_JOB_DEADLINE_SECONDS: positiveInt(120),
  TRYON_MAX_ATTEMPTS: positiveInt(2),
  TRYON_RETRY_DELAY_SECONDS: positiveInt(2),
  TRYON_POLL_SECONDS: positiveInt(2),
  TRYON_SUBMIT_LEASE_SECONDS: positiveInt(30),
  TRYON_QUEUE_STALE_SECONDS: positiveInt(8),
  TRYON_WORKER_TICK_MS: positiveInt(1000),
  TRYON_PROVIDER_PAUSE_SECONDS: positiveInt(300),
  TRYON_CLEANUP_TICK_SECONDS: positiveInt(30),
  TRYON_DELETE_RETRY_SECONDS: positiveInt(60),
  TRYON_IMAGE_RETENTION_DAYS: positiveInt(90),
  TRYON_JOB_RETENTION_DAYS: positiveInt(35),
  TRYON_JOB_CREATES_PER_MIN: positiveInt(30),
  TRYON_READS_PER_MIN: positiveInt(240),
  // Giỏ hàng (sprint 04, D-140, D-149). Ngưỡng là ước lượng. Số lượng tối đa không vượt CHECK của cột (999).
  CART_MAX_QUANTITY: z.coerce.number().int().min(1).max(999).default(10),
  CART_MAX_LINES: positiveInt(30),
  CART_REQUESTS_PER_MIN: positiveInt(120),
  // Đơn hàng (sprint 04, D-148). Ngưỡng là ước lượng, chỉ chống spam.
  ORDER_CREATES_PER_HOUR: positiveInt(20),
  ORDER_READS_PER_MIN: positiveInt(120),
  // Không có default; bắt buộc khi TRYON_PROVIDER=fashn (kiểm ở superRefine bên dưới).
  FASHN_API_KEY: z.string().optional(),
  FASHN_BASE_URL: z.url().default('https://api.fashn.ai/v1'),
  FASHN_MODEL_NAME: z.string().min(1).default('tryon-v1.6'),
  FASHN_MODE: z.string().min(1).default('balanced'),
  FASHN_MODERATION_LEVEL: z.string().min(1).default('permissive'),
  FASHN_OUTPUT_FORMAT: z.enum(['jpeg', 'png']).default('jpeg'),
  FASHN_MODEL_IMAGE_MAX_SIDE: positiveInt(1536),
  FASHN_REQUEST_TIMEOUT_MS: positiveInt(15000),
  // Chỉ script seed admin dùng.
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

/** Hai chốt chặn chống gọi dịch vụ thật ngoài ý muốn (design/tryon-provider.md mục 2). */
export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.TRYON_PROVIDER !== 'fashn') return;
  if (!env.FASHN_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['FASHN_API_KEY'],
      message: 'Bắt buộc khi TRYON_PROVIDER=fashn',
    });
  }
  if (env.NODE_ENV === 'test') {
    ctx.addIssue({
      code: 'custom',
      path: ['TRYON_PROVIDER'],
      message: 'Không được dùng fashn khi NODE_ENV=test',
    });
  }
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
