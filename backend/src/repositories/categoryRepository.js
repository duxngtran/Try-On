import { getSupabase } from '../config/supabase.js';

const POSTGRES_UNIQUE_VIOLATION = '23505';
const COLUMNS = 'id, name, created_at, updated_at';

/** Ném khi ghi tên vi phạm unique `lower(name)` trong các danh mục còn hiệu lực (kể cả race). */
export class DuplicateCategoryNameError extends Error {
  constructor() {
    super('Tên danh mục đã tồn tại');
    this.name = 'DuplicateCategoryNameError';
  }
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

function unwrapWrite({ data, error }) {
  if (error?.code === POSTGRES_UNIQUE_VIOLATION) throw new DuplicateCategoryNameError();
  if (error) throw error;
  return data;
}

/**
 * Truy cập `categories` qua Supabase (service role). Mọi truy vấn lọc `deleted_at is null` (D-42).
 * Trả hàng snake_case; service map ra API.
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 */
export function createCategoryRepository(client = getSupabase()) {
  const categories = () => client.from('categories');

  return {
    /** Danh mục còn hiệu lực kèm `product_count`, theo `created_at`, `id` tăng dần. */
    async listWithCounts() {
      return unwrap(await client.rpc('list_categories_with_counts')) ?? [];
    },

    async insert(name) {
      return unwrapWrite(await categories().insert({ name }).select(COLUMNS).single());
    },

    /** Trả hàng đã cập nhật, hoặc null nếu không còn danh mục này. */
    async rename(id, name) {
      return unwrapWrite(
        await categories()
          .update({ name })
          .eq('id', id)
          .is('deleted_at', null)
          .select(COLUMNS)
          .maybeSingle(),
      );
    },

    async countActiveProducts(id) {
      const { count, error } = await client
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id)
        .is('deleted_at', null);
      if (error) throw error;
      return count ?? 0;
    },

    /** @returns {Promise<{ status: 'ok' | 'not_found' | 'has_products', productCount: number }>} */
    async softDelete(id) {
      const data = unwrap(await client.rpc('soft_delete_category', { p_id: id }));
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('soft_delete_category không trả về dòng nào');
      return { status: row.out_status, productCount: row.out_product_count ?? 0 };
    },
  };
}
