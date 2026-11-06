import { randomUUID } from 'node:crypto';

const pgTimestamp = (ms = Date.now()) => new Date(ms).toISOString().replace('Z', '123+00:00');

/**
 * Repository đơn hàng trong bộ nhớ, cùng hợp đồng với orderRepository thật và mô phỏng ngữ nghĩa của
 * `place_order` (008_create_orders.sql): khóa theo user dùng chung với giỏ, tra khóa trùng trước, rồi giỏ rỗng,
 * dòng ngừng bán, fingerprint; ghi đơn, chụp tên và giá, làm rỗng giỏ.
 * Chỉ để test logic Node: các bảo đảm tương tranh thật nằm ở DB và được kiểm bằng `npm run verify:orders`.
 * `beforeRead` chạy sau khi có khóa, ngay trước khi đọc giỏ: mô phỏng admin đổi giá, xóa sản phẩm đã commit trong lúc chờ.
 */
export function createFakeOrderRepository({ userRepository, productRepository, cartRepository }) {
  const orders = [];
  let orderNo = 0;

  const product = (id) => productRepository.rows.find((p) => p.id === id);
  const summary = (o) => ({
    id: o.id,
    orderNo: o.orderNo,
    createdAt: o.createdAt,
    itemCount: o.itemCount,
    totalVnd: o.totalVnd,
  });

  const repo = {
    orders,
    /** Tên phương thức đã gọi, để test kiểm "không gọi khi chưa qua cổng". */
    calls: [],
    failNext: false,
    beforeRead: null,

    placeOrder(userId, { idempotencyKey, fingerprint, name, phone, address }) {
      repo.calls.push('placeOrder');
      return cartRepository.withUserLock(userId, async () => {
        if (repo.failNext) {
          repo.failNext = false;
          throw new Error('db down');
        }
        if (!userRepository.rows.has(userId)) return { status: 'user_not_found', orderId: null };
        const existing = orders.find((o) => o.userId === userId && o.key === idempotencyKey);
        if (existing) return { status: 'replayed', orderId: existing.id };

        await repo.beforeRead?.();
        const cart = await cartRepository.getCart(userId);
        if (cart.lineCount === 0) return { status: 'cart_empty', orderId: null };
        if (cart.hasUnavailable) return { status: 'cart_has_unavailable', orderId: null };
        if (fingerprint !== cart.fingerprint) return { status: 'cart_changed', orderId: null };

        const order = {
          id: randomUUID(),
          orderNo: (orderNo += 1),
          userId,
          key: idempotencyKey,
          createdAt: pgTimestamp(),
          totalVnd: cart.totalVnd,
          itemCount: cart.itemCount,
          recipient: { name, phone, address },
          items: cart.items.map((item, index) => ({
            lineNo: index + 1,
            productId: item.productId,
            name: item.name,
            unitPriceVnd: item.priceVnd,
            quantity: item.quantity,
            lineTotalVnd: item.lineTotalVnd,
          })),
        };
        orders.push(order);
        cartRepository.lines.splice(
          0,
          cartRepository.lines.length,
          ...cartRepository.lines.filter((l) => l.userId !== userId),
        );
        return { status: 'ok', orderId: order.id };
      });
    },

    async listByUser(userId, { page, limit }) {
      repo.calls.push('listByUser');
      const mine = orders.filter((o) => o.userId === userId).sort((a, b) => b.orderNo - a.orderNo);
      const from = (page - 1) * limit;
      return { rows: mine.slice(from, from + limit).map(summary), total: mine.length };
    },

    async findByUser(userId, orderId) {
      repo.calls.push('findByUser');
      const order = orders.find((o) => o.id === orderId && o.userId === userId);
      if (!order) return null;
      return {
        ...summary(order),
        recipient: { ...order.recipient },
        items: order.items.map((item) => {
          const p = product(item.productId);
          return {
            ...item,
            imagePath: p?.image_path ?? null,
            imageVersion: p?.image_version ?? null,
            stillOnSale: Boolean(p) && !p.deleted_at,
          };
        }),
      };
    },
  };
  return repo;
}
