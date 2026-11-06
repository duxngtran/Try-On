/**
 * Công tắc tạm dừng khi nhà cung cấp báo lỗi cấu hình (hết credit, sai key). Worker bật, service đọc.
 * Trạng thái nằm trong bộ nhớ: khởi động lại thì thử lại ngay, chấp nhận ở một instance (D-99).
 * @param {{ pauseSeconds: number, now?: () => number }} options
 */
export function createProviderGate({ pauseSeconds, now = Date.now }) {
  let pausedUntil = 0;
  return {
    pause() {
      pausedUntil = now() + pauseSeconds * 1000;
    },
    isPaused: () => now() < pausedUntil,
    resume() {
      pausedUntil = 0;
    },
  };
}
