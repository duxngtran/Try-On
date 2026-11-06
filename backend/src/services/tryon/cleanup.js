import { log } from '../../utils/log.js';

const ORPHAN_LOG_FROM_ATTEMPT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hàng đợi xóa file try-on, dọn 90 ngày, dọn job cũ (flows/tryon-cleanup.md). Chạy trong tiến trình Express.
 * Lỗi Storage giữ dòng trong hàng đợi để thử lại tới khi được (D-100); không làm hỏng request nào.
 * Không bao giờ log đường dẫn file, chỉ số lượng (AC-20).
 * @param {{
 *   repository: Pick<ReturnType<import('../../repositories/tryonRepository.js').createTryonRepository>,
 *     'claimFileDeletions' | 'ackFileDeletions' | 'purgeStaleImages' | 'purgeOldJobs'>,
 *   storage: { removeMany(paths: string[]): Promise<void> },
 *   logger?: Partial<Record<'info' | 'warn' | 'error', Function>>,
 *   tickSeconds: number,
 *   batch?: number,
 * }} deps
 */
export function createTryonCleanup({
  repository,
  storage,
  logger = console,
  tickSeconds,
  batch = 50,
}) {
  let running = null;
  let again = false;
  let tickTimer = null;
  let dailyTimer = null;

  /** Xóa mọi file đến hạn. Dừng ở lần lỗi đầu tiên: lịch thử lại đã được DB dời. Trả số file đã xóa. */
  async function runOnce() {
    let removed = 0;
    for (;;) {
      const claimed = await repository.claimFileDeletions(batch);
      if (claimed.length === 0) return removed;
      const paths = claimed.map((c) => c.path);
      try {
        await storage.removeMany(paths);
        await repository.ackFileDeletions(paths);
        removed += paths.length;
      } catch (err) {
        const orphans = claimed.filter((c) => c.attempts >= ORPHAN_LOG_FROM_ATTEMPT).length;
        if (orphans > 0) log(logger, 'error', 'ORPHAN_TRYON_IMAGE', { count: orphans });
        log(logger, 'warn', 'TRYON_CLEANUP_DELETE_FAILED', {
          count: paths.length,
          name: err?.name,
        });
        return removed;
      }
    }
  }

  /** Best-effort, gộp các lần gọi chồng nhau. Không bao giờ ném; promise trả về để test chờ. */
  function kick() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await runOnce();
        } catch (err) {
          log(logger, 'error', 'TRYON_CLEANUP_FAILED', { name: err?.name, code: err?.code });
        }
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  /** Việc hằng ngày: ảnh quá hạn 90 ngày (trigger đưa file vào hàng đợi), job cũ. */
  async function runDaily() {
    try {
      const images = await repository.purgeStaleImages();
      const jobs = await repository.purgeOldJobs();
      log(logger, 'info', 'TRYON_DAILY_PURGE', { images, jobs });
      await kick();
    } catch (err) {
      log(logger, 'error', 'TRYON_DAILY_PURGE_FAILED', { name: err?.name, code: err?.code });
    }
  }

  return {
    runOnce,
    kick,
    runDaily,

    /** Timer đều `unref`: không giữ tiến trình sống. */
    start() {
      if (tickTimer) return;
      tickTimer = setInterval(kick, tickSeconds * 1000);
      dailyTimer = setInterval(runDaily, DAY_MS);
      tickTimer.unref();
      dailyTimer.unref();
      // Server dev có thể không sống đủ 24 giờ liên tục, nên chạy luôn khi khởi động.
      void runDaily();
    },

    async stop() {
      clearInterval(tickTimer);
      clearInterval(dailyTimer);
      tickTimer = null;
      dailyTimer = null;
      await running;
    },
  };
}
