import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '../../services/apiClient.js';
import { tryonApi } from './tryonApi.js';
import { createImageCache } from './useImageCache.js';
import { useProductImage } from './useProductImage.js';

vi.mock('./tryonApi.js', () => ({
  tryonApi: { getResult: vi.fn(), createJob: vi.fn(), getJob: vi.fn() },
}));

const IMAGE = {
  url: 'https://storage.test/tryon.jpg?token=x',
  expiresAt: '2099-01-01T00:00:00.000Z',
  width: 864,
  height: 1296,
};
const apiError = (status, code, details) => new ApiError({ status, code, message: 'x', details });
const room = (overrides = {}) => ({
  generationAvailable: true,
  quota: { remaining: 10, held: 0, ...overrides.quota },
  ...overrides,
});

function setup({ id = 'p1', roomState = room() } = {}) {
  const callbacks = {
    getRoom: () => roomState,
    refreshState: vi.fn(async () => ({ generation: { available: true } })),
    onGate: vi.fn(),
    onGenerated: vi.fn(),
  };
  const hook = renderHook(({ productId }) => useProductImage(productId, callbacks), {
    initialProps: { productId: id },
  });
  return { ...hook, callbacks };
}
const advance = (ms) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const job = (status, extra = {}) => ({ id: 'j1', productId: 'p1', status, ...extra });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('useProductImage: luồng ảnh của một sản phẩm', () => {
  it('đã có ảnh: hiện ngay, không POST, không tốn lượt (AC-04)', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'ready', image: IMAGE });
    const { result } = setup();
    await advance(0);
    expect(result.current.view).toMatchObject({ phase: 'ready', image: IMAGE });
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it('chưa có ảnh: chờ 400 ms rồi mới POST, poll 2 giây, xong thì tự hiện (AC-03)', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    tryonApi.createJob.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockResolvedValueOnce(job('running'));
    tryonApi.getJob.mockResolvedValueOnce(job('succeeded', { image: IMAGE }));
    const { result, callbacks } = setup();

    await advance(0);
    expect(result.current.view.phase).toBe('waiting'); // trạng thái chờ có ngay
    await advance(399);
    expect(tryonApi.createJob).not.toHaveBeenCalled(); // D-86: chưa dừng đủ 400 ms
    await advance(1);
    expect(tryonApi.createJob).toHaveBeenCalledTimes(1);
    expect(tryonApi.createJob).toHaveBeenCalledWith('p1', expect.any(Object));

    await advance(2000);
    expect(result.current.view.phase).toBe('waiting'); // running
    await advance(2000);
    expect(result.current.view).toMatchObject({ phase: 'ready', image: IMAGE });
    expect(callbacks.onGenerated).toHaveBeenCalledTimes(1);
  });

  it('mốc chờ: 15 giây thêm dòng "vẫn đang tạo", 60 giây báo timeout nhưng vẫn poll (AC-15)', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockResolvedValue(job('running'));
    const { result } = setup();

    await advance(0);
    expect(result.current.view).toMatchObject({ phase: 'waiting', long: false });
    await advance(15_000);
    expect(result.current.view).toMatchObject({ phase: 'waiting', long: true });
    await advance(45_000);
    expect(result.current.view).toMatchObject({ phase: 'overlay', overlayId: 'timeout' });

    const pollsAtTimeout = tryonApi.getJob.mock.calls.length;
    tryonApi.getJob.mockResolvedValue(job('succeeded', { image: IMAGE }));
    await advance(2000);
    expect(tryonApi.getJob.mock.calls.length).toBeGreaterThan(pollsAtTimeout); // S5 chỉ là lỗi hiển thị
    expect(result.current.view).toMatchObject({ phase: 'ready', image: IMAGE }); // S5 -> S3
  });

  it('Thử lại ở S5 gọi POST /jobs và đếm lại đồng hồ từ 0 (D-113)', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockResolvedValue(job('running'));
    tryonApi.createJob.mockResolvedValue({
      state: 'pending',
      job: { id: 'j1', status: 'running' },
    });
    const { result } = setup();
    await advance(0);
    await advance(60_000);
    expect(result.current.view.overlayId).toBe('timeout');
    // Một POST display đã đi lúc 400 ms (nâng job tìm thấy qua /result, flows/tryon-prefetch.md).
    expect(tryonApi.createJob).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    await advance(0);
    expect(tryonApi.createJob).toHaveBeenCalledTimes(2);
    expect(result.current.view).toMatchObject({ phase: 'waiting', long: false });
    await advance(14_000);
    expect(result.current.view).toMatchObject({ phase: 'waiting', long: false }); // chưa tới 15 giây mới
    await advance(1_000);
    expect(result.current.view.long).toBe(true);
  });

  it('hết lượt đã biết trước thì không POST, hiện hết lượt ngày hoặc tháng (D-118)', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    const { result } = setup({
      roomState: room({
        quota: {
          remaining: 0,
          held: 0,
          dailyUsed: 20,
          dailyLimit: 20,
          monthlyUsed: 30,
          monthlyLimit: 100,
          dailyResetsAt: '2026-11-06T17:00:00.000Z',
        },
      }),
    });
    await advance(1000);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
    expect(result.current.view).toMatchObject({
      overlayId: 'quotaDay',
      overlayData: { resetsAt: '2026-11-06T17:00:00.000Z' },
    });
  });

  it('lượt cuối đang được giữ (remaining = 0, held > 0) vẫn gọi POST để backend quyết định', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    tryonApi.createJob.mockRejectedValue(
      apiError(429, 'TRYON_QUOTA_EXCEEDED', { scope: 'pending', retryAfterSeconds: 15 }),
    );
    const { result } = setup({ roomState: room({ quota: { remaining: 0, held: 1 } }) });
    await advance(500);
    expect(tryonApi.createJob).toHaveBeenCalledTimes(1);
    expect(result.current.view).toMatchObject({
      overlayId: 'quotaPending',
      overlayData: { retryAfterSeconds: 15 },
    });
  });

  it('tạm dừng đã biết trước thì không POST (S9)', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    const { result } = setup({ roomState: room({ generationAvailable: false }) });
    await advance(1000);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
    expect(result.current.view.overlayId).toBe('paused');
  });

  it('Kiểm tra lại: làm mới /state, bật lại thì mới tạo job', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    tryonApi.createJob.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    const { result, callbacks } = setup({ roomState: room({ generationAvailable: false }) });
    await advance(0);
    callbacks.refreshState.mockResolvedValueOnce({ generation: { available: false } });
    act(() => result.current.recheck());
    await advance(0);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
    expect(result.current.view.overlayId).toBe('paused');

    callbacks.refreshState.mockResolvedValueOnce({ generation: { available: true } });
    act(() => result.current.recheck());
    await advance(0);
    expect(tryonApi.createJob).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['blocked', 'TRYON_BLOCKED', 'blocked'],
    ['blocked', 'TRYON_PHOTO_UNUSABLE', 'photo'],
  ])(
    '/result %s với %s ghi nhớ theo khóa: không POST, không chờ 400 ms (R9, R14)',
    async (state, errorCode, overlayId) => {
      tryonApi.getResult.mockResolvedValue({ state, errorCode });
      const { result } = setup();
      await advance(0);
      expect(result.current.view.overlayId).toBe(overlayId);
      await advance(1000);
      expect(tryonApi.createJob).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['TRYON_FAILED', 'failed'],
    ['TRYON_TIMEOUT', 'timeout'],
    ['TRYON_BLOCKED', 'blocked'],
    ['TRYON_PHOTO_UNUSABLE', 'photo'],
    ['TRYON_UNAVAILABLE', 'paused'],
    ['MA_LA_CHUA_BIET', 'failed'], // D-130: mã lạ coi như lỗi tạm thời
  ])('job failed %s -> lớp phủ %s', async (code, overlayId) => {
    tryonApi.getResult.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockResolvedValue(job('failed', { error: { code, message: 'x' } }));
    const { result } = setup();
    await advance(2000);
    expect(result.current.view.overlayId).toBe(overlayId);
  });

  it('403 giữa chừng gỡ sân khấu và báo cổng consent; 409 báo cổng hồ sơ kèm phần thiếu (S16)', async () => {
    tryonApi.getResult.mockRejectedValueOnce(apiError(403, 'TRYON_CONSENT_REQUIRED'));
    const first = setup();
    await advance(0);
    expect(first.callbacks.onGate).toHaveBeenCalledWith({ type: 'gate', gate: 'consent' });
    first.unmount();

    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    tryonApi.createJob.mockRejectedValue(
      apiError(409, 'PROFILE_INCOMPLETE', { missing: ['photo'] }),
    );
    const second = setup();
    await advance(500);
    expect(second.callbacks.onGate).toHaveBeenCalledWith({
      type: 'gate',
      gate: 'profile',
      missing: ['photo'],
    });
  });

  it('404 ở /result hoặc POST: sản phẩm đã xóa, không tạo job, không tốn lượt (AC-13, S14)', async () => {
    tryonApi.getResult.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    const { result } = setup();
    await advance(1000);
    expect(result.current.view.overlayId).toBe('deleted');
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it('503 khi POST: tạm dừng; 429 TOO_MANY_REQUESTS: S11 khóa theo retryAfterSeconds', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    tryonApi.createJob.mockRejectedValueOnce(apiError(503, 'TRYON_UNAVAILABLE'));
    const a = setup();
    await advance(500);
    expect(a.result.current.view.overlayId).toBe('paused');
    a.unmount();

    tryonApi.createJob.mockRejectedValueOnce(
      apiError(429, 'TOO_MANY_REQUESTS', { retryAfterSeconds: 5 }),
    );
    const b = setup();
    await advance(500);
    expect(b.result.current.view).toMatchObject({
      overlayId: 'throttled',
      overlayData: { retryAfterSeconds: 5 },
    });
  });

  it('job canceled/discarded: hỏi lại /result một lần rồi tạo lại; lặp lại thì dừng ở lỗi, không vòng lặp', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    tryonApi.createJob.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockResolvedValue(job('canceled'));
    const { result } = setup();
    await advance(10_000);
    expect(tryonApi.createJob.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.current.view.overlayId).toBe('failed');
  });

  it('GET /jobs/:id trả 404 (job hết hạn dọn) coi như discarded, không hiện lỗi', async () => {
    tryonApi.getResult
      .mockResolvedValueOnce({ state: 'pending', job: { id: 'j1', status: 'queued' } })
      .mockResolvedValueOnce({ state: 'ready', image: IMAGE });
    tryonApi.getJob.mockRejectedValue(apiError(404, 'NOT_FOUND'));
    const { result } = setup();
    await advance(2000);
    expect(result.current.view).toMatchObject({ phase: 'ready', image: IMAGE });
  });

  it('mất mạng khi poll: hiện dải mất kết nối, giãn nhịp 2 -> 4 giây, có mạng lại thì xóa dải (S13)', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockRejectedValue(apiError(0, 'NETWORK_ERROR'));
    const { result } = setup();
    await advance(2000);
    expect(result.current.view.offline).toBe(true);
    expect(tryonApi.getJob).toHaveBeenCalledTimes(1);
    await advance(1999);
    expect(tryonApi.getJob).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(tryonApi.getJob).toHaveBeenCalledTimes(2);
    await advance(4000);
    expect(tryonApi.getJob).toHaveBeenCalledTimes(3); // lần lỗi thứ hai chờ 4 giây

    tryonApi.getJob.mockResolvedValue(job('running'));
    await advance(8000);
    expect(result.current.view.offline).toBe(false);
  });

  it('lỗi 500 khi poll: chỉ hiện mất kết nối sau 3 lần liên tiếp (E21)', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));
    const { result } = setup();
    await advance(2000);
    await advance(2000);
    expect(result.current.view.offline).toBe(false);
    await advance(4000);
    expect(result.current.view.offline).toBe(true);
  });

  it('429 khi poll: giãn nhịp theo retryAfterSeconds, không hiện lỗi', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockRejectedValueOnce(
      apiError(429, 'TOO_MANY_REQUESTS', { retryAfterSeconds: 10 }),
    );
    tryonApi.getJob.mockResolvedValue(job('running'));
    const { result } = setup();
    await advance(2000);
    expect(tryonApi.getJob).toHaveBeenCalledTimes(1);
    await advance(9000);
    expect(tryonApi.getJob).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(tryonApi.getJob).toHaveBeenCalledTimes(2);
    expect(result.current.view.phase).toBe('waiting');
  });
});

describe('useProductImage: rời sản phẩm (US-06 R7)', () => {
  it('đổi sản phẩm: ngừng poll sản phẩm cũ, kết quả muộn của nó không đổi ảnh đang xem', async () => {
    let finishOld;
    tryonApi.getJob.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishOld = () => resolve(job('succeeded', { image: IMAGE }));
        }),
    );
    tryonApi.getResult.mockImplementation(async (productId) =>
      productId === 'p1'
        ? { state: 'pending', job: { id: 'j1', status: 'running' } }
        : { state: 'blocked', errorCode: 'TRYON_BLOCKED' },
    );
    const { result, rerender } = setup();
    await advance(2000); // poll đầu của p1 đang treo
    expect(tryonApi.getJob).toHaveBeenCalledTimes(1);

    rerender({ productId: 'p2' });
    await advance(0);
    expect(result.current.view.overlayId).toBe('blocked');

    await act(async () => finishOld()); // kết quả muộn của p1
    await advance(10_000);
    expect(result.current.view).toMatchObject({
      phase: 'overlay',
      overlayId: 'blocked',
      image: null,
    });
    expect(tryonApi.getJob).toHaveBeenCalledTimes(1); // không poll p1 thêm lần nào
  });

  it('đổi sản phẩm ngay lập tức không để lộ ảnh của sản phẩm trước', async () => {
    tryonApi.getResult.mockImplementation(async (productId) =>
      productId === 'p1' ? { state: 'ready', image: IMAGE } : new Promise(() => {}),
    );
    const { result, rerender } = setup();
    await advance(0);
    expect(result.current.view.image).toEqual(IMAGE);
    rerender({ productId: 'p2' });
    expect(result.current.view).toMatchObject({ productId: 'p2', phase: 'resolving', image: null });
  });

  it('đổi sản phẩm trong 400 ms thì không POST cho sản phẩm cũ (AC-05, D-86)', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    tryonApi.createJob.mockResolvedValue({ state: 'pending', job: { id: 'j2', status: 'queued' } });
    const { rerender } = setup();
    await advance(200);
    rerender({ productId: 'p2' });
    await advance(399);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
    await advance(1);
    expect(tryonApi.createJob).toHaveBeenCalledTimes(1);
    expect(tryonApi.createJob).toHaveBeenCalledWith('p2', expect.any(Object));
  });

  it('unmount dừng poll và mọi timer', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockResolvedValue(job('running'));
    const { unmount } = setup();
    await advance(2000);
    expect(tryonApi.getJob).toHaveBeenCalledTimes(1);
    unmount();
    await advance(30_000);
    expect(tryonApi.getJob).toHaveBeenCalledTimes(1);
  });
});

describe('useProductImage: ảnh hết hạn hoặc lỗi tải (E20, E22)', () => {
  it('ảnh lỗi tải: làm mới URL một lần, lỗi lần hai thì S12; Tải lại ảnh không POST', async () => {
    const fresh = { ...IMAGE, url: 'https://storage.test/tryon.jpg?token=fresh' };
    tryonApi.getResult.mockResolvedValueOnce({ state: 'ready', image: IMAGE });
    const { result } = setup();
    await advance(0);

    tryonApi.getResult.mockResolvedValueOnce({ state: 'ready', image: fresh });
    act(() => result.current.onImageError());
    await advance(0);
    expect(result.current.view.image.url).toBe(fresh.url);

    act(() => result.current.onImageError()); // lỗi lần hai, chưa có onLoad xen giữa
    expect(result.current.view.overlayId).toBe('imageError');

    tryonApi.getResult.mockResolvedValue({ state: 'ready', image: fresh });
    act(() => result.current.reloadImage());
    await advance(0);
    expect(result.current.view.phase).toBe('ready');
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it('/result 500: S12 (không ký được URL), vẫn không tạo job', async () => {
    tryonApi.getResult.mockRejectedValue(apiError(500, 'INTERNAL_ERROR'));
    const { result } = setup();
    await advance(1000);
    expect(result.current.view.overlayId).toBe('imageError');
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it('làm mới URL trước khi hết hạn 60 giây, đổi src khi ảnh mới sẵn sàng', async () => {
    const soon = { ...IMAGE, expiresAt: new Date(Date.now() + 120_000).toISOString() };
    const fresh = { ...IMAGE, url: 'https://storage.test/tryon.jpg?token=fresh' };
    tryonApi.getResult.mockResolvedValueOnce({ state: 'ready', image: soon });
    const { result } = setup();
    await advance(0);
    tryonApi.getResult.mockResolvedValueOnce({ state: 'ready', image: fresh });
    await advance(60_000);
    expect(result.current.view.image.url).toBe(fresh.url);
  });
});

describe('useProductImage: điều hướng (US-06)', () => {
  const callbacksOf = (extra = {}) => ({
    getRoom: () => room(),
    refreshState: vi.fn(async () => ({ generation: { available: true } })),
    onGate: vi.fn(),
    onGenerated: vi.fn(),
    ...extra,
  });

  it('kết quả về muộn của sản phẩm cũ không đổi ảnh của sản phẩm đang xem (R7, AC-06)', async () => {
    let finishOld;
    tryonApi.getResult.mockImplementation(async (id) =>
      id === 'p1'
        ? { state: 'pending', job: { id: 'j1', status: 'running' } }
        : { state: 'blocked', errorCode: 'TRYON_BLOCKED' },
    );
    tryonApi.getJob.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishOld = () => resolve(job('succeeded', { image: IMAGE }));
        }),
    );
    const callbacks = callbacksOf();
    const { result, rerender } = renderHook(
      ({ productId }) => useProductImage(productId, callbacks),
      {
        initialProps: { productId: 'p1' },
      },
    );
    await advance(0);
    await advance(2000); // poll đầu tiên của p1 đang chờ server
    rerender({ productId: 'p2' });
    await advance(0);
    finishOld();
    await advance(5000);
    expect(result.current.view).toMatchObject({
      productId: 'p2',
      phase: 'overlay',
      overlayId: 'blocked',
    });
    expect(result.current.view.image).toBeNull();
    expect(callbacks.onGenerated).not.toHaveBeenCalled(); // kết quả muộn không tính là ảnh vừa hiện
  });

  it('ảnh trong bộ nhớ hiện ngay, /result vẫn được gọi để xác nhận và không đổi URL đang hiện (D-123)', async () => {
    const cache = createImageCache();
    cache.set('p1', 3, IMAGE);
    tryonApi.getResult.mockResolvedValue({
      state: 'ready',
      image: { ...IMAGE, url: 'https://storage.test/other.jpg?token=y' },
    });
    const { result } = renderHook(() =>
      useProductImage('p1', { ...callbacksOf(), imageVersion: 3, cache }),
    );
    expect(result.current.view).toMatchObject({ phase: 'ready', image: IMAGE }); // trước khi API trả lời
    await advance(0);
    expect(tryonApi.getResult).toHaveBeenCalledTimes(1);
    expect(result.current.view.image.url).toBe(IMAGE.url);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it('khóa có version: đổi ảnh sản phẩm thì không dùng ảnh cũ trong bộ nhớ', async () => {
    const cache = createImageCache();
    cache.set('p1', 1, IMAGE);
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    tryonApi.createJob.mockResolvedValue({ state: 'ready', image: IMAGE });
    const { result } = renderHook(() =>
      useProductImage('p1', { ...callbacksOf(), imageVersion: 2, cache }),
    );
    expect(result.current.view.phase).toBe('resolving');
    await advance(0);
    expect(result.current.view.phase).toBe('waiting');
  });

  it('bộ nhớ có ảnh nhưng /result nói không còn (đổi ảnh hồ sơ ở tab khác): bỏ ảnh cũ và xác định lại', async () => {
    const cache = createImageCache();
    cache.set('p1', 1, IMAGE);
    tryonApi.getResult.mockResolvedValue({ state: 'none' });
    tryonApi.createJob.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockResolvedValue(job('running'));
    const { result } = renderHook(() =>
      useProductImage('p1', { ...callbacksOf(), imageVersion: 1, cache }),
    );
    await advance(0);
    expect(result.current.view.phase).toBe('waiting');
    expect(result.current.view.image).toBeNull();
    expect(cache.get('p1', 1)).toBeNull();
  });

  it('job tìm thấy qua /result (có thể là generate trước): sau 400 ms gửi display để nâng ưu tiên, cùng job', async () => {
    tryonApi.getResult.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    tryonApi.getJob.mockResolvedValue(job('running'));
    tryonApi.createJob.mockResolvedValue({ state: 'pending', job: { id: 'j1', status: 'queued' } });
    renderHook(() => useProductImage('p1', callbacksOf()));
    await advance(399);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
    await advance(1);
    expect(tryonApi.createJob).toHaveBeenCalledTimes(1);
  });
});
