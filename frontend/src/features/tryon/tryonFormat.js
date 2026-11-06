const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const resetFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  hourCycle: 'h23',
});
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const priceFormat = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

const partsOf = (format, iso) =>
  Object.fromEntries(format.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));

/** "2026-11-06T17:00:00.000Z" -> "00:00 ngày 07/11", luôn theo giờ Việt Nam, không phụ thuộc máy. */
export function formatResetMoment(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  const p = partsOf(resetFormat, iso);
  return `${p.hour}:${p.minute} ngày ${p.day}/${p.month}`;
}

/** -> "06/11/2026" theo giờ Việt Nam. */
export function formatDateVn(iso) {
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  const p = partsOf(dateFormat, iso);
  return `${p.day}/${p.month}/${p.year}`;
}

/** 199000 -> "199.000 ₫" */
export const formatPriceVnd = (value) => priceFormat.format(value);

/**
 * Mốc có lượt mới: tháng nếu đã hết lượt tháng, ngược lại ngày (screens/try-on-room.md, Dải thông báo).
 * @returns {{ scope: 'day' | 'month', resetsAt: string | null }}
 */
export function pickQuotaReset(quota) {
  const monthExhausted = quota.monthlyUsed >= quota.monthlyLimit;
  return monthExhausted
    ? { scope: 'month', resetsAt: quota.monthlyResetsAt }
    : { scope: 'day', resetsAt: quota.dailyResetsAt };
}

/** Giới hạn nào thấp hơn thì dùng nhãn đó: "hôm nay" hay "tháng này" (screens/try-on-room.md 2e). */
export function lowQuotaPeriod(quota) {
  return quota.monthlyLimit - quota.monthlyUsed < quota.dailyLimit - quota.dailyUsed
    ? 'tháng này'
    : 'hôm nay';
}
