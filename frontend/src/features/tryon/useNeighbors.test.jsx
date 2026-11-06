import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { tryonApi } from './tryonApi.js';
import { createImageCache } from './useImageCache.js';
import { useNeighbors } from './useNeighbors.js';

vi.mock('./tryonApi.js', () => ({
  tryonApi: { getResult: vi.fn(), createJob: vi.fn(), getJob: vi.fn() },
}));

const IMAGE = {
  url: 'https://storage.test/tryon.jpg?token=x',
  expiresAt: '2099-01-01T00:00:00.000Z',
  width: 864,
  height: 1296,
};
const prod = (n) => ({ id: `p${n}`, image: { version: 1 } });
const advance = (ms) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function setup(overrides = {}) {
  const cache = createImageCache();
  const onGenerated = vi.fn();
  const room = { prefetchAllowed: true, quota: { remaining: 10 }, ...overrides.room };
  const props = {
    product: prod(1),
    prev: null,
    next: prod(2),
    ready: true,
    cache,
    getRoom: () => room,
    onGenerated,
    ...overrides.props,
  };
  const hook = renderHook((p) => useNeighbors(p), { initialProps: props });
  return { ...hook, cache, onGenerated, props };
}

const setVisibility = (value) =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  tryonApi.getResult.mockResolvedValue({ state: 'none' });
  tryonApi.createJob.mockResolvedValue({ state: 'skipped', reason: 'busy' });
  tryonApi.getJob.mockResolvedValue({ id: 'j2', status: 'running' });
});
afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
  delete navigator.connection;
});

describe('generate trước (D-85, AC-03, AC-04)', () => {
  it('dừng đủ 1 giây ở ảnh đã sẵn sàng thì gửi đúng 1 job prefetch cho sản phẩm kế tiếp, không cho sản phẩm khác', async () => {
    setup({ props: { prev: prod(0) } });
    await advance(999);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
    await advance(1);
    expect(tryonApi.createJob).toHaveBeenCalledTimes(1);
    expect(tryonApi.createJob).toHaveBeenCalledWith(
      'p2',
      expect.objectContaining({ purpose: 'prefetch' }),
    );
    await advance(20_000);
    expect(tryonApi.createJob).toHaveBeenCalledTimes(1); // không có job thứ hai, không theo chiều quay lại
  });

  it.each([
    ['ảnh hiện tại chưa sẵn sàng hoặc đang lỗi', { props: { ready: false } }],
    ['ở cuối danh sách (không có sản phẩm kế)', { props: { next: null } }],
    ['prefetchAllowed = false (tắt hoặc từ 80% ngân sách)', { room: { prefetchAllowed: false } }],
    ['còn đúng 3 lượt', { room: { quota: { remaining: 3 } } }],
    ['hết lượt', { room: { quota: { remaining: 0 } } }],
  ])('không gửi khi %s', async (_label, overrides) => {
    setup(overrides);
    await advance(5_000);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it('không gửi khi tab bị ẩn hoặc trình duyệt bật tiết kiệm dữ liệu', async () => {
    setVisibility('hidden');
    setup();
    await advance(5_000);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
    expect(tryonApi.getResult).not.toHaveBeenCalled();

    setVisibility('visible');
    navigator.connection = { saveData: true };
    setup();
    await advance(5_000);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it.each([
    ['ảnh kế tiếp đã có', { state: 'ready', image: IMAGE }],
    ['job kế tiếp đang chạy', { state: 'pending', job: { id: 'j2', status: 'running' } }],
    ['ảnh kế tiếp bị chặn theo khóa', { state: 'blocked', errorCode: 'TRYON_BLOCKED' }],
  ])('không tạo job khi %s', async (_label, result) => {
    tryonApi.getResult.mockResolvedValue(result);
    setup();
    await advance(5_000);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it('đổi sản phẩm trước khi đủ 1 giây thì hủy, không gửi gì cho sản phẩm vừa rời', async () => {
    const { unmount } = setup();
    await advance(900);
    unmount();
    await advance(5_000);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it('backend bỏ qua (skipped) hoặc lỗi thì im lặng, không poll, không ném', async () => {
    tryonApi.createJob.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 500 }));
    setup();
    await advance(1_000);
    expect(tryonApi.getJob).not.toHaveBeenCalled();

    tryonApi.createJob.mockResolvedValueOnce({ state: 'skipped', reason: 'low_quota' });
    setup();
    await advance(5_000);
    expect(tryonApi.getJob).not.toHaveBeenCalled();
  });

  it('job xong thì ảnh vào bộ nhớ (hiện ngay khi chuyển tới) và làm mới /state vì lượt đã tăng', async () => {
    tryonApi.createJob.mockResolvedValue({ state: 'pending', job: { id: 'j2', status: 'queued' } });
    tryonApi.getJob.mockResolvedValueOnce({ id: 'j2', status: 'running' });
    tryonApi.getJob.mockResolvedValueOnce({ id: 'j2', status: 'succeeded', image: IMAGE });
    const { cache, onGenerated } = setup();
    await advance(1_000);
    expect(cache.get('p2', 1)).toBeNull();
    await advance(4_000);
    expect(cache.get('p2', 1)).toEqual(IMAGE);
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });

  it('job thất bại thì im lặng: không ghi bộ nhớ, không làm mới /state', async () => {
    tryonApi.createJob.mockResolvedValue({ state: 'pending', job: { id: 'j2', status: 'queued' } });
    tryonApi.getJob.mockResolvedValue({
      id: 'j2',
      status: 'failed',
      error: { code: 'TRYON_FAILED' },
    });
    const { cache, onGenerated } = setup();
    await advance(5_000);
    expect(cache.get('p2', 1)).toBeNull();
    expect(onGenerated).not.toHaveBeenCalled();
  });
});

describe('tải trước ảnh liền kề (R10)', () => {
  it('chỉ GET /result của sản phẩm liền trước và liền sau, ảnh đã có vào bộ nhớ; không bao giờ POST khi chưa sẵn sàng', async () => {
    tryonApi.getResult.mockImplementation(async (id) =>
      id === 'p0' ? { state: 'ready', image: IMAGE } : { state: 'none' },
    );
    const { cache } = setup({ props: { prev: prod(0), ready: false } });
    await advance(399);
    expect(tryonApi.getResult).not.toHaveBeenCalled(); // chưa dừng đủ 400 ms
    await advance(1);
    expect(tryonApi.getResult.mock.calls.map((c) => c[0]).sort()).toEqual(['p0', 'p2']);
    expect(cache.get('p0', 1)).toEqual(IMAGE);
    expect(cache.get('p2', 1)).toBeNull();
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });

  it('lỗi mạng hoặc 404 của sản phẩm liền kề là im lặng', async () => {
    tryonApi.getResult.mockRejectedValue(Object.assign(new Error('x'), { status: 404 }));
    setup({ props: { ready: false } });
    await advance(5_000);
    expect(tryonApi.createJob).not.toHaveBeenCalled();
  });
});
