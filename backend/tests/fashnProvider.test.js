import { describe, it, expect, vi } from 'vitest';
import { createFashnProvider } from '../src/services/tryon/fashnProvider.js';
import { TryOnProviderError } from '../src/services/tryon/provider.js';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** fetch giả: mỗi lần gọi lấy một phản hồi (hoặc lỗi) từ hàng đợi. KHÔNG có mạng thật. */
function fakeFetch(...responses) {
  const queue = [...responses];
  const fn = vi.fn(async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  });
  return fn;
}

const make = (fetchImpl) =>
  createFashnProvider({
    apiKey: 'test-key-123',
    baseUrl: 'https://api.fashn.test/v1/',
    modelName: 'tryon-v1.6',
    mode: 'balanced',
    moderationLevel: 'permissive',
    outputFormat: 'jpeg',
    timeoutMs: 15000,
    fetchImpl,
  });

const input = {
  modelImage: Buffer.from('jpeg-bytes'),
  garmentImageUrl: 'https://x.supabase.co/storage/v1/object/public/product-images/p/q.jpg',
};

async function submitError(response) {
  const provider = make(fakeFetch(response));
  return provider.submit(input).then(
    () => null,
    (err) => err,
  );
}

describe('createFashnProvider: cấu hình an toàn', () => {
  it('bắt buộc truyền fetchImpl và apiKey, nên test không thể gọi fetch thật', () => {
    expect(() => createFashnProvider({ apiKey: 'k', baseUrl: 'https://a.test' })).toThrow(
      /fetchImpl/,
    );
    expect(() => createFashnProvider({ baseUrl: 'https://a.test', fetchImpl: () => {} })).toThrow(
      /apiKey/,
    );
  });
});

describe('FASHN submit: dữ liệu gửi đi (AC-19, D-82, D-92, D-103)', () => {
  it('đúng endpoint, header, tham số; num_samples = 1; không có số đo, email, userId', async () => {
    const fetchImpl = fakeFetch(json({ id: 'prov-1', error: null }));
    const result = await make(fetchImpl).submit(input);
    expect(result).toEqual({ providerJobId: 'prov-1' });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.fashn.test/v1/run');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key-123');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(['inputs', 'model_name']);
    expect(body.model_name).toBe('tryon-v1.6');
    expect(body.inputs).toEqual({
      model_image: `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`,
      garment_image: input.garmentImageUrl,
      category: 'auto',
      garment_photo_type: 'flat-lay',
      mode: 'balanced',
      moderation_level: 'permissive',
      num_samples: 1,
      output_format: 'jpeg',
      return_base64: true,
    });
    expect(init.body).not.toMatch(/email|user_?id|height|weight|cm|kg/i);
  });
});

describe('FASHN submit: bảng lỗi HTTP (tryon-provider.md mục 4)', () => {
  it.each([
    [400, 'BadRequest', 'input', false],
    [401, 'UnauthorizedAccess', 'config', false],
    [404, 'NotFound', 'input', true],
    [429, 'RateLimitExceeded', 'transient', false],
    [429, 'ConcurrencyLimitExceeded', 'transient', false],
    [429, 'OutOfCredits', 'config', false],
    [500, 'InternalServerError', 'transient', false],
  ])('%i %s -> %s, costMaybeIncurred=%s', async (status, name, kind, cost) => {
    const err = await submitError(json({ error: name, message: 'x' }, status));
    expect(err).toBeInstanceOf(TryOnProviderError);
    expect([err.kind, err.costMaybeIncurred, err.providerCode]).toEqual([kind, cost, name]);
  });

  it('chấp nhận cả dạng error là đối tượng { name }', async () => {
    const err = await submitError(json({ error: { name: 'OutOfCredits' } }, 429));
    expect([err.kind, err.providerCode]).toEqual(['config', 'OutOfCredits']);
  });

  it('message của nhà cung cấp không lọt vào lỗi (có thể lặp lại nội dung đầu vào)', async () => {
    const err = await submitError(
      json({ error: 'BadRequest', message: 'bad image of a@example.com' }, 400),
    );
    expect(err.message).not.toMatch(/example\.com/);
    expect(JSON.stringify(err)).not.toMatch(/example\.com/);
  });

  it('tên lỗi lạ hoặc chứa ký tự nguy hiểm bị đổi thành Unknown', async () => {
    const err = await submitError(json({ error: 'a@example.com wrote this' }, 400));
    expect(err.providerCode).toBe('Unknown');
  });
});

describe('FASHN submit: lỗi mạng, không tự thử lại khi có thể đã tốn tiền', () => {
  it('hết giờ POST /run -> input + costMaybeIncurred, fetch chỉ được gọi 1 lần', async () => {
    const fetchImpl = fakeFetch(new DOMException('timed out', 'TimeoutError'));
    const err = await make(fetchImpl)
      .submit(input)
      .catch((e) => e);
    expect([err.kind, err.costMaybeIncurred, err.providerCode]).toEqual([
      'input',
      true,
      'RequestTimeout',
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('không kết nối được (chưa gửi byte nào) -> transient, không tốn tiền', async () => {
    const cause = Object.assign(new Error('connect'), { code: 'ECONNREFUSED' });
    const err = await make(fakeFetch(new TypeError('fetch failed', { cause })))
      .submit(input)
      .catch((e) => e);
    expect([err.kind, err.costMaybeIncurred]).toEqual(['transient', false]);
  });

  it('lỗi mạng không rõ (có thể đã gửi) -> coi như có thể tốn tiền, không thử lại', async () => {
    const cause = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    const err = await make(fakeFetch(new TypeError('fetch failed', { cause })))
      .submit(input)
      .catch((e) => e);
    expect([err.kind, err.costMaybeIncurred]).toEqual(['input', true]);
  });

  it('200 nhưng không có id -> không poll được, có thể đã tốn tiền', async () => {
    const err = await submitError(json({ error: null }));
    expect([err.kind, err.costMaybeIncurred, err.providerCode]).toEqual([
      'input',
      true,
      'MissingJobId',
    ]);
  });
});

describe('FASHN getStatus', () => {
  const statusOf = (body, init) => make(fakeFetch(json(body, 200, init))).getStatus('abc/1');

  it('gọi đúng đường dẫn và mã hóa id', async () => {
    const fetchImpl = fakeFetch(json({ status: 'processing' }));
    await make(fetchImpl).getStatus('abc/1');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.fashn.test/v1/status/abc%2F1');
  });

  it.each(['starting', 'in_queue', 'processing'])('%s -> pending', async (status) => {
    expect(await statusOf({ status })).toEqual({ state: 'pending' });
  });

  it('completed với base64 -> succeeded, giải mã đúng, đọc credits', async () => {
    const png = Buffer.from('fake-image-bytes');
    const result = await statusOf(
      { status: 'completed', output: [`data:image/jpeg;base64,${png.toString('base64')}`] },
      { 'x-fashn-credits-used': '1' },
    );
    expect(result.state).toBe('succeeded');
    expect(result.image.equals(png)).toBe(true);
    expect(result.creditsUsed).toBe(1);
  });

  it.each([
    ['_expired', 'ResultExpired'],
    [undefined, 'MissingResult'],
    ['https://cdn.fashn.test/x.jpg', 'MissingResult'],
  ])('completed với output %s -> input, đã tốn tiền, không thử lại', async (output, code) => {
    const result = await statusOf({ status: 'completed', output: output ? [output] : [] });
    expect(result.state).toBe('failed');
    expect([result.error.kind, result.error.costMaybeIncurred, result.error.providerCode]).toEqual([
      'input',
      true,
      code,
    ]);
  });

  it.each([
    ['ContentModerationError', 'blocked'],
    ['PoseError', 'photo_unusable'],
    ['ImageLoadError', 'input'],
    ['InputValidationError', 'input'],
    ['ThirdPartyError', 'transient'],
    ['UnavailableError', 'transient'],
    ['PipelineError', 'transient'],
    ['TenLaChuaTungThay', 'transient'],
  ])('failed %s -> %s, không tốn tiền', async (name, kind) => {
    const result = await statusOf({ status: 'failed', error: { name, message: 'm' } });
    expect(result.state).toBe('failed');
    expect([result.error.kind, result.error.costMaybeIncurred]).toEqual([kind, false]);
  });

  it.each(['canceled', 'time_out', 'gi-do-la'])(
    'trạng thái lạ %s -> lỗi input, không kẹt job',
    async (status) => {
      const result = await statusOf({ status });
      expect(result.state).toBe('failed');
      expect([result.error.kind, result.error.costMaybeIncurred]).toEqual(['input', false]);
    },
  );

  it('lỗi khi chính lệnh đọc trạng thái (HTTP 500, mạng) -> ném lỗi transient để worker bỏ qua', async () => {
    const http = await make(fakeFetch(json({ error: 'InternalServerError' }, 500)))
      .getStatus('x')
      .catch((e) => e);
    expect([http.kind, http.costMaybeIncurred]).toEqual(['transient', false]);
    const net = await make(fakeFetch(new TypeError('fetch failed')))
      .getStatus('x')
      .catch((e) => e);
    expect(net).toBeInstanceOf(TryOnProviderError);
    expect(net.kind).toBe('transient');
  });
});
