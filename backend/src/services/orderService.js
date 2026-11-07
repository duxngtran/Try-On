import { AppError } from '../utils/AppError.js';

/** `DH` + `order_no` đệm đủ 6 chữ số; vượt 6 chữ số thì giữ nguyên (D-150). */
export const orderCode = (orderNo) => `DH${String(orderNo).padStart(6, '0')}`;

// Postgres trả `...893014+00:00`, contract cần `...893Z` (đã gặp ở US-01).
const iso = (value) => new Date(value).toISOString();

const toSummary = (row) => ({
  id: row.id,
  code: orderCode(row.orderNo),
  createdAt: iso(row.createdAt),
  itemCount: row.itemCount,
  totalVnd: row.totalVnd,
});

/**
 * Nghiệp vụ đơn hàng của người mua (US-08). Không có dependency nào của phòng thử đồ: đặt hàng không phụ thuộc
 * hồ sơ, consent, lượt, ngân sách (D-146). Không ghi log nội dung đơn: họ tên, số điện thoại, địa chỉ là dữ liệu
 * cá nhân (R9); chỉ có `userId`, `orderId`, mã lỗi.
 * @param {{
 *   orderRepository: ReturnType<import('../repositories/orderRepository.js').createOrderRepository>,
 *   imageStorage: { publicUrl(path: string): string },
 * }} deps
 */
export function createOrderService({ orderRepository, imageStorage }) {
  const toOrderItem = (item) => ({
    productId: item.productId,
    name: item.name,
    unitPriceVnd: item.unitPriceVnd,
    quantity: item.quantity,
    lineTotalVnd: item.lineTotalVnd,
    image: item.imagePath
      ? { url: imageStorage.publicUrl(item.imagePath), version: item.imageVersion }
      : null,
    stillOnSale: item.stillOnSale,
  });
  const toOrder = (row) => ({
    ...toSummary(row),
    recipient: { ...row.recipient },
    items: row.items.map(toOrderItem),
  });

  const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng.');

  async function getOrder(userId, orderId) {
    const row = await orderRepository.findByUser(userId, orderId);
    if (!row) throw notFound();
    return toOrder(row);
  }

  return {
    getOrder,

    async list(userId, { page, limit }) {
      const { rows, total } = await orderRepository.listByUser(userId, { page, limit });
      return {
        items: rows.map(toSummary),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },

    /**
     * Đặt hàng. Tiền, tên, dòng hàng do DB lấy từ `products` trong transaction, client không gửi.
     * @param {string} userId
     * @param {{ idempotencyKey: string, cartFingerprint: string, recipient: { name: string, phone: string, address: string } }} input đã validate và chuẩn hóa
     * @returns {Promise<{ order: object, created: boolean }>} `created = false` khi trả lại đơn cũ cùng khóa (200).
     */
    async place(userId, { idempotencyKey, cartFingerprint, recipient }) {
      const { status, orderId } = await orderRepository.placeOrder(userId, {
        idempotencyKey,
        fingerprint: cartFingerprint,
        name: recipient.name,
        phone: recipient.phone,
        address: recipient.address,
      });
      switch (status) {
        case 'ok':
        case 'replayed':
          return { order: await getOrder(userId, orderId), created: status === 'ok' };
        case 'cart_empty':
          throw new AppError(409, 'CART_EMPTY', 'Giỏ hàng đang trống.');
        case 'cart_has_unavailable':
          throw new AppError(
            409,
            'CART_HAS_UNAVAILABLE',
            'Giỏ hàng có sản phẩm không còn bán. Hãy bỏ chúng khỏi giỏ để đặt hàng.',
          );
        case 'cart_changed':
          throw new AppError(
            409,
            'CART_CHANGED',
            'Giỏ hàng vừa thay đổi. Vui lòng kiểm tra lại rồi xác nhận.',
          );
        case 'user_not_found':
          // Tài khoản bị xóa giữa lúc xác thực và lúc ghi: coi như hết phiên.
          throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.');
        default:
          throw new Error(`place_order trả trạng thái lạ: ${status}`);
      }
    },
  };
}
