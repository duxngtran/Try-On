import { AppError } from '../utils/AppError.js';

/**
 * Hàng DB -> `CartItem` của API (api.md 7.2). Không trả `image_path`, `added_price_vnd`.
 * Dòng ngừng bán: không giá, không tổng, không "giá đã đổi" (D-143).
 */
export const createToCartItem = (imageStorage) => (row) => ({
  productId: row.productId,
  name: row.name,
  category: { id: row.categoryId, name: row.categoryName },
  image: { url: imageStorage.publicUrl(row.imagePath), version: row.imageVersion },
  quantity: row.quantity,
  priceVnd: row.available ? row.priceVnd : null,
  lineTotalVnd: row.available ? row.lineTotalVnd : 0,
  priceChangedFrom: row.available && row.addedPriceVnd !== row.priceVnd ? row.addedPriceVnd : null,
  available: row.available,
});

/**
 * Nghiệp vụ giỏ hàng (US-07). Không đọc điều kiện hồ sơ, consent, lượt, ngân sách và không có dependency nào
 * của phòng thử đồ: giỏ không phụ thuộc GenAI (D-146, R1, R6).
 * @param {{
 *   cartRepository: ReturnType<import('../repositories/cartRepository.js').createCartRepository>,
 *   imageStorage: { publicUrl(path: string): string },
 * }} deps
 */
export function createCartService({ cartRepository, imageStorage }) {
  const toCartItem = createToCartItem(imageStorage);
  const limits = Object.freeze({
    maxQuantity: cartRepository.limits.maxQuantity,
    maxLines: cartRepository.limits.maxLines,
  });

  const readCart = async (userId) => {
    const cart = await cartRepository.getCart(userId);
    return {
      items: cart.items.map(toCartItem),
      itemCount: cart.itemCount,
      lineCount: cart.lineCount,
      totalVnd: cart.totalVnd,
      hasUnavailable: cart.hasUnavailable,
      fingerprint: cart.fingerprint,
      limits: { ...limits },
    };
  };

  return {
    getCart: readCart,

    /** Thêm hoặc tăng 1; trả giỏ mới. `productId` đã qua kiểm UUID ở route. */
    async addItem(userId, productId) {
      const { status } = await cartRepository.addItem(userId, productId);
      switch (status) {
        case 'ok':
          return readCart(userId);
        case 'not_found':
          throw new AppError(404, 'NOT_FOUND', 'Sản phẩm này không còn bán.');
        case 'quantity_limit':
          throw new AppError(
            409,
            'CART_QUANTITY_LIMIT',
            'Số lượng của sản phẩm này đã đạt mức tối đa.',
            { maxQuantity: limits.maxQuantity },
          );
        case 'cart_full':
          throw new AppError(409, 'CART_FULL', 'Giỏ hàng đã đầy.', { maxLines: limits.maxLines });
        case 'user_not_found':
          // Tài khoản bị xóa giữa lúc xác thực và lúc ghi: coi như hết phiên.
          throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.');
        default:
          throw new Error(`add_cart_item trả trạng thái lạ: ${status}`);
      }
    },
  };
}
