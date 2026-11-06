import { log } from '../../utils/log.js';
import { TryOnProviderError } from './provider.js';

/** Cách xử lý từng `kind` của lỗi nhà cung cấp (flows/tryon-job-worker.md mục 4). */
const PLANS = {
  transient: { errorCode: 'TRYON_FAILED', retry: true, level: 'warn' },
  blocked: { errorCode: 'TRYON_BLOCKED', retry: false, level: 'info' },
  photo_unusable: { errorCode: 'TRYON_PHOTO_UNUSABLE', retry: false, level: 'info' },
  input: { errorCode: 'TRYON_FAILED', retry: false, level: 'error' },
  config: { errorCode: 'TRYON_UNAVAILABLE', retry: false, level: 'error', pause: true },
};

const failureMeta = (err) => ({ name: err?.name, code: err?.code });

/**
 * Worker gửi, poll, retry, hoàn tất job (flows/tryon-job-worker.md, tryon-job-finish.md).
 * Không giữ trạng thái job trong bộ nhớ: mọi quyết định nằm ở DB, khởi động lại thì chạy tiếp (D-99).
 * `tick()` là một vòng đầy đủ và xác định, test gọi trực tiếp; `start()` chỉ lặp `tick` bằng timer đã `unref`.
 * Log chỉ có jobId, userId, mã lỗi: không ảnh, base64, URL, đường dẫn, message của nhà cung cấp (AC-20).
 *
 * @param {{
 *   repository: ReturnType<import('../../repositories/tryonRepository.js').createTryonRepository>,
 *   provider: import('./provider.js').TryOnProvider,
 *   profileStorage: { download(path: string): Promise<Buffer> },
 *   tryonStorage: { newPath(userId: string): string, uploadAt(path: string, jpeg: Buffer): Promise<string> },
 *   productImageUrl: (path: string) => string,
 *   image: {
 *     prepareModelImage(buffer: Buffer, maxSide: number): Promise<Buffer>,
 *     normalizeResult(buffer: Buffer, options?: { maxBytes?: number }): Promise<{ buffer: Buffer, width: number, height: number }>,
 *   },
 *   gate: { pause(): void, isPaused(): boolean },
 *   cleanup: { kick(): unknown },
 *   settings: {
 *     tickMs: number, retryDelaySeconds: number, maxAttempts: number,
 *     modelImageMaxSide: number, maxResultBytes: number, claimBatch: number, pollBatch?: number,
 *   },
 *   logger?: Partial<Record<'info' | 'warn' | 'error', Function>>,
 * }} deps
 */
export function createTryonWorker({
  repository,
  provider,
  profileStorage,
  tryonStorage,
  productImageUrl,
  image,
  gate,
  cleanup,
  settings,
  logger = console,
}) {
  const { pollBatch = 20 } = settings;
  const inFlightJobs = new Set(); // chỉ để không xử lý trùng một job trong cùng tiến trình
  const pending = new Set();
  let stopped = true;
  let loop = null;
  let sleeper = null;
  let wakeRequested = false; // wake() đến lúc worker đang bận thì lần ngủ kế tiếp bỏ qua

  /** Chạy `fn` cho một job, không bao giờ ném; bỏ qua nếu job đang được xử lý ở tick trước. */
  const track = (jobId, event, fn) => {
    if (inFlightJobs.has(jobId)) return Promise.resolve();
    inFlightJobs.add(jobId);
    const run = (async () => {
      try {
        await fn();
      } catch (err) {
        log(logger, 'error', event, { jobId, ...failureMeta(err) });
      } finally {
        inFlightJobs.delete(jobId);
      }
    })();
    pending.add(run);
    run.finally(() => pending.delete(run));
    return run;
  };

  /** Ghi nhận lỗi của job qua `fail_tryon_job`: thử lại hoặc thất bại, và chốt ngân sách theo `costMaybeIncurred`. */
  async function failJob(jobId, err) {
    const providerError = err instanceof TryOnProviderError ? err : null;
    // Lỗi không phải của nhà cung cấp (đọc ảnh, DB, Storage) xảy ra trước khi gửi: coi là tạm thời, chưa tốn tiền.
    const plan = providerError ? PLANS[providerError.kind] : PLANS.transient;
    const providerCode = providerError?.providerCode ?? 'LocalError';

    if (plan.pause) {
      gate.pause();
      log(logger, 'error', 'TRYON_PROVIDER_CONFIG_ERROR', { jobId, providerCode });
    } else {
      log(logger, plan.level, 'TRYON_PROVIDER_ERROR', {
        jobId,
        kind: providerError?.kind ?? 'transient',
        providerCode,
      });
    }

    const outcome = await repository.failJob({
      jobId,
      errorCode: plan.errorCode,
      costIncurred: providerError?.costMaybeIncurred ?? false,
      retrySeconds: plan.retry ? settings.retryDelaySeconds : null,
      maxAttempts: settings.maxAttempts,
    });
    // fail_tryon_job có thể đã đưa file dở dang vào hàng đợi xóa.
    if (outcome === 'failed') cleanup.kick();
  }

  /** Gửi một job vừa nhận. */
  async function submit(job) {
    let providerJobId;
    try {
      const photo = await profileStorage.download(job.photoPath);
      const modelImage = await image.prepareModelImage(photo, settings.modelImageMaxSide);
      // Kiểm lần cuối ngay trước khi ảnh rời khỏi máy (D-71, D-79).
      if ((await repository.checkBeforeSubmit(job.jobId)) !== 'ok') return;
      ({ providerJobId } = await provider.submit({
        modelImage,
        garmentImageUrl: productImageUrl(job.imagePath),
      }));
    } catch (err) {
      await failJob(job.jobId, err);
      return;
    }
    // Đã gửi. Ghi DB lỗi thì KHÔNG fail/thử lại (có thể gửi hai lần, mất hai credit): để hết lease,
    // expire_tryon_jobs đánh dấu failed và tính vào ngân sách.
    await repository.markSubmitted(job.jobId, providerJobId);
  }

  /** Lưu kết quả: chuẩn hóa -> giữ chỗ đường dẫn -> upload -> complete. */
  async function finish(job, rawImage) {
    let normalized;
    try {
      normalized = await image.normalizeResult(rawImage, { maxBytes: settings.maxResultBytes });
    } catch {
      // Nhà cung cấp trả thứ không phải ảnh: đã tốn tiền, người mua không nhận được gì (E17).
      log(logger, 'error', 'TRYON_RESULT_INVALID', { jobId: job.jobId });
      await repository.failJob({
        jobId: job.jobId,
        errorCode: 'TRYON_FAILED',
        costIncurred: true,
        retrySeconds: null,
        maxAttempts: settings.maxAttempts,
      });
      return;
    }

    const path = tryonStorage.newPath(job.userId);
    // Ghi đường dẫn TRƯỚC khi upload: chết giữa chừng vẫn biết file nào cần xóa.
    if (!(await repository.reservePath(job.jobId, path))) {
      const status = await repository.completeJob({
        jobId: job.jobId,
        path: null,
        width: null,
        height: null,
      });
      log(logger, 'info', 'TRYON_RESULT_DISCARDED', { jobId: job.jobId, status });
      return;
    }

    let uploaded = false;
    for (let attempt = 0; attempt < 2 && !uploaded; attempt += 1) {
      try {
        await tryonStorage.uploadAt(path, normalized.buffer);
        uploaded = true;
      } catch {
        // thử lại một lần
      }
    }
    if (!uploaded) {
      log(logger, 'error', 'TRYON_UPLOAD_FAILED', { jobId: job.jobId });
      await repository.failJob({
        jobId: job.jobId,
        errorCode: 'TRYON_FAILED',
        costIncurred: true,
        retrySeconds: null,
        maxAttempts: settings.maxAttempts,
      });
      cleanup.kick();
      return;
    }

    const status = await repository.completeJob({
      jobId: job.jobId,
      path,
      width: normalized.width,
      height: normalized.height,
    });
    log(logger, 'info', status === 'saved' ? 'TRYON_JOB_SUCCEEDED' : 'TRYON_RESULT_DISCARDED', {
      jobId: job.jobId,
      status,
    });
    // Không được lưu (hết hiệu lực, quá hạn): file vừa upload nằm trong hàng đợi xóa.
    if (status !== 'saved') cleanup.kick();
  }

  /** Hỏi trạng thái một job đã gửi. */
  async function poll(job) {
    let status;
    try {
      status = await provider.getStatus(job.providerJobId);
    } catch (err) {
      // Lỗi khi đọc trạng thái: bỏ qua, lịch đã dời nên lần sau poll lại. Job quá hạn sẽ do expire xử lý.
      log(logger, 'warn', 'TRYON_STATUS_CHECK_FAILED', {
        jobId: job.jobId,
        providerCode: err?.providerCode,
      });
      return;
    }
    if (status.state === 'pending') return;
    if (status.state === 'failed') return failJob(job.jobId, status.error);
    return finish(job, status.image);
  }

  /** Các bước DB của một tick. Trả các promise xử lý job (không ném) để người gọi chờ hoặc bỏ mặc. */
  async function beginTick() {
    const work = [];
    try {
      const expired = await repository.expireJobs();
      if (expired > 0) {
        log(logger, 'warn', 'TRYON_JOBS_EXPIRED', { count: expired });
        cleanup.kick();
      }
    } catch (err) {
      log(logger, 'error', 'TRYON_WORKER_EXPIRE_FAILED', failureMeta(err));
    }

    if (!gate.isPaused()) {
      try {
        for (const job of await repository.claimJobs(settings.claimBatch)) {
          work.push(track(job.jobId, 'TRYON_WORKER_SUBMIT_FAILED', () => submit(job)));
        }
      } catch (err) {
        log(logger, 'error', 'TRYON_WORKER_CLAIM_FAILED', failureMeta(err));
      }
    }

    try {
      for (const job of await repository.nextPolls(pollBatch)) {
        work.push(track(job.jobId, 'TRYON_WORKER_POLL_FAILED', () => poll(job)));
      }
    } catch (err) {
      log(logger, 'error', 'TRYON_WORKER_POLL_QUERY_FAILED', failureMeta(err));
    }
    return work;
  }

  const sleep = (ms) =>
    new Promise((resolve) => {
      if (wakeRequested) {
        wakeRequested = false;
        return resolve();
      }
      const timer = setTimeout(resolve, ms);
      timer.unref();
      sleeper = () => {
        clearTimeout(timer);
        sleeper = null;
        resolve();
      };
    });

  return {
    /** Một vòng đầy đủ, chờ mọi job xử lý xong. Dùng trong test và script. */
    async tick() {
      await Promise.all(await beginTick());
    },

    /** Đánh thức ngay khi có job mới (thay vì chờ tick kế tiếp). */
    wake() {
      if (sleeper) sleeper();
      else wakeRequested = true;
    },

    start() {
      if (loop) return;
      stopped = false;
      loop = (async () => {
        while (!stopped) {
          await beginTick(); // không chờ job xử lý: một lần gửi chậm không được làm chậm poll của job khác
          if (!stopped) await sleep(settings.tickMs);
        }
      })();
    },

    /** Dừng vòng lặp và chờ các job đang xử lý. */
    async stop() {
      stopped = true;
      sleeper?.();
      await loop;
      loop = null;
      await Promise.allSettled([...pending]);
    },
  };
}
