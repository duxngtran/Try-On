import { describe, it, expect } from 'vitest';
import {
  OrderRepositoryError,
  createOrderRepository,
} from '../src/repositories/orderRepository.js';

const USER = '3b241101-e2bb-4255-8caf-4136c566a962';
const ORDER = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';

/** Query builder giả: ghi lại từng bước gọi, `await` trả kết quả đã cho (kết quả có thể là hàng đợi theo thứ tự gọi). */
function fakeClient(results) {
  const queue = [].concat(results);
  const log = [];
  const next = () => (queue.length > 1 ? queue.shift() : queue[0]);
  const builder = (table) => {
    const entry = { table, steps: [] };
    log.push(entry);
    const proxy = new Proxy(
      {},
      {
        get: (_, method) => {
          if (method === 'then') {
            const result = next();
            return (resolve, reject) =>
              result instanceof Error ? reject(result) : resolve(result);
          }
          return (...args) => {
            entry.steps.push([method, ...args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  return { log, from: builder };
}

describe('placeOrder', () => {
  it('truyền đủ tham số cho place_order và đọc out_status, out_order_id', async () => {
    const calls = [];
    const client = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: [{ out_status: 'replayed', out_order_id: ORDER }], error: null };
      },
    };
    const repo = createOrderRepository(client);
    const result = await repo.placeOrder(USER, {
      idempotencyKey: ORDER,
      fingerprint: 'f'.repeat(32),
      name: 'A B',
      phone: '0912345678',
      address: '12 Lê Lợi, Q1',
    });
    expect(result).toEqual({ status: 'replayed', orderId: ORDER });
    expect(calls[0]).toEqual({
      name: 'place_order',
      args: {
        p_user_id: USER,
        p_idempotency_key: ORDER,
        p_fingerprint: 'f'.repeat(32),
        p_recipient_name: 'A B',
        p_recipient_phone: '0912345678',
        p_shipping_address: '12 Lê Lợi, Q1',
      },
    });
  });

  it('lỗi Postgres có "Failing row contains" chỉ còn mã: không message, details, cause của đối tượng gốc', async () => {
    const secret = 'Nguyễn Văn A, 0912345678, 12 Lê Lợi';
    const client = {
      rpc: async () => ({
        data: null,
        error: {
          code: '23514',
          message: 'violates check constraint',
          details: `Failing row contains (${secret})`,
        },
      }),
    };
    const err = await createOrderRepository(client)
      .placeOrder(USER, {})
      .catch((e) => e);
    expect(err).toBeInstanceOf(OrderRepositoryError);
    expect(err.code).toBe('23514');
    const dump = JSON.stringify({ ...err, message: err.message, cause: err.cause });
    expect(dump).not.toContain('Failing row');
    expect(dump).not.toContain('0912345678');
    expect(err.cause).toBeUndefined();
  });

  it('rpc ném lỗi (mạng) và rpc không trả hàng đều thành OrderRepositoryError', async () => {
    const boom = {
      rpc: async () => Promise.reject(Object.assign(new Error('x 0912345678'), { code: 'ECONN' })),
    };
    const err = await createOrderRepository(boom)
      .placeOrder(USER, {})
      .catch((e) => e);
    expect([err.name, err.code, err.message.includes('0912345678')]).toEqual([
      'OrderRepositoryError',
      'ECONN',
      false,
    ]);
    const empty = { rpc: async () => ({ data: [], error: null }) };
    await expect(createOrderRepository(empty).placeOrder(USER, {})).rejects.toMatchObject({
      code: 'EMPTY',
    });
  });
});

describe('đọc đơn', () => {
  it('danh sách lọc theo user_id ngay trong truy vấn, chỉ chọn cột của OrderSummary (không có thông tin nhận hàng)', async () => {
    const client = fakeClient({
      data: [
        {
          id: ORDER,
          order_no: '123',
          created_at: '2026-11-06T02:00:00.123+00:00',
          item_count: 3,
          total_vnd: '30000000000',
        },
      ],
      error: null,
      count: 1,
    });
    const { rows, total } = await createOrderRepository(client).listByUser(USER, {
      page: 1,
      limit: 20,
    });
    const steps = Object.fromEntries(client.log[0].steps.map(([name, ...args]) => [name, args]));
    expect(client.log[0].table).toBe('orders');
    expect(steps.eq).toEqual(['user_id', USER]);
    for (const column of ['recipient_name', 'recipient_phone', 'shipping_address']) {
      expect(steps.select[0]).not.toContain(column);
    }
    expect(steps.range).toEqual([0, 19]);
    // bigint có thể về dạng chuỗi: luôn thành number
    expect(rows[0]).toMatchObject({ orderNo: 123, totalVnd: 30000000000 });
    expect(total).toBe(1);
  });

  it('trang vượt tổng (PGRST103) trả rows rỗng và total thật, không ném lỗi (D-65)', async () => {
    const client = fakeClient([
      {
        data: null,
        error: { code: 'PGRST103', message: 'Requested range not satisfiable' },
        count: null,
      },
      { data: null, error: null, count: 25 },
    ]);
    const result = await createOrderRepository(client).listByUser(USER, { page: 9, limit: 20 });
    expect(result).toEqual({ rows: [], total: 25 });
  });

  it('chi tiết lọc theo cả id và user_id; dòng hàng sắp theo line_no; sản phẩm đã xóa mềm thành stillOnSale=false', async () => {
    const client = fakeClient({
      data: {
        id: ORDER,
        order_no: 7,
        created_at: '2026-11-06T02:00:00+00:00',
        item_count: 3,
        total_vnd: 500,
        recipient_name: 'A B',
        recipient_phone: '0912345678',
        shipping_address: '12 Lê Lợi, Q1',
        items: [
          {
            line_no: 2,
            product_id: 'p2',
            product_name: 'B',
            unit_price_vnd: 200,
            quantity: 1,
            line_total_vnd: 200,
            product: { image_path: 'b.jpg', image_version: 2, deleted_at: null },
          },
          {
            line_no: 1,
            product_id: 'p1',
            product_name: 'A',
            unit_price_vnd: 150,
            quantity: 2,
            line_total_vnd: 300,
            product: { image_path: 'a.jpg', image_version: 1, deleted_at: '2026-11-06T00:00:00Z' },
          },
        ],
      },
      error: null,
    });
    const order = await createOrderRepository(client).findByUser(USER, ORDER);
    const eqs = client.log[0].steps.filter(([name]) => name === 'eq').map(([, ...args]) => args);
    expect(eqs).toEqual(
      expect.arrayContaining([
        ['id', ORDER],
        ['user_id', USER],
      ]),
    );
    expect(order.items.map((i) => [i.name, i.stillOnSale])).toEqual([
      ['A', false],
      ['B', true],
    ]);
  });

  it('không có đơn -> null; lỗi đọc chỉ còn mã', async () => {
    const none = fakeClient({ data: null, error: null });
    expect(await createOrderRepository(none).findByUser(USER, ORDER)).toBeNull();
    const bad = fakeClient({
      data: null,
      error: { code: '42501', message: 'x', details: 'Failing row contains (0912345678)' },
    });
    const err = await createOrderRepository(bad)
      .findByUser(USER, ORDER)
      .catch((e) => e);
    expect([err.name, err.code, err.message.includes('0912345678')]).toEqual([
      'OrderRepositoryError',
      '42501',
      false,
    ]);
  });
});
