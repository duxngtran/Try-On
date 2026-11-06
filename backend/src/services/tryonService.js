import { AppError } from '../utils/AppError.js';
import { log } from '../utils/log.js';
import { encodeCursor, decodeCursor } from '../validation/tryonSchemas.js';
import { deriveCompletion } from './profileDomain.js';
import { TRYON_CONSENT_VERSION } from './tryon/config.js';

const ERRORS = {
  consentRequired: () =>
    new AppError(403, 'TRYON_CONSENT_REQUIRED', 'Bạn cần đồng ý gửi ảnh cho dịch vụ AI để thử đồ.'),
  profileIncomplete: (missing) =>
    new AppError(409, 'PROFILE_INCOMPLETE', 'Hoàn thiện hồ sơ để bắt đầu thử đồ.', { missing }),
  productGone: () => new AppError(404, 'NOT_FOUND', 'Sản phẩm này không còn bán.'),
  categoryGone: () => new AppError(404, 'NOT_FOUND', 'Danh mục không còn tồn tại.'),
  jobNotFound: () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy tác vụ.'),
  unavailable: () => new AppError(503, 'TRYON_UNAVAILABLE', 'Tính năng tạo ảnh đang tạm dừng.'),
  busy: (retryAfterSeconds) =>
    new AppError(
      429,
      'TOO_MANY_REQUESTS',
      'Bạn đang tạo nhiều ảnh cùng lúc, vui lòng thử lại sau.',
      { retryAfterSeconds },
    ),
  quota: (scope, retryAfterSeconds, resetsAt) =>
    new AppError(429, 'TRYON_QUOTA_EXCEEDED', 'Bạn đã dùng hết lượt tạo ảnh.', {
      retryAfterSeconds,
      scope,
      resetsAt,
    }),
};

const JOB_ERROR_MESSAGES = {
  TRYON_FAILED: 'Chưa tạo được ảnh, vui lòng thử lại.',
  TRYON_TIMEOUT: 'Việc tạo ảnh mất quá nhiều thời gian, vui lòng thử lại.',
  TRYON_BLOCKED: 'Không thể tạo ảnh thử đồ với sản phẩm này.',
  TRYON_PHOTO_UNUSABLE: 'Ảnh của bạn chưa phù hợp để thử đồ.',
  TRYON_UNAVAILABLE: 'Tính năng tạo ảnh đang tạm dừng.',
};

const SKIP_REASONS = {
  skipped_low_quota: 'low_quota',
  skipped_busy: 'busy',
  skipped_budget: 'budget',
};
const QUOTA_SCOPES = { quota_day: 'day', quota_month: 'month', quota_pending: 'pending' };

/** Postgres trả `...893014+00:00`; contract yêu cầu ISO 8601 UTC dạng `...893Z`. */
const iso = (value) => (value ? new Date(value).toISOString() : null);

/**
 * Nghiệp vụ phòng thử đồ (US-05). Mọi hàm nhận `userId` lấy từ token. Client không bao giờ gửi version,
 * userId hay URL ảnh: khóa cache do DB tự đọc trong `create_tryon_job`.
 * Log chỉ có jobId/productId/mã sự kiện: không ảnh, đường dẫn, signed URL, số đo (AC-20).
 * @param {{
 *   tryonRepository: ReturnType<import('../repositories/tryonRepository.js').createTryonRepository>,
 *   categoryRepository: { listWithCounts(): Promise<Array<{ id: string, name: string, product_count: number }>> },
 *   tryonStorage: { sign(path: string): Promise<{ url: string | null, expiresAt: string | null }> },
 *   productImageStorage: { publicUrl(path: string): string },
 *   providerGate: { isPaused(): boolean },
 *   limits: { dailyLimit: number, monthlyLimit: number },
 *   flags: { enabled: boolean, prefetchEnabled: boolean },
 *   wakeWorker?: () => void,
 *   kickCleanup?: () => void,
 *   logger?: Partial<Record<'info' | 'warn' | 'error', Function>>,
 * }} deps
 */
export function createTryonService({
  tryonRepository: repo,
  categoryRepository,
  tryonStorage,
  productImageStorage,
  providerGate,
  limits,
  flags,
  wakeWorker = () => {},
  kickCleanup = () => {},
  logger = console,
}) {
  const requireProfileState = async (userId) => {
    const row = await repo.getProfileState(userId);
    // Trigger DB bảo đảm mỗi user có một hồ sơ; thiếu là lỗi hệ thống.
    if (!row) throw new Error('Không tìm thấy hồ sơ của user');
    return row;
  };

  const consentView = (row) => {
    const accepted =
      Boolean(row.tryon_consent_at) &&
      !row.tryon_consent_withdrawn_at &&
      row.tryon_consent_version === TRYON_CONSENT_VERSION;
    return {
      accepted,
      acceptedAt: iso(row.tryon_consent_at),
      version: row.tryon_consent_version ?? null,
      requiredVersion: TRYON_CONSENT_VERSION,
      withdrawnAt: iso(row.tryon_consent_withdrawn_at),
    };
  };

  const getState = async (userId) => {
    const [profile, usage] = await Promise.all([
      requireProfileState(userId),
      repo.getUsage(userId),
    ]);
    const { profileCompleted, missing } = deriveCompletion(profile);
    const available = flags.enabled && !providerGate.isPaused() && usage.budgetOk;
    return {
      profile: { completed: profileCompleted, missing },
      consent: consentView(profile),
      quota: {
        dailyLimit: limits.dailyLimit,
        dailyUsed: usage.usedDay,
        dailyResetsAt: iso(usage.dayResetsAt),
        monthlyLimit: limits.monthlyLimit,
        monthlyUsed: usage.usedMonth,
        monthlyResetsAt: iso(usage.monthResetsAt),
        held: usage.held,
        remaining: Math.max(
          0,
          Math.min(limits.dailyLimit - usage.usedDay, limits.monthlyLimit - usage.usedMonth) -
            usage.held,
        ),
      },
      generation: {
        available,
        prefetchAllowed: available && flags.prefetchEnabled && usage.prefetchOk,
      },
    };
  };

  /** Ký URL ảnh try-on. Không ký được thì ném (500): FE hiện ảnh trải phẳng và nút Tải lại ảnh (E22). */
  const toImage = async (path, width, height) => {
    const signed = await tryonStorage.sign(path);
    if (!signed.url) throw new Error('Không ký được URL ảnh try-on');
    return { url: signed.url, expiresAt: signed.expiresAt, width, height };
  };

  const missingParts = async (userId) =>
    deriveCompletion(await requireProfileState(userId)).missing;

  const toTryOnProduct = (row, categoryId) => ({
    id: row.id,
    name: row.name,
    priceVnd: row.priceVnd,
    category: { id: categoryId, name: row.categoryName },
    image: { url: productImageStorage.publicUrl(row.imagePath), version: row.imageVersion },
    position: row.position,
  });

  /** Kết quả của `create_tryon_job` khi người mua không có ảnh và không tạo được job. */
  const failureOf = async (userId, outcome) => {
    switch (outcome.status) {
      case 'profile_incomplete':
        return ERRORS.profileIncomplete(await missingParts(userId));
      case 'consent_required':
        return ERRORS.consentRequired();
      case 'not_found':
        return ERRORS.productGone();
      case 'busy':
        return ERRORS.busy(outcome.retryAfterSeconds ?? 5);
      case 'budget_exceeded':
        // Không nêu số tiền ra client; chỉ log mã để vận hành thấy (US-05 E10).
        log(logger, 'warn', 'TRYON_BUDGET_EXCEEDED');
        return ERRORS.unavailable();
      default: {
        const scope = QUOTA_SCOPES[outcome.status];
        if (!scope) throw new Error(`create_tryon_job trả trạng thái lạ: ${outcome.status}`);
        const seconds = outcome.retryAfterSeconds;
        return ERRORS.quota(
          scope,
          seconds,
          scope === 'pending' ? null : new Date(Date.now() + seconds * 1000).toISOString(),
        );
      }
    }
  };

  /** Chỉ đọc, không bao giờ tạo job, không tốn lượt. */
  const getResult = async (userId, productId) => {
    const result = await repo.getResult({ userId, productId });
    switch (result.state) {
      case 'profile_incomplete':
        throw ERRORS.profileIncomplete(await missingParts(userId));
      case 'consent_required':
        throw ERRORS.consentRequired();
      case 'not_found':
        throw ERRORS.productGone();
      case 'ready':
        return {
          state: 'ready',
          image: await toImage(result.storagePath, result.width, result.height),
        };
      case 'pending':
        return { state: 'pending', job: { id: result.jobId, status: result.jobStatus } };
      case 'blocked':
        return { state: 'blocked', errorCode: result.errorCode };
      default:
        return { state: 'none' };
    }
  };

  return {
    getState,
    getResult,

    async acceptConsent(userId) {
      await requireProfileState(userId);
      await repo.acceptConsent(userId);
      return getState(userId);
    },

    /** Idempotent. Ảnh try-on bị xóa trong DB; file xóa qua hàng đợi, kick để xóa sớm. */
    async withdrawConsent(userId) {
      await requireProfileState(userId);
      await repo.withdrawConsent(userId);
      kickCleanup();
      return getState(userId);
    },

    async listCategories() {
      const rows = await categoryRepository.listWithCounts();
      return {
        categories: rows
          .filter((r) => r.product_count > 0)
          .map((r) => ({ id: r.id, name: r.name, productCount: r.product_count })),
      };
    },

    /**
     * @param {string} categoryId
     * @param {{ limit: number, after?: string, before?: string, at?: string }} query đã validate
     */
    async listProducts(categoryId, { limit, after, before, at }) {
      if (!(await repo.categoryIsActive(categoryId))) throw ERRORS.categoryGone();

      let page = { cursor: null, direction: 'next', inclusive: false };
      let anchor;
      if (after) page = { cursor: decodeCursor(after), direction: 'next', inclusive: false };
      if (before) page = { cursor: decodeCursor(before), direction: 'prev', inclusive: false };
      if (at) {
        const found = await repo.findProductAnchor(at);
        if (found && found.categoryId === categoryId) {
          // Sản phẩm đã xóa: bắt đầu từ sản phẩm kế tiếp (E3 của US-06).
          page = {
            cursor: { createdAt: found.createdAt, id: found.id },
            direction: 'next',
            inclusive: !found.deleted,
          };
          anchor = { found: true, deleted: found.deleted };
        } else {
          anchor = { found: false, deleted: false };
        }
      }

      const rows = await repo.listProducts({ categoryId, limit, ...page });
      let total = rows[0]?.total;
      if (total === undefined) {
        // Trang rỗng không mang `total`; hỏi lại trang đầu để biết danh mục còn bao nhiêu sản phẩm.
        const first = await repo.listProducts({
          categoryId,
          limit: 1,
          cursor: null,
          direction: 'next',
          inclusive: false,
        });
        total = first[0]?.total ?? 0;
      }
      const head = rows[0];
      const tail = rows.at(-1);
      return {
        items: rows.map((r) => toTryOnProduct(r, categoryId)),
        total,
        prevCursor: head && head.position > 1 ? encodeCursor(head) : null,
        nextCursor: tail && tail.position < total ? encodeCursor(tail) : null,
        ...(anchor ? { anchor } : {}),
      };
    },

    /**
     * Idempotent theo khóa cache (D-75). Trả `{ httpStatus, body }`: 200 khi đã có kết quả hoặc bị bỏ qua,
     * 202 khi job đang chờ.
     * @param {'display' | 'prefetch'} purpose
     */
    async createJob(userId, productId, purpose) {
      const prefetch = purpose === 'prefetch';
      const available = flags.enabled && !providerGate.isPaused();

      // Generate trước không chạy là kết quả bình thường, không phải lỗi (api.md 6.2).
      if (prefetch && (!flags.prefetchEnabled || !available)) {
        return { httpStatus: 200, body: { state: 'skipped', reason: 'disabled' } };
      }

      // Tắt tính năng hoặc đang tạm dừng: vẫn trả ảnh đã có, nhưng không tạo job (kiểm sau khi tra cache).
      if (!available) {
        const existing = await getResult(userId, productId);
        if (existing.state === 'none') throw ERRORS.unavailable();
        return { httpStatus: existing.state === 'pending' ? 202 : 200, body: existing };
      }

      const outcome = await repo.createJob({ userId, productId, purpose });
      switch (outcome.status) {
        case 'ready':
          return {
            httpStatus: 200,
            body: await getResult(userId, productId),
          };
        case 'attached':
        case 'created':
          if (outcome.status === 'created') {
            if (outcome.budgetWarning) log(logger, 'warn', 'TRYON_BUDGET_WARNING');
            wakeWorker();
          }
          return {
            httpStatus: 202,
            body: { state: 'pending', job: { id: outcome.jobId, status: outcome.jobStatus } },
          };
        case 'blocked':
          return { httpStatus: 200, body: { state: 'blocked', errorCode: outcome.errorCode } };
        default: {
          const reason = SKIP_REASONS[outcome.status];
          if (reason) return { httpStatus: 200, body: { state: 'skipped', reason } };
          throw await failureOf(userId, outcome);
        }
      }
    },

    /** Chủ job mới đọc được; job của người khác là 404, không tiết lộ tồn tại. */
    async getJob(userId, jobId) {
      const job = await repo.getJob({ jobId, userId });
      if (!job) throw ERRORS.jobNotFound();

      const live = job.status === 'queued' || job.status === 'running';
      let status = job.status;
      let image = null;
      let error = null;

      if (live && !job.current) {
        // Đã hết hiệu lực: báo ngay để tab đang chờ dừng lại (US-06 AC-16).
        status = 'discarded';
      } else if (job.status === 'succeeded') {
        // Ảnh đã bị xóa sau đó, hoặc consent lỗi thời (D-108): không trả ảnh.
        if (job.storagePath && job.current) {
          image = await toImage(job.storagePath, job.width, job.height);
        } else {
          status = 'discarded';
        }
      } else if (job.status === 'failed') {
        const code = job.errorCode in JOB_ERROR_MESSAGES ? job.errorCode : 'TRYON_FAILED';
        error = { code, message: JOB_ERROR_MESSAGES[code] };
      }

      return {
        job: {
          id: job.id,
          productId: job.productId,
          purpose: job.purpose,
          status,
          createdAt: iso(job.createdAt),
          image,
          error,
        },
      };
    },
  };
}
