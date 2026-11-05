import { getSupabase } from '../config/supabase.js';

const COLUMNS =
  'id, name, price_vnd, image_path, image_version, created_at, updated_at, category:categories(id, name)';

const RANGE_NOT_SATISFIABLE = 'PGRST103';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

const firstRow = (data) => (Array.isArray(data) ? data[0] : data);

/**
 * Truy cập `products` qua Supabase (service role). Mọi truy vấn lọc `deleted_at is null` (D-42).
 * Trả hàng snake_case kèm `category: { id, name }`; service map ra API.
 * Ghi tạo/sửa đi qua hàm SQL để nguyên tử (D-50).
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 */
export function createProductRepository(client = getSupabase()) {
  const products = () => client.from('products');

  return {
    /** Mới nhất trước, `id` giảm dần làm tiêu chí phụ (D-44). */
    async list({ page, limit, categoryId }) {
      const from = (page - 1) * limit;
      let query = products()
        .select(COLUMNS, { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + limit - 1);
      if (categoryId) query = query.eq('category_id', categoryId);
      const { data, error, count } = await query;
      // PostgREST trả 416 (PGRST103) khi `offset` vượt quá tổng số dòng; contract yêu cầu `items: []`, không lỗi.
      if (error?.code === RANGE_NOT_SATISFIABLE) {
        return { rows: [], total: await this.countActive(categoryId) };
      }
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },

    async countActive(categoryId) {
      let query = products().select('id', { count: 'exact', head: true }).is('deleted_at', null);
      if (categoryId) query = query.eq('category_id', categoryId);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },

    /** Trả null nếu không có hoặc đã xóa mềm. */
    async findById(id) {
      return unwrap(
        await products().select(COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle(),
      );
    },

    async activeCategoryExists(categoryId) {
      const data = unwrap(
        await client
          .from('categories')
          .select('id')
          .eq('id', categoryId)
          .is('deleted_at', null)
          .maybeSingle(),
      );
      return Boolean(data);
    },

    /** @returns {Promise<'ok' | 'category_not_found'>} */
    async create({ id, name, priceVnd, categoryId, imagePath }) {
      const row = firstRow(
        unwrap(
          await client.rpc('create_product', {
            p_id: id,
            p_name: name,
            p_price_vnd: priceVnd,
            p_category_id: categoryId,
            p_image_path: imagePath,
          }),
        ),
      );
      if (!row) throw new Error('create_product không trả về dòng nào');
      return row.out_status;
    },

    /**
     * Trường undefined = giữ nguyên (SQL coalesce).
     * @returns {Promise<{ status: 'ok' | 'not_found' | 'category_not_found', oldImagePath: string | null }>}
     */
    async update({ id, name, priceVnd, categoryId, newImagePath }) {
      const row = firstRow(
        unwrap(
          await client.rpc('update_product', {
            p_id: id,
            p_name: name ?? null,
            p_price_vnd: priceVnd ?? null,
            p_category_id: categoryId ?? null,
            p_new_image_path: newImagePath ?? null,
          }),
        ),
      );
      if (!row) throw new Error('update_product không trả về dòng nào');
      return { status: row.out_status, oldImagePath: row.out_old_image_path ?? null };
    },

    /** @returns {Promise<boolean>} true nếu vừa xóa; false nếu không còn sản phẩm này. */
    async softDelete(id) {
      const data = unwrap(
        await products()
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .is('deleted_at', null)
          .select('id')
          .maybeSingle(),
      );
      return Boolean(data);
    },
  };
}
