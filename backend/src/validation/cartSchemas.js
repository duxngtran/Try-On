import { z } from 'zod';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CART_MESSAGES = Object.freeze({
  productId: 'Mã sản phẩm không hợp lệ.',
});

/** Chỉ nhận `productId`. Giá, số lượng và mọi trường thừa từ client bị bỏ (US-07 mục 6). */
export const addCartItemBodySchema = z.object({
  productId: z
    .string({ error: CART_MESSAGES.productId })
    .regex(UUID, { error: CART_MESSAGES.productId }),
});
