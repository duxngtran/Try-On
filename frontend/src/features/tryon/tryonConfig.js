/**
 * Bên nhận ảnh người dùng (D-126). Đổi nhà cung cấp thì sửa ở đây VÀ tăng `TRYON_CONSENT_VERSION`
 * ở backend: câu consent, hộp thoại rút consent và mô tả ở Hồ sơ đều lấy tên từ hằng này.
 */
export const TRYON_PROVIDER = Object.freeze({ name: 'FASHN', domain: 'fashn.ai' });

/** Mốc thời gian của phòng thử đồ (D-74, D-86, screens/try-on-states.md mục 3). */
export const SETTLE_MS = 400;
export const WAIT_LONG_MS = 15_000;
export const WAIT_TIMEOUT_MS = 60_000;
export const POLL_MS = 2_000;
export const POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 10_000];
export const DEFAULT_RETRY_SECONDS = 10; // D-34
export const LOW_QUOTA_THRESHOLD = 5; // D-120
export const URL_REFRESH_BEFORE_MS = 60_000;
export const MAX_TIMER_MS = 2 ** 31 - 1; // setTimeout lớn hơn mức này chạy ngay lập tức

/** Điều hướng và generate trước (US-06, D-85, D-86). */
export const SWIPE_MIN_PX = 50;
export const NEIGHBOR_PRELOAD_MS = 400; // dừng ở sản phẩm bấy nhiêu rồi mới tải trước ảnh liền kề (R10)
export const PREFETCH_DWELL_MS = 1_000; // D-85
export const PREFETCH_MIN_REMAINING = 3; // D-85: còn <= 3 lượt thì không generate trước
export const PREFETCH_POLL_MS = 2_000;
export const PREFETCH_MAX_WATCH_MS = 130_000;
export const BOUNCE_MS = 160;
export const ANNOUNCE_DWELL_MS = 400;
