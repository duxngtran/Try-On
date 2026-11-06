import { createFakeProvider } from './fakeProvider.js';
import { createFashnProvider } from './fashnProvider.js';

const GARMENT_PRODUCT_ID =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f-]{36}\.jpg(?:\?.*)?$/i;

/**
 * Chọn adapter theo `TRYON_PROVIDER`. Adapter giả là mặc định; `fashn` chỉ tới được đây khi env hợp lệ
 * (có key, không phải NODE_ENV=test, xem `env.js`).
 *
 * Với adapter giả, tên sản phẩm quyết định kịch bản (`FAKE-HANG`, ...). Tên chỉ tới được adapter giả qua
 * `resolveScenario`: id sản phẩm nằm trong đường dẫn ảnh (`<productId>/<uuid>.jpg`) nên suy ra từ URL ảnh
 * mà worker vẫn gửi như thường, không đổi interface của adapter thật.
 *
 * @param {ReturnType<import('../../config/env.js').parseEnv>} env
 * @param {{
 *   findProductName?: (productId: string) => Promise<string | null | undefined>,
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 * }} [options]
 */
export function createProviderFromEnv(
  env,
  { findProductName, fetchImpl = globalThis.fetch, now } = {},
) {
  if (env.TRYON_PROVIDER === 'fashn') {
    return createFashnProvider({
      apiKey: env.FASHN_API_KEY,
      baseUrl: env.FASHN_BASE_URL,
      modelName: env.FASHN_MODEL_NAME,
      mode: env.FASHN_MODE,
      moderationLevel: env.FASHN_MODERATION_LEVEL,
      outputFormat: env.FASHN_OUTPUT_FORMAT,
      timeoutMs: env.FASHN_REQUEST_TIMEOUT_MS,
      fetchImpl,
    });
  }
  return createFakeProvider({
    delayMs: env.TRYON_FAKE_DELAY_MS,
    now,
    resolveScenario: async ({ garmentImageUrl }) => {
      const productId = GARMENT_PRODUCT_ID.exec(garmentImageUrl)?.[1];
      return productId && findProductName ? findProductName(productId) : null;
    },
  });
}
