/**
 * Bộ đếm khóa đăng nhập theo email, lưu trong bộ nhớ (D-06, D-30; luồng: design/flows/login.md).
 * - Lần sai đầu mở cửa sổ `lockMs`; hết cửa sổ mà chưa đủ `maxFails` thì đếm lại.
 * - Lần sai thứ `maxFails` đặt `lockedUntil`; các lần thử sau bị từ chối cho tới khi hết khóa.
 * - Khóa theo email đã chuẩn hóa, kể cả email không tồn tại.
 * @param {{ maxFails: number, lockMs: number, now?: () => number }} options
 */
export function createLoginLock({ maxFails, lockMs, now = Date.now }) {
  /** @type {Map<string, { count: number, windowEndsAt: number, lockedUntil: number | null }>} */
  const entries = new Map();

  const isExpired = (entry, t) => (entry.lockedUntil ?? entry.windowEndsAt) <= t;

  return {
    /** @returns {{ locked: false } | { locked: true, retryAfterSeconds: number }} */
    check(email) {
      const entry = entries.get(email);
      if (!entry) return { locked: false };
      const t = now();
      if (isExpired(entry, t)) {
        entries.delete(email);
        return { locked: false };
      }
      if (entry.lockedUntil === null) return { locked: false };
      return { locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - t) / 1000) };
    },

    registerFail(email) {
      const t = now();
      let entry = entries.get(email);
      if (!entry || isExpired(entry, t)) {
        entry = { count: 0, windowEndsAt: t + lockMs, lockedUntil: null };
        entries.set(email, entry);
      }
      entry.count += 1;
      if (entry.count >= maxFails && entry.lockedUntil === null) entry.lockedUntil = t + lockMs;
    },

    clear(email) {
      entries.delete(email);
    },

    /** Dọn entry hết hạn. */
    sweep() {
      const t = now();
      for (const [email, entry] of entries) if (isExpired(entry, t)) entries.delete(email);
    },

    /** Chạy sweep định kỳ; `unref` để không giữ process sống. */
    startSweeper(intervalMs = 5 * 60 * 1000) {
      const timer = setInterval(() => this.sweep(), intervalMs);
      timer.unref();
      return timer;
    },

    get size() {
      return entries.size;
    },
  };
}
