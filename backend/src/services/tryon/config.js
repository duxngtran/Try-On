/** Hằng số trong code, không phải env (backlog mục 4). Giống PHOTO_CONSENT_VERSION (D-22). */
export const TRYON_CONSENT_VERSION = 1;

/** Tên model của adapter giả; khác tên của FASHN nên đổi provider thì phải chạy tryon:purge-model (D-89). */
export const FAKE_MODEL_NAME = 'fake-tryon-v1';

const MICRO = 1_000_000;

/** Model đang dùng, ghi vào tryon_jobs.model_name và tryon_images.model_name. */
export const resolveModelName = (env) =>
  env.TRYON_PROVIDER === 'fashn' ? env.FASHN_MODEL_NAME : FAKE_MODEL_NAME;

/**
 * Cấu hình giới hạn và ngân sách, quy đổi từ env **một chỗ duy nhất**. Repository truyền nguyên khối này
 * vào các hàm SQL, nên không có nơi nào khác tự tính micro USD.
 * @param {ReturnType<import('../../config/env.js').parseEnv>} env
 */
export function buildTryonConfig(env) {
  return Object.freeze({
    consentVersion: TRYON_CONSENT_VERSION,
    provider: env.TRYON_PROVIDER,
    modelName: resolveModelName(env),
    dailyLimit: env.TRYON_DAILY_LIMIT,
    monthlyLimit: env.TRYON_MONTHLY_LIMIT,
    maxRunningPerUser: env.TRYON_MAX_RUNNING_PER_USER,
    maxActivePerUser: env.TRYON_MAX_ACTIVE_PER_USER,
    systemConcurrency: env.TRYON_SYSTEM_CONCURRENCY,
    costMicroUsd: Math.round(env.TRYON_COST_PER_IMAGE_USD * MICRO),
    budgetLimitMicroUsd: Math.round(env.TRYON_MONTHLY_BUDGET_USD * MICRO),
    prefetchMinRemaining: env.TRYON_PREFETCH_MIN_REMAINING,
    budgetWarnPercent: env.TRYON_BUDGET_WARN_PERCENT,
    deadlineSeconds: env.TRYON_JOB_DEADLINE_SECONDS,
    staleSeconds: env.TRYON_QUEUE_STALE_SECONDS,
    leaseSeconds: env.TRYON_SUBMIT_LEASE_SECONDS,
    pollSeconds: env.TRYON_POLL_SECONDS,
    deleteRetrySeconds: env.TRYON_DELETE_RETRY_SECONDS,
    imageRetentionDays: env.TRYON_IMAGE_RETENTION_DAYS,
    jobRetentionDays: env.TRYON_JOB_RETENTION_DAYS,
  });
}
