import { z } from 'zod';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CART_MESSAGES = Object.freeze({
  productId: 'Mã sản phẩm không hợp lệ.',
  quantity: 'Số lượng không hợp lệ.',
});

/** Chỉ nhận `productId`. Giá, số lượng và mọi trường thừa từ client bị bỏ (US-07 mục 6). */
export const addCartItemBodySchema = z.object({
  productId: z
    .string({ error: CART_MESSAGES.productId })
    .regex(UUID, { error: CART_MESSAGES.productId }),
});

/**
 * Số lượng tuyệt đối, số nguyên >= 1 (US-08 mục 6): `0`, số lẻ, chuỗi, `null` đều 400. Không đặt trần ở đây:
 * vượt `CART_MAX_QUANTITY` là 409 do DB quyết (trần là cấu hình, không phải quy tắc của kiểu dữ liệu).
 */
export const setCartItemQuantityBodySchema = z.object({
  quantity: z
    .number({ error: CART_MESSAGES.quantity })
    .int({ error: CART_MESSAGES.quantity })
    .min(1, { error: CART_MESSAGES.quantity }),
});
