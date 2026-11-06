import { createHash } from 'node:crypto';

/**
 * Repository giỏ hàng trong bộ nhớ, cùng hợp đồng với cartRepository thật và mô phỏng ngữ nghĩa các hàm SQL
 * của 007_create_cart.sql: khóa theo user (thao tác của một user nối tiếp nhau), sản phẩm xóa mềm vẫn nằm trong giỏ,
 * giá lấy từ `products`, `added_price_vnd` chỉ cập nhật khi thêm.
 * Dựng tình huống: `failNext`, `beforeWrite` (chạy ngay trước khi ghi, để mô phỏng admin xóa/đổi giá đúng lúc).
 */
export function createFakeCartRepository({
  userRepository,
  productRepository,
  categoryRepository,
  limits,
}) {
  const lines = []; // { userId, productId, quantity, addedPriceVnd, seq }
  const locks = new Map();
  let seq = 0;

  /** Mô phỏng `FOR NO KEY UPDATE` trên dòng users: thao tác cùng user chạy lần lượt. */
  async function withUserLock(userId, fn) {
    const previous = locks.get(userId) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    locks.set(
      userId,
      run.catch(() => {}),
    );
    return run;
  }

  const product = (id) => productRepository.rows.find((p) => p.id === id);
  const repo = {
    limits,
    lines,
    /** Cho fakeOrderRepository dùng chung khóa: đặt hàng và thao tác giỏ của một user nối tiếp nhau như ở DB. */
    withUserLock,
    /** Tên phương thức đã gọi, để test kiểm "không gọi khi chưa qua cổng". */
    calls: [],
    failNext: false,
    /** Chạy trước khi `addItem` ghi (sau lần khóa user). */
    beforeWrite: null,

    async getCart(userId) {
      repo.calls.push('getCart');
      if (repo.failNext) {
        repo.failNext = false;
        throw new Error('db down');
      }
      const mine = lines.filter((l) => l.userId === userId).sort((a, b) => b.seq - a.seq);
      const items = mine.map((l) => {
        const p = product(l.productId);
        const category = categoryRepository.rows.find((c) => c.id === p.category_id);
        const available = !p.deleted_at;
        return {
          productId: l.productId,
          quantity: l.quantity,
          addedPriceVnd: l.addedPriceVnd,
          priceVnd: p.price_vnd,
          name: p.name,
          imagePath: p.image_path,
          imageVersion: p.image_version,
          available,
          categoryId: category.id,
          categoryName: category.name,
          lineTotalVnd: available ? p.price_vnd * l.quantity : 0,
        };
      });
      return {
        // 32 ký tự hex như md5 của DB, để qua được schema của POST /orders.
        fingerprint: items.length
          ? createHash('md5')
              .update(
                items
                  .map((i) => [i.productId, i.quantity, i.priceVnd, i.name, i.available].join('|'))
                  .sort()
                  .join(';'),
              )
              .digest('hex')
          : null,
        totalVnd: items.reduce((sum, i) => sum + i.lineTotalVnd, 0),
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        lineCount: items.length,
        hasUnavailable: items.some((i) => !i.available),
        items,
      };
    },

    addItem(userId, productId) {
      repo.calls.push('addItem');
      return withUserLock(userId, async () => {
        if (repo.failNext) {
          repo.failNext = false;
          throw new Error('db down');
        }
        if (!userRepository.rows.has(userId)) return { status: 'user_not_found', quantity: 0 };
        await repo.beforeWrite?.();
        const p = product(productId);
        if (!p || p.deleted_at) return { status: 'not_found', quantity: 0 };
        const line = lines.find((l) => l.userId === userId && l.productId === productId);
        if (line) {
          if (line.quantity >= limits.maxQuantity) {
            return { status: 'quantity_limit', quantity: line.quantity };
          }
          line.quantity += 1;
          line.addedPriceVnd = p.price_vnd;
          return { status: 'ok', quantity: line.quantity };
        }
        if (lines.filter((l) => l.userId === userId).length >= limits.maxLines) {
          return { status: 'cart_full', quantity: 0 };
        }
        lines.push({ userId, productId, quantity: 1, addedPriceVnd: p.price_vnd, seq: (seq += 1) });
        return { status: 'ok', quantity: 1 };
      });
    },

    /** Cùng thứ tự kiểm tra với set_cart_item_quantity: user, giới hạn, có trong giỏ, còn bán. */
    setQuantity(userId, productId, quantity) {
      repo.calls.push('setQuantity');
      return withUserLock(userId, async () => {
        if (!userRepository.rows.has(userId)) return 'user_not_found';
        if (quantity < 1 || quantity > limits.maxQuantity) return 'quantity_limit';
        const line = lines.find((l) => l.userId === userId && l.productId === productId);
        if (!line) return 'not_in_cart';
        if (product(productId).deleted_at) return 'unavailable';
        line.quantity = quantity;
        return 'ok';
      });
    },

    removeItem(userId, productId) {
      repo.calls.push('removeItem');
      return withUserLock(userId, async () => {
        if (!userRepository.rows.has(userId)) return 'user_not_found';
        const index = lines.findIndex((l) => l.userId === userId && l.productId === productId);
        if (index >= 0) lines.splice(index, 1);
        return 'ok';
      });
    },
  };
  return repo;
}
