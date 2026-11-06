import { DEFAULT_RETRY_SECONDS } from './tryonConfig.js';
import { formatResetMoment } from './tryonFormat.js';

/**
 * Bảng mã lỗi -> trạng thái giao diện (screens/try-on-states.md mục 2 và 4). Câu chữ lấy theo mã lỗi hoặc
 * trạng thái, KHÔNG BAO GIỜ hiển thị `error.message` của server (D-119).
 */

export const WAITING_TEXT = {
  resolving: 'Đang tải ảnh…',
  waiting: 'Đang tạo ảnh bạn mặc sản phẩm này…',
  waitingLong: 'Vẫn đang tạo, có thể lâu hơn một chút. Bạn có thể xem sản phẩm khác trong lúc chờ.',
};

const QUOTA_EXHAUSTED_TAIL = 'Các ảnh đã tạo vẫn xem được.';

const quotaText = (period, resetsAt) => {
  const moment = formatResetMoment(resetsAt);
  return moment
    ? `Bạn đã dùng hết lượt tạo ảnh ${period}. Lượt mới có sau ${moment}. ${QUOTA_EXHAUSTED_TAIL}`
    : `Bạn đã dùng hết lượt tạo ảnh ${period}. ${QUOTA_EXHAUSTED_TAIL}`;
};

/**
 * Mô tả lớp phủ trạng thái (StageOverlay). `action`: `retry` (POST lại), `recheck` (làm mới /state),
 * `reload` (chỉ GET /result), `profile` (tới Hồ sơ), `otherCategory` (về chip danh mục).
 * @returns {{
 *   id: string, variant: 'danger'|'warning'|'info', role: 'alert'|'status', icon: string,
 *   title?: string, body: string, detail?: string,
 *   action?: { kind: string, label: string, lockSeconds?: number },
 * }}
 */
export function describeOverlay(id, data = {}) {
  switch (id) {
    case 'timeout':
      return {
        id,
        variant: 'warning',
        role: 'alert',
        icon: 'clock',
        title: 'Việc tạo ảnh lâu hơn dự kiến',
        body: 'Bạn có thể thử lại hoặc xem sản phẩm khác rồi quay lại. Nếu ảnh hoàn thành, nó sẽ tự hiện.',
        action: { kind: 'retry', label: 'Thử lại' },
      };
    case 'failed':
      return {
        id,
        variant: 'danger',
        role: 'alert',
        icon: 'alert',
        body: 'Chưa tạo được ảnh, vui lòng thử lại.',
        action: { kind: 'retry', label: 'Thử lại' },
      };
    case 'blocked':
      return {
        id,
        variant: 'info',
        role: 'status',
        icon: 'ban',
        body: 'Không thể tạo ảnh thử đồ với sản phẩm này.',
        detail: 'Bạn vẫn xem được thông tin sản phẩm và các sản phẩm khác.',
      };
    case 'photo':
      return {
        id,
        variant: 'warning',
        role: 'alert',
        icon: 'user-x',
        body: 'Ảnh của bạn chưa phù hợp để thử đồ. Hãy dùng ảnh đứng thẳng, thấy toàn thân.',
        action: { kind: 'profile', label: 'Đổi ảnh hồ sơ' },
      };
    case 'paused':
      return {
        id,
        variant: 'warning',
        role: 'status',
        icon: 'clock',
        body: 'Tính năng tạo ảnh đang tạm dừng. Bạn vẫn xem được các ảnh đã tạo. Vui lòng thử lại sau.',
        action: { kind: 'recheck', label: 'Kiểm tra lại' },
      };
    case 'quotaDay':
      return {
        id,
        variant: 'warning',
        role: 'status',
        icon: 'clock',
        body: quotaText('hôm nay', data.resetsAt),
      };
    case 'quotaMonth':
      return {
        id,
        variant: 'warning',
        role: 'status',
        icon: 'clock',
        body: quotaText('tháng này', data.resetsAt),
      };
    case 'quotaPending':
      return {
        id,
        variant: 'info',
        role: 'status',
        icon: 'info',
        body: 'Lượt tạo ảnh cuối của bạn đang dùng cho một ảnh khác. Bạn có thể thử lại sau ít giây.',
        action: { kind: 'retry', label: 'Thử lại', lockSeconds: data.retryAfterSeconds ?? 15 },
      };
    case 'throttled':
      return {
        id,
        variant: 'warning',
        role: 'status',
        icon: 'clock',
        body: 'Bạn thao tác quá nhanh, vui lòng thử lại sau.',
        action: {
          kind: 'retry',
          label: 'Thử lại',
          lockSeconds: data.retryAfterSeconds ?? DEFAULT_RETRY_SECONDS,
        },
      };
    case 'imageError':
      return {
        id,
        variant: 'danger',
        role: 'alert',
        icon: 'alert',
        body: 'Không tải được ảnh thử đồ.',
        action: { kind: 'reload', label: 'Tải lại ảnh' },
      };
    case 'deleted':
      return {
        id,
        variant: 'warning',
        role: 'alert',
        icon: 'package-x',
        body: 'Sản phẩm này không còn bán.',
        // D-87: không tự chuyển; còn sản phẩm sau nó thì cho nút chuyển tiếp (S14).
        action: data.hasNext
          ? { kind: 'nextProduct', label: 'Xem sản phẩm tiếp theo' }
          : { kind: 'otherCategory', label: 'Danh mục khác' },
      };
    default:
      throw new Error(`Trạng thái lạ: ${id}`);
  }
}

/** Mã trong `job.error.code` (bảng 4.3) -> id lớp phủ. Mã lạ coi như lỗi tạm thời (D-130). */
export function overlayForJobError(code) {
  switch (code) {
    case 'TRYON_TIMEOUT':
      return 'timeout';
    case 'TRYON_BLOCKED':
      return 'blocked';
    case 'TRYON_PHOTO_UNUSABLE':
      return 'photo';
    case 'TRYON_UNAVAILABLE':
      return 'paused';
    default:
      return 'failed';
  }
}

/** `state: 'blocked'` của /result và POST /jobs (D-121). */
export const overlayForBlocked = (errorCode) =>
  errorCode === 'TRYON_PHOTO_UNUSABLE' ? 'photo' : 'blocked';

const seconds = (error) => {
  const value = Number(error?.details?.retryAfterSeconds);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Phân loại lỗi API theo nơi gọi (bảng 4.1).
 * `context`: `result` (GET /result), `create` (POST /jobs), `poll` (GET /jobs/:id).
 * @returns {{ type: 'gate', gate: 'consent' | 'profile', missing?: string[] }
 *   | { type: 'overlay', id: string, data?: object }
 *   | { type: 'job-gone' } | { type: 'poll-slow', retryAfterSeconds: number | null }
 *   | { type: 'transient' } | { type: 'offline' } | { type: 'canceled' }}
 */
export function classifyError(error, context) {
  const { status, code, details } = error ?? {};
  if (code === 'CANCELED') return { type: 'canceled' };
  if (status === 403 && code === 'TRYON_CONSENT_REQUIRED') return { type: 'gate', gate: 'consent' };
  if (status === 409 && code === 'PROFILE_INCOMPLETE') {
    return { type: 'gate', gate: 'profile', missing: details?.missing ?? [] };
  }
  const network = code === 'NETWORK_ERROR';

  if (context === 'poll') {
    if (status === 404) return { type: 'job-gone' };
    if (status === 429 && code === 'TOO_MANY_REQUESTS') {
      return { type: 'poll-slow', retryAfterSeconds: seconds(error) };
    }
    return { type: 'transient' };
  }

  if (network) return { type: 'offline' };
  if (status === 404) return { type: 'overlay', id: 'deleted' };

  if (context === 'result') return { type: 'overlay', id: 'imageError' };

  if (status === 429 && code === 'TRYON_QUOTA_EXCEEDED') {
    const scope = details?.scope;
    if (scope === 'month') return { type: 'overlay', id: 'quotaMonth', data: details };
    if (scope === 'pending') {
      return {
        type: 'overlay',
        id: 'quotaPending',
        data: { retryAfterSeconds: seconds(error) ?? 15 },
      };
    }
    return { type: 'overlay', id: 'quotaDay', data: details };
  }
  if (status === 429 && code === 'TOO_MANY_REQUESTS') {
    return { type: 'overlay', id: 'throttled', data: { retryAfterSeconds: seconds(error) } };
  }
  if (status === 503 && code === 'TRYON_UNAVAILABLE') return { type: 'overlay', id: 'paused' };
  return { type: 'overlay', id: 'failed' };
}
