import { describe, it, expect } from 'vitest';
import { createProductRepository } from '../src/repositories/productRepository.js';

/**
 * Client Supabase giả: mọi lời gọi query-builder trả về chính nó, `await` trả kết quả của "bước" tương ứng.
 * Dựng lại điều thật đã gặp trên Supabase dev: offset vượt tổng số dòng làm PostgREST trả 416 (PGRST103).
 */
function fakeClient(results) {
  const calls = [];
  const builder = (kind) => {
    const state = { kind, ops: [] };
    const proxy = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            return (resolve) => resolve(results[state.kind](state.ops));
          }
          return (...args) => {
            state.ops.push([prop, ...args]);
            if (prop === 'select' && args[1]?.head) state.kind = 'count';
            return proxy;
          };
        },
      },
    );
    calls.push(state);
    return proxy;
  };
  return { client: { from: () => builder('list') }, calls };
}

describe('productRepository.list', () => {
  it('trang vượt quá tổng số dòng (PostgREST 416) -> rows rỗng và total thật, không ném lỗi', async () => {
    const { client, calls } = fakeClient({
      list: () => ({
        data: null,
        error: { code: 'PGRST103', message: 'Requested range not satisfiable' },
      }),
      count: () => ({ count: 7, error: null }),
    });
    const repo = createProductRepository(client);
    const result = await repo.list({ page: 999, limit: 20, categoryId: 'c1' });
    expect(result).toEqual({ rows: [], total: 7 });
    // Truy vấn đếm giữ đúng bộ lọc.
    const countOps = calls.find((c) => c.kind === 'count').ops;
    expect(countOps).toContainEqual(['eq', 'category_id', 'c1']);
    expect(countOps).toContainEqual(['is', 'deleted_at', null]);
  });

  it('lỗi khác 416 vẫn ném ra để thành 500, không bị nuốt', async () => {
    const { client } = fakeClient({
      list: () => ({ data: null, error: { code: '42501', message: 'permission denied' } }),
      count: () => ({ count: 0, error: null }),
    });
    await expect(
      createProductRepository(client).list({ page: 1, limit: 20 }),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });
});
