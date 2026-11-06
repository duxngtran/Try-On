import { TryOnProviderError } from './provider.js';

/** Lỗi `failed` trong runtime (design/tryon-provider.md mục 4): tên lỗi -> kind. */
const RUNTIME_ERRORS = {
  ContentModerationError: 'blocked',
  PoseError: 'photo_unusable',
  ImageLoadError: 'input',
  InputValidationError: 'input',
  ThirdPartyError: 'transient',
  UnavailableError: 'transient',
  PipelineError: 'transient',
};

const PENDING_STATUSES = new Set(['starting', 'in_queue', 'processing']);

/** Mã lỗi mạng cho biết chưa gửi được byte nào, nên chắc chắn không bị tính tiền. */
const NOT_SENT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
]);

const SAFE_CODE = /^[A-Za-z0-9_]{1,64}$/;
/** Chỉ giữ tên lỗi: message của nhà cung cấp có thể lặp lại nội dung đầu vào (AC-20). */
const safeCode = (value) =>
  typeof value === 'string' && SAFE_CODE.test(value) ? value : 'Unknown';

const isTimeout = (err) => err?.name === 'TimeoutError' || err?.name === 'AbortError';

/** FASHN trả `error` là chuỗi hoặc `{ name }`; chấp nhận cả hai, không tin định dạng. */
function errorNameOf(body) {
  const error = body?.error;
  if (typeof error === 'string') return safeCode(error);
  return safeCode(error?.name ?? body?.name);
}

/** Lỗi HTTP -> TryOnProviderError (bảng mục 4, nguồn HTTP). `afterSend`: lệnh POST /run đã gửi đi. */
function httpError(status, name, { afterSend }) {
  const make = (kind, costMaybeIncurred = false) =>
    new TryOnProviderError({ kind, providerCode: name, costMaybeIncurred });
  if (status === 401) return make('config');
  if (status === 429) return name === 'OutOfCredits' ? make('config') : make('transient');
  if (status === 404) return make('input', afterSend);
  if (status >= 500) return make('transient');
  return make('input');
}

/**
 * Adapter FASHN Try-On v1.6. Nội dung đọc từ tài liệu ngày 2026-11-06, **chưa kiểm chứng bằng chạy thật**.
 * Không dùng SDK: chỉ cần 2 endpoint, và `fetchImpl` bắt buộc truyền vào để test không bao giờ gọi mạng thật.
 *
 * @param {{
 *   apiKey: string,
 *   baseUrl: string,
 *   modelName: string,
 *   mode: string,
 *   moderationLevel: string,
 *   outputFormat: string,
 *   timeoutMs: number,
 *   fetchImpl: typeof fetch,
 * }} options
 * @returns {import('./provider.js').TryOnProvider}
 */
export function createFashnProvider({
  apiKey,
  baseUrl,
  modelName,
  mode,
  moderationLevel,
  outputFormat,
  timeoutMs,
  fetchImpl,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('createFashnProvider cần fetchImpl');
  if (!apiKey) throw new Error('createFashnProvider cần apiKey');
  const root = baseUrl.replace(/\/+$/, '');

  const request = (path, init) =>
    fetchImpl(`${root}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });

  /** Đọc JSON, không ném: thân không phải JSON thì coi như rỗng. */
  const readJson = async (res) => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  return {
    name: 'fashn',
    modelName,

    async submit({ modelImage, garmentImageUrl }) {
      const body = {
        model_name: modelName,
        inputs: {
          model_image: `data:image/jpeg;base64,${modelImage.toString('base64')}`,
          garment_image: garmentImageUrl,
          category: 'auto', // D-92
          garment_photo_type: 'flat-lay',
          mode,
          moderation_level: moderationLevel,
          num_samples: 1,
          output_format: outputFormat,
          return_base64: true,
        },
      };

      let res;
      try {
        res = await request('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        // Hết giờ hoặc lỗi lạ: request có thể đã tới nơi, gửi lần hai có thể mất 2 credit nên không tự thử lại.
        const code = err?.cause?.code ?? err?.code;
        if (!isTimeout(err) && NOT_SENT_CODES.has(code)) {
          throw new TryOnProviderError({ kind: 'transient', providerCode: 'NetworkError' });
        }
        throw new TryOnProviderError({
          kind: 'input',
          providerCode: isTimeout(err) ? 'RequestTimeout' : 'NetworkError',
          costMaybeIncurred: true,
        });
      }

      const json = await readJson(res);
      if (!res.ok) throw httpError(res.status, errorNameOf(json), { afterSend: true });
      if (json?.error) {
        throw new TryOnProviderError({
          kind: 'input',
          providerCode: errorNameOf(json),
          costMaybeIncurred: true,
        });
      }
      if (typeof json?.id !== 'string' || json.id === '') {
        // Đã nhận 200 nhưng mất id: không poll được, nhưng có thể đã tốn tiền.
        throw new TryOnProviderError({
          kind: 'input',
          providerCode: 'MissingJobId',
          costMaybeIncurred: true,
        });
      }
      return { providerJobId: json.id };
    },

    async getStatus(providerJobId) {
      let res;
      try {
        res = await request(`/status/${encodeURIComponent(providerJobId)}`, { method: 'GET' });
      } catch (err) {
        throw new TryOnProviderError({
          kind: 'transient',
          providerCode: isTimeout(err) ? 'RequestTimeout' : 'NetworkError',
        });
      }
      const json = await readJson(res);
      if (!res.ok) throw httpError(res.status, errorNameOf(json), { afterSend: false });

      const status = json?.status;
      if (PENDING_STATUSES.has(status)) return { state: 'pending' };

      if (status === 'completed') {
        const output = Array.isArray(json.output) ? json.output[0] : undefined;
        const match =
          typeof output === 'string' ? /^data:image\/[\w.+-]+;base64,(.+)$/s.exec(output) : null;
        if (!match) {
          // `_expired`, thiếu, hoặc là URL: ảnh đã tính tiền nhưng ta không lấy được. Không tự thử lại.
          return {
            state: 'failed',
            error: new TryOnProviderError({
              kind: 'input',
              providerCode: output === '_expired' ? 'ResultExpired' : 'MissingResult',
              costMaybeIncurred: true,
            }),
          };
        }
        const credits = Number(res.headers?.get?.('x-fashn-credits-used'));
        return {
          state: 'succeeded',
          image: Buffer.from(match[1], 'base64'),
          creditsUsed: Number.isFinite(credits) ? credits : null,
        };
      }

      if (status === 'failed') {
        const name = errorNameOf(json);
        // Tên lạ: coi là tạm thời (thử lại 1 lần không tốn credit vì `failed` không trừ credit).
        const kind = RUNTIME_ERRORS[name] ?? 'transient';
        return {
          state: 'failed',
          error: new TryOnProviderError({ kind, providerCode: name }),
        };
      }

      // `canceled`, `time_out`, hoặc giá trị chưa biết: lỗi, không để job kẹt.
      return {
        state: 'failed',
        error: new TryOnProviderError({ kind: 'input', providerCode: safeCode(status) }),
      };
    },
  };
}
