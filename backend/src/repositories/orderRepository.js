import { getSupabase } from '../config/supabase.js';

const RANGE_NOT_SATISFIABLE = 'PGRST103';

const rows = (data) => (Array.isArray(data) ? data : data == null ? [] : [data]);
const firstRow = (data) => rows(data)[0] ?? null;

/**
 * Lỗi của Supabase chỉ giữ mã. Lỗi ràng buộc của Postgres trên `orders` mang theo "Failing row contains (...)"
 * với họ tên, số điện thoại, địa chỉ, và `errorHandler` log nguyên đối tượng lỗi ở môi trường dev (AC-17),
 * nên không để đối tượng gốc (cũng không `cause`) đi tiếp.
 */
export class OrderRepositoryError extends Error {
  constructor(operation, code) {
    super(`order ${operation} thất bại${code ? ` (${code})` : ''}`);
    this.name = 'OrderRepositoryError';
    this.code = code;
  }
}

// Danh sách: chỉ cột của OrderSummary. Không có họ tên, số điện thoại, địa chỉ (AC-19).
const SUMMARY_COLUMNS = 'id, order_no, created_at, item_count, total_vnd';
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, recipient_name, recipient_phone, shipping_address,
  items:order_items(line_no, product_id, product_name, unit_price_vnd, quantity, line_total_vnd,
    product:products(image_path, image_version, deleted_at))`;

const toSummary = (row) => ({
  id: row.id,
  orderNo: Number(row.order_no),
  createdAt: row.created_at,
  itemCount: Number(row.item_count),
  totalVnd: Number(row.total_vnd),
});

const toDetail = (row) => ({
  ...toSummary(row),
  recipient: {
    name: row.recipient_name,
    phone: row.recipient_phone,
    address: row.shipping_address,
  },
  items: [...(row.items ?? [])]
    .sort((a, b) => a.line_no - b.line_no)
    .map((item) => ({
      productId: item.product_id,
      name: item.product_name,
      unitPriceVnd: Number(item.unit_price_vnd),
      quantity: Number(item.quantity),
      lineTotalVnd: Number(item.line_total_vnd),
      imagePath: item.product?.image_path ?? null,
      imageVersion: item.product?.image_version ?? null,
      stillOnSale: item.product ? item.product.deleted_at == null : false,
    })),
});

/**
 * Truy cập đơn hàng (design/db/008_create_orders.sql). `service_role` chỉ có SELECT, INSERT trên bảng đơn,
 * nên không có hàm sửa hay xóa nào ở đây (D-138). Mọi lệnh đọc lọc theo `user_id` ngay trong truy vấn (AC-15).
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 */
export function createOrderRepository(client = getSupabase()) {
  const orders = () => client.from('orders');

  return {
    /**
     * Gọi `place_order`, một transaction ở DB. Mọi lỗi (kể cả ném từ client) thành `OrderRepositoryError` chỉ có mã.
     * @returns {Promise<{ status: 'ok' | 'replayed' | 'user_not_found' | 'cart_empty' | 'cart_has_unavailable' | 'cart_changed', orderId: string | null }>}
     */
    async placeOrder(userId, { idempotencyKey, fingerprint, name, phone, address }) {
      let result;
      try {
        result = await client.rpc('place_order', {
          p_user_id: userId,
          p_idempotency_key: idempotencyKey,
          p_fingerprint: fingerprint,
          p_recipient_name: name,
          p_recipient_phone: phone,
          p_shipping_address: address,
        });
      } catch (err) {
        throw new OrderRepositoryError('place', err?.code);
      }
      if (result.error) throw new OrderRepositoryError('place', result.error.code);
      const row = firstRow(result.data);
      if (!row) throw new OrderRepositoryError('place', 'EMPTY');
      return { status: row.out_status, orderId: row.out_order_id ?? null };
    },

    /** Mới nhất trước, `id` giảm dần làm tiêu chí phụ (D-44). Trang vượt tổng trả `rows: []` với `total` thật (D-65). */
    async listByUser(userId, { page, limit }) {
      const from = (page - 1) * limit;
      let result;
      try {
        result = await orders()
          .select(SUMMARY_COLUMNS, { count: 'exact' })
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + limit - 1);
      } catch (err) {
        throw new OrderRepositoryError('list', err?.code);
      }
      if (result.error?.code === RANGE_NOT_SATISFIABLE) {
        return { rows: [], total: await this.countByUser(userId) };
      }
      if (result.error) throw new OrderRepositoryError('list', result.error.code);
      return { rows: (result.data ?? []).map(toSummary), total: result.count ?? 0 };
    },

    async countByUser(userId) {
      let result;
      try {
        result = await orders().select('id', { count: 'exact', head: true }).eq('user_id', userId);
      } catch (err) {
        throw new OrderRepositoryError('count', err?.code);
      }
      if (result.error) throw new OrderRepositoryError('count', result.error.code);
      return result.count ?? 0;
    },

    /** Trả null nếu không có HOẶC của người khác: hai trường hợp không phân biệt được (E14). */
    async findByUser(userId, orderId) {
      let result;
      try {
        result = await orders()
          .select(DETAIL_COLUMNS)
          .eq('id', orderId)
          .eq('user_id', userId)
          .maybeSingle();
      } catch (err) {
        throw new OrderRepositoryError('find', err?.code);
      }
      if (result.error) throw new OrderRepositoryError('find', result.error.code);
      return result.data ? toDetail(result.data) : null;
    },
  };
}
