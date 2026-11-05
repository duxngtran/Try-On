import { z } from 'zod';

// Bộ quy tắc này sẽ được chép sang frontend (D-21). Sửa một nơi thì sửa nơi kia và bảng case ở cả hai test.

export const HEIGHT_MIN = 100;
export const HEIGHT_MAX = 250;
export const WEIGHT_MIN = 30;
export const WEIGHT_MAX = 250;

const MSG = {
  height: 'Chiều cao phải từ 100 đến 250 cm.',
  weight: 'Cân nặng phải từ 30 đến 250 kg.',
  consent: 'Vui lòng đồng ý điều khoản sử dụng ảnh.',
};

// numeric(4,1) của Postgres tự làm tròn 52.55 -> 52.6 nên phải từ chối trước khi ghi (AC-08).
const hasAtMostOneDecimal = (value) => Math.round(value * 10) / 10 === value;

/** Chỉ nhận JSON number (không nhận chuỗi); mọi lỗi (thiếu, sai kiểu, ngoài khoảng) dùng cùng một thông báo của contract. */
export const measurementsSchema = z.object({
  heightCm: z
    .number({ error: MSG.height })
    .int(MSG.height)
    .min(HEIGHT_MIN, MSG.height)
    .max(HEIGHT_MAX, MSG.height),
  weightKg: z
    .number({ error: MSG.weight })
    .min(WEIGHT_MIN, MSG.weight)
    .max(WEIGHT_MAX, MSG.weight)
    .refine(hasAtMostOneDecimal, MSG.weight),
});

/** `accepted` phải đúng literal `true` (D-22). */
export const consentSchema = z.object({ accepted: z.literal(true, { error: MSG.consent }) });
