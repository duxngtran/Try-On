import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTryonCleanup } from '../src/services/tryon/cleanup.js';

const SECRET_PATH = '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg';

/** Repository + storage giả nhỏ gọn; `queue` là hàng đợi xóa, claim tăng attempts như SQL. */
function setup({ paths = [SECRET_PATH], storageFails = 0, batch = 50 } = {}) {
  const queue = new Map(paths.map((p) => [p, 0]));
  const logs = [];
  const logger = {
    error: (event, meta) => logs.push({ event, meta }),
    warn: (event, meta) => logs.push({ event, meta }),
    info: (event, meta) => logs.push({ event, meta }),
  };
  const state = { storageFails, removeCalls: [], claimCalls: 0, repoThrows: false };
  const repository = {
    async claimFileDeletions(n) {
      state.claimCalls += 1;
      if (state.repoThrows) throw new Error('db down');
      return [...queue.entries()].slice(0, n).map(([path, attempts]) => {
        queue.set(path, attempts + 1);
        return { path, attempts: attempts + 1 };
      });
    },
    async ackFileDeletions(done) {
      for (const p of done) queue.delete(p);
    },
    purgeStaleImages: vi.fn(async () => 3),
    purgeOldJobs: vi.fn(async () => 2),
  };
  const storage = {
    async removeMany(list) {
      state.removeCalls.push(list);
      if (state.storageFails > 0) {
        state.storageFails -= 1;
        throw new Error('storage down');
      }
    },
  };
  const cleanup = createTryonCleanup({ repository, storage, logger, tickSeconds: 30, batch });
  return { cleanup, queue, logs, state, repository };
}

afterEach(() => vi.useRealTimers());

describe('hàng đợi xóa file (T-70, D-100)', () => {
  it('Storage lỗi: dòng còn trong hàng đợi, không ném; Storage hồi lại thì xóa và ack', async () => {
    const { cleanup, queue, state } = setup({ storageFails: 1 });
    await expect(cleanup.runOnce()).resolves.toBe(0);
    expect(queue.has(SECRET_PATH)).toBe(true);
    await expect(cleanup.runOnce()).resolves.toBe(1);
    expect(queue.size).toBe(0);
    expect(state.removeCalls).toHaveLength(2);
  });

  it('từ lần thứ 5 log ORPHAN_TRYON_IMAGE kèm số lượng; không bao giờ log đường dẫn', async () => {
    const { cleanup, logs } = setup({ storageFails: 10 });
    for (let i = 0; i < 6; i += 1) await cleanup.runOnce();
    const orphan = logs.filter((l) => l.event === 'ORPHAN_TRYON_IMAGE');
    expect(orphan.length).toBe(2); // lần 5 và 6
    expect(orphan[0].meta).toEqual({ count: 1 });
    expect(JSON.stringify(logs)).not.toContain(SECRET_PATH);
    expect(JSON.stringify(logs)).not.toMatch(/\.jpg|1111/);
  });

  it('xóa theo lô, hết hàng đợi thì dừng', async () => {
    const paths = Array.from({ length: 120 }, (_, i) => `u/${i}.jpg`);
    const { cleanup, queue, state } = setup({ paths, batch: 50 });
    await expect(cleanup.runOnce()).resolves.toBe(120);
    expect(state.removeCalls.map((c) => c.length)).toEqual([50, 50, 20]);
    expect(queue.size).toBe(0);
  });

  it('kick không bao giờ ném, kể cả khi DB lỗi; log mã sự kiện không kèm dữ liệu', async () => {
    const { cleanup, state, logs } = setup();
    state.repoThrows = true;
    await expect(cleanup.kick()).resolves.toBeUndefined();
    expect(logs.map((l) => l.event)).toContain('TRYON_CLEANUP_FAILED');
    expect(JSON.stringify(logs)).not.toContain('db down');
  });

  it('nhiều kick chồng nhau được gộp: không chạy song song, nhưng không bỏ sót việc đến sau', async () => {
    const queue = new Set(['a.jpg']);
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let concurrent = 0;
    let maxConcurrent = 0;
    const cleanup = createTryonCleanup({
      repository: {
        claimFileDeletions: async (n) =>
          [...queue].slice(0, n).map((path) => ({ path, attempts: 1 })),
        ackFileDeletions: async (done) => done.forEach((p) => queue.delete(p)),
      },
      storage: {
        async removeMany() {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await gate;
          concurrent -= 1;
        },
      },
      logger: {},
      tickSeconds: 30,
    });
    const first = cleanup.kick();
    await Promise.resolve();
    cleanup.kick();
    cleanup.kick();
    queue.add('b.jpg'); // việc đến lúc đang chạy
    release();
    await first;
    expect(maxConcurrent).toBe(1);
    expect(queue.size).toBe(0);
  });
});

describe('việc theo lịch (T-70)', () => {
  it('start(): dọn hằng ngày ngay lúc khởi động, tick kick đều đặn; stop() dọn timer', async () => {
    vi.useFakeTimers();
    const { cleanup, repository, state } = setup();
    cleanup.start();
    cleanup.start(); // idempotent
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.purgeStaleImages).toHaveBeenCalledTimes(1);
    expect(repository.purgeOldJobs).toHaveBeenCalledTimes(1);

    const before = state.claimCalls;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.claimCalls).toBeGreaterThan(before);

    await cleanup.stop();
    const after = state.claimCalls;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(state.claimCalls).toBe(after);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('việc hằng ngày lỗi chỉ log, không ném', async () => {
    const { cleanup, repository, logs } = setup();
    repository.purgeStaleImages.mockRejectedValueOnce(new Error('boom'));
    await expect(cleanup.runDaily()).resolves.toBeUndefined();
    expect(logs.map((l) => l.event)).toContain('TRYON_DAILY_PURGE_FAILED');
  });
});
