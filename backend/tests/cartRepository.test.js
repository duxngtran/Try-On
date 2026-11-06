import { describe, it, expect } from 'vitest';
import { CartRepositoryError, createCartRepository } from '../src/repositories/cartRepository.js';

const LIMITS = { maxQuantity: 7, maxLines: 4 };
const USER = '3b241101-e2bb-4255-8caf-4136c566a962';
const PRODUCT = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';

const clientReturning = (result) => {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (result instanceof Error) throw result;
      return result;
    },
  };
};

describe('createCartRepository', () => {
  it('giới hạn từ env được truyền vào hàm SQL ở đúng một chỗ này', async () => {
    const client = clientReturning({ data: [{ out_status: 'ok', out_quantity: 1 }], error: null });
    const repo = createCartRepository(client, LIMITS);
    await repo.addItem(USER, PRODUCT);
    await repo.setQuantity(USER, PRODUCT, 3);
    expect(client.calls).toEqual([
      {
        name: 'add_cart_item',
        args: { p_user_id: USER, p_product_id: PRODUCT, p_max_quantity: 7, p_max_lines: 4 },
      },
      {
        name: 'set_cart_item_quantity',
        args: { p_user_id: USER, p_product_id: PRODUCT, p_quantity: 3, p_max_quantity: 7 },
      },
    ]);
  });

  it('out_total_vnd (bigint) luôn thành number, kể cả khi PostgREST trả chuỗi; giỏ rỗng có fingerprint null', async () => {
    const row = (total) => ({
      out_fingerprint: null,
      out_total_vnd: total,
      out_item_count: 0,
      out_line_count: 0,
      out_has_unavailable: false,
      out_items: [],
    });
    for (const total of ['30000000000', 30000000000]) {
      const repo = createCartRepository(
        clientReturning({ data: [row(total)], error: null }),
        LIMITS,
      );
      const cart = await repo.getCart(USER);
      expect(cart.totalVnd).toBe(30000000000);
      expect(typeof cart.totalVnd).toBe('number');
      expect(cart.fingerprint).toBeNull();
    }
  });

  it('lỗi Postgres có dữ liệu ("Failing row contains") chỉ còn lại mã, không đi tiếp tới errorHandler', async () => {
    const leaky = {
      code: '23514',
      message: 'new row violates check constraint "cart_items_quantity_chk"',
      details: 'Failing row contains (3b24..., 9f1c..., 1000, 199000).',
    };
    const repo = createCartRepository(clientReturning({ data: null, error: leaky }), LIMITS);
    const err = await repo.addItem(USER, PRODUCT).catch((e) => e);
    expect(err).toBeInstanceOf(CartRepositoryError);
    expect(err.code).toBe('23514');
    expect(JSON.stringify({ message: err.message, own: { ...err } })).not.toMatch(
      /Failing row|violates|199000/,
    );

    const thrown = createCartRepository(clientReturning(new TypeError('fetch failed')), LIMITS);
    expect(await thrown.getCart(USER).catch((e) => e)).toBeInstanceOf(CartRepositoryError);
  });
});
