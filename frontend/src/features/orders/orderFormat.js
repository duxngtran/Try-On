const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const format = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hourCycle: 'h23',
});

/** "2026-11-06T02:00:00.000Z" -> "09:00, 06/11/2026", luôn theo giờ Việt Nam, không phụ thuộc máy. */
export function formatOrderTime(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  const p = Object.fromEntries(format.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}, ${p.day}/${p.month}/${p.year}`;
}

/**
 * UUID v4 từ `crypto.getRandomValues`. KHÔNG dùng `crypto.randomUUID`: nó chỉ có ở ngữ cảnh an toàn (HTTPS,
 * localhost), nên thiếu khi thử bằng điện thoại qua LAN bằng HTTP thường (flows/order-place.md mục 4).
 */
export function makeIdempotencyKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
