export const HEIGHT_MESSAGE = 'Chiều cao phải từ 100 đến 250 cm.';
export const WEIGHT_MESSAGE = 'Cân nặng phải từ 30 đến 250 kg.';

/** Chiều cao: số nguyên 100–250 (D-13). Trả `null` nếu rỗng, chữ, âm, thập phân hay ngoài khoảng. */
export function parseHeight(raw) {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const value = Number(text);
  return value >= 100 && value <= 250 ? value : null;
}

/** Cân nặng: 30–250, tối đa 1 chữ số thập phân, nhận cả `,` và `.`. Trả `null` nếu không hợp lệ. */
export function parseWeight(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(',', '.');
  if (!/^\d{1,3}(\.\d)?$/.test(text)) return null;
  const value = Number(text);
  return value >= 30 && value <= 250 ? value : null;
}

/** Kiểm tra cả hai ô; `values` luôn là số (JSON number) khi không có lỗi. */
export function validateMeasurements({ height, weight }) {
  const heightCm = parseHeight(height);
  const weightKg = parseWeight(weight);
  const errors = {};
  if (heightCm === null) errors.heightCm = HEIGHT_MESSAGE;
  if (weightKg === null) errors.weightKg = WEIGHT_MESSAGE;
  return { values: { heightCm, weightKg }, errors };
}

/** Giá trị từ server -> chuỗi hiển thị trong ô (cân nặng dùng dấu phẩy kiểu Việt). */
export const formatHeight = (value) => (value == null ? '' : String(value));
export const formatWeight = (value) => (value == null ? '' : String(value).replace('.', ','));
