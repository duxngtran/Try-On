import { getSupabase } from '../config/supabase.js';

const MAX_SQL_INTEGER = 2_147_483_647;
const rows = (data) => (Array.isArray(data) ? data : data == null ? [] : [data]);
const firstRow = (data) => rows(data)[0] ?? null;

/**
 * Lỗi của rpc chỉ giữ mã. Lỗi ràng buộc của Postgres có thể kèm dữ liệu ("Failing row contains (...)")
 * và `errorHandler` log nguyên đối tượng lỗi ở môi trường dev, nên không để đối tượng gốc đi tiếp.
 */
export class CartRepositoryError extends Error {
  constructor(operation, code) {
    super(`cart ${operation} thất bại${code ? ` (${code})` : ''}`);
    this.name = 'CartRepositoryError';
    this.code = code;
  }
}

/**
 * Bọc các hàm SQL của giỏ hàng (design/db/007_create_cart.sql). Service không biết tới `rpc`.
 * Giới hạn số lượng, số dòng từ env được truyền ở **một chỗ duy nhất** này.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ maxQuantity: number, maxLines: number }} limits
 */
export function createCartRepository(client = getSupabase(), limits) {
  if (!limits) throw new Error('createCartRepository cần limits');

  async function rpc(operation, name, args) {
    let result;
    try {
      result = await client.rpc(name, args);
    } catch (err) {
      throw new CartRepositoryError(operation, err?.code);
    }
    if (result.error) throw new CartRepositoryError(operation, result.error.code);
    return result.data;
  }

  return {
    limits,

    /**
     * Ảnh chụp giỏ. `totalVnd` là bigint ở DB nên PostgREST có thể trả số hoặc chuỗi: luôn đổi sang number.
     * @returns {Promise<{
     *   fingerprint: string | null, totalVnd: number, itemCount: number, lineCount: number,
     *   hasUnavailable: boolean, items: Array<object>
     * }>}
     */
    async getCart(userId) {
      const row = firstRow(await rpc('get', 'get_cart', { p_user_id: userId }));
      if (!row) throw new CartRepositoryError('get', 'EMPTY');
      return {
        fingerprint: row.out_fingerprint ?? null,
        totalVnd: Number(row.out_total_vnd),
        itemCount: Number(row.out_item_count),
        lineCount: Number(row.out_line_count),
        hasUnavailable: Boolean(row.out_has_unavailable),
        items: (row.out_items ?? []).map((item) => ({
          productId: item.product_id,
          quantity: item.quantity,
          addedPriceVnd: item.added_price_vnd,
          priceVnd: item.price_vnd,
          name: item.name,
          imagePath: item.image_path,
          imageVersion: item.image_version,
          available: item.available,
          categoryId: item.category_id,
          categoryName: item.category_name,
          lineTotalVnd: Number(item.line_total_vnd),
        })),
      };
    },

    /** @returns {Promise<{ status: 'ok' | 'user_not_found' | 'not_found' | 'quantity_limit' | 'cart_full', quantity: number }>} */
    async addItem(userId, productId) {
      const row = firstRow(
        await rpc('add', 'add_cart_item', {
          p_user_id: userId,
          p_product_id: productId,
          p_max_quantity: limits.maxQuantity,
          p_max_lines: limits.maxLines,
        }),
      );
      if (!row) throw new CartRepositoryError('add', 'EMPTY');
      return { status: row.out_status, quantity: row.out_quantity };
    },

    /** @returns {Promise<'ok' | 'user_not_found' | 'not_in_cart' | 'unavailable' | 'quantity_limit'>} */
    async setQuantity(userId, productId, quantity) {
      const row = firstRow(
        await rpc('set', 'set_cart_item_quantity', {
          p_user_id: userId,
          p_product_id: productId,
          // Số vượt kiểu integer của hàm SQL sẽ thành lỗi 22003 (500); kẹp lại để vẫn ra quantity_limit (409).
          p_quantity: Math.min(quantity, MAX_SQL_INTEGER),
          p_max_quantity: limits.maxQuantity,
        }),
      );
      if (!row) throw new CartRepositoryError('set', 'EMPTY');
      return row.out_status;
    },

    /** @returns {Promise<'ok' | 'user_not_found'>} */
    async removeItem(userId, productId) {
      const row = firstRow(
        await rpc('remove', 'remove_cart_item', { p_user_id: userId, p_product_id: productId }),
      );
      if (!row) throw new CartRepositoryError('remove', 'EMPTY');
      return row.out_status;
    },
  };
}
