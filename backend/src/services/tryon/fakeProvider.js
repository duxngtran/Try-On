import sharp from 'sharp';
import { FAKE_MODEL_NAME } from './config.js';
import { TryOnProviderError } from './provider.js';

/** Tiền tố tên sản phẩm -> kịch bản (design/tryon-provider.md mục 2). Dài trước ngắn, để TRANSIENT-ONCE thắng TRANSIENT. */
const SCENARIO_PREFIXES = [
  ['FAKE-TRANSIENT-ONCE', 'transient-once'],
  ['FAKE-TRANSIENT', 'transient'],
  ['FAKE-BLOCKED', 'blocked'],
  ['FAKE-POSE', 'pose'],
  ['FAKE-INPUT', 'input'],
  ['FAKE-NOCREDIT', 'nocredit'],
  ['FAKE-HANG', 'hang'],
];

/** @param {string | null | undefined} productName */
export function scenarioFromProductName(productName) {
  const upper = (productName ?? '').toUpperCase();
  return SCENARIO_PREFIXES.find(([prefix]) => upper.startsWith(prefix))?.[1] ?? 'success';
}

const MAX_RECORDED_CALLS = 20;

/** Ảnh kết quả giả: màu đơn 864x1296, KHÔNG phải ảnh người. Có EXIF để test chứng minh bước chuẩn hóa bỏ metadata. */
const buildResultImage = () =>
  sharp({ create: { width: 864, height: 1296, channels: 3, background: '#7a8fb5' } })
    .withExif({ IFD0: { Copyright: 'fake-provider-metadata' } })
    .jpeg({ quality: 80 })
    .toBuffer();

/**
 * Adapter giả, mặc định ở mọi test và ở `.env.example` (không có mạng ra ngoài).
 * `resolveScenario` do container truyền vào, nhận `{ garmentImageUrl }` và trả tên sản phẩm; adapter thật
 * không nhận gì ngoài hai ảnh. Thời gian lấy từ `now` nên test điều khiển được mà không cần timer thật.
 *
 * @param {{
 *   delayMs?: number,
 *   resolveScenario?: (input: { garmentImageUrl: string }) => Promise<string | null | undefined> | string | null | undefined,
 *   now?: () => number,
 *   modelName?: string,
 * }} [options]
 * @returns {import('./provider.js').TryOnProvider & { calls: Array<{ modelImage: Buffer, garmentImageUrl: string }> }}
 */
export function createFakeProvider({
  delayMs = 0,
  resolveScenario = () => null,
  now = Date.now,
  modelName = FAKE_MODEL_NAME,
} = {}) {
  const calls = [];
  const jobs = new Map();
  const submitsPerGarment = new Map();
  let sequence = 0;
  let resultImage;

  return {
    name: 'fake',
    modelName,
    /** Ghi lại request để kiểm AC-19 (giữ tối đa 20 lần gần nhất để chạy dài không phình bộ nhớ). */
    calls,

    async submit({ modelImage, garmentImageUrl }) {
      calls.push({ modelImage, garmentImageUrl });
      if (calls.length > MAX_RECORDED_CALLS) calls.shift();

      const scenario = scenarioFromProductName(await resolveScenario({ garmentImageUrl }));
      if (scenario === 'input') {
        throw new TryOnProviderError({ kind: 'input', providerCode: 'InputValidationError' });
      }
      if (scenario === 'nocredit') {
        throw new TryOnProviderError({ kind: 'config', providerCode: 'OutOfCredits' });
      }

      const attemptIndex = submitsPerGarment.get(garmentImageUrl) ?? 0;
      submitsPerGarment.set(garmentImageUrl, attemptIndex + 1);
      sequence += 1;
      const providerJobId = `fake-${sequence}`;
      jobs.set(providerJobId, { scenario, attemptIndex, readyAt: now() + delayMs });
      return { providerJobId };
    },

    async getStatus(providerJobId) {
      const job = jobs.get(providerJobId);
      if (!job) throw new TryOnProviderError({ kind: 'transient', providerCode: 'UnknownJob' });
      if (job.scenario === 'hang' || now() < job.readyAt) return { state: 'pending' };

      const succeeded = async () => {
        resultImage ??= await buildResultImage();
        return { state: 'succeeded', image: Buffer.from(resultImage), creditsUsed: null };
      };
      const fail = (kind, providerCode) => ({
        state: 'failed',
        error: new TryOnProviderError({ kind, providerCode }),
      });
      switch (job.scenario) {
        case 'transient':
          return fail('transient', 'ThirdPartyError');
        case 'transient-once':
          return job.attemptIndex === 0 ? fail('transient', 'ThirdPartyError') : succeeded();
        case 'blocked':
          return fail('blocked', 'ContentModerationError');
        case 'pose':
          return fail('photo_unusable', 'PoseError');
        default:
          return succeeded();
      }
    },
  };
}
