import { describe, it, expect } from 'vitest';
import { inspect } from 'node:util';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from './helpers/authTestKit.js';
import { createOrderRepository } from '../src/repositories/orderRepository.js';

const ZERO_ID = '00000000-0000-4000-8000-000000000000';
const RECIPIENT = {
  name: 'Nguyễn Văn A',
  phone: '0912345678',
  address: '12 Lê Lợi, Quận 1, TP. HCM',
};

async function setup(envOverrides = {}, options = {}) {
  const ctx = await createTestApp(envOverrides, options);
  let seq = 0;
  const category = ctx.categoryRepository.seed('Áo thun');

  async function buyer() {
    seq += 1;
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: `buyer${seq}@example.com`, password: 'abc12345' });
    const auth = { Authorization: `Bearer ${res.body.data.token}` };
    const me = {
      id: res.body.data.user.id,
      auth,
      cart: async () => (await request(ctx.app).get('/api/cart').set(auth)).body.data,
      add: (productId) => request(ctx.app).post('/api/cart/items').set(auth).send({ productId }),
      setQuantity: (productId, quantity) =>
        request(ctx.app).patch(`/api/cart/items/${productId}`).set(auth).send({ quantity }),
      remove: (productId) => request(ctx.app).delete(`/api/cart/items/${productId}`).set(auth),
      /** Đặt hàng với giỏ hiện tại (hoặc `fingerprint` tự chọn), khóa mới nếu không truyền. */
      place: (body = {}) =>
        request(ctx.app)
          .post('/api/orders')
          .set(auth)
          .send({ idempotencyKey: randomUUID(), recipient: RECIPIENT, ...body }),
      async placeSeen(body = {}) {
        const { fingerprint } = await me.cart();
        return me.place({ cartFingerprint: fingerprint, ...body });
      },
      orders: (query = '') => request(ctx.app).get(`/api/orders${query}`).set(auth),
      order: (id) => request(ctx.app).get(`/api/orders/${id}`).set(auth),
    };
    return me;
  }

  async function admin() {
    const user = await ctx.userRepository.create({
      email: 'admin@example.com',
      passwordHash: `$2b$04$${'a'.repeat(53)}`,
      role: 'admin',
    });
    const token = jwt.sign({ role: 'admin' }, ctx.env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: user.id,
    });
    return { Authorization: `Bearer ${token}` };
  }

  const product = (name = 'Áo thun trắng', priceVnd = 100000) => {
    const row = ctx.productRepository.seed({ name, priceVnd, categoryId: category.id });
    ctx.categoryRepository.products.push(row);
    return row;
  };
  return { ctx, buyer, admin, product };
}

describe('xác thực, phân quyền (AC-15)', () => {
  it('không token -> 401; admin -> 403 và repository không bị chạm', async () => {
    const { ctx, admin } = await setup();
    const auth = await admin();
    for (const [method, url] of [
      ['post', '/api/orders'],
      ['get', '/api/orders'],
      ['get', `/api/orders/${ZERO_ID}`],
      ['patch', `/api/cart/items/${ZERO_ID}`],
      ['delete', `/api/cart/items/${ZERO_ID}`],
    ]) {
      const anon = await request(ctx.app)[method](url).send({});
      expect([url, anon.status]).toEqual([url, 401]);
      const res = await request(ctx.app)[method](url).set(auth).send({});
      expect([url, res.status, res.body.error.code]).toEqual([url, 403, 'FORBIDDEN']);
    }
    expect(ctx.orderRepository.calls).toEqual([]);
    expect(ctx.cartRepository.calls).toEqual([]);
  });

  it('id sai định dạng -> 404 và không gọi repository; đơn của người khác và đơn không có cùng một câu trả lời', async () => {
    const { ctx, buyer, product } = await setup();
    const a = await buyer();
    const b = await buyer();
    await a.add(product().id);
    const placed = await a.placeSeen();
    expect(placed.status).toBe(201);

    const calls = ctx.orderRepository.calls.length;
    const bad = await a.order('khong-phai-uuid');
    expect([bad.status, bad.body.error.code]).toEqual([404, 'NOT_FOUND']);
    expect(ctx.orderRepository.calls.length).toBe(calls);

    const others = await b.order(placed.body.data.id);
    const missing = await b.order(ZERO_ID);
    expect([others.status, missing.status]).toEqual([404, 404]);
    expect(others.body).toEqual(missing.body);
    expect(JSON.stringify(others.body)).not.toContain(RECIPIENT.phone);

    const mine = await a.order(placed.body.data.id);
    expect(mine.status).toBe(200);
  });

  it('mọi response của /orders có Cache-Control: no-store (có dữ liệu cá nhân)', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    await a.add(product().id);
    const placed = await a.placeSeen();
    const list = await a.orders();
    const detail = await a.order(placed.body.data.id);
    const rejected = await a.place({ cartFingerprint: 'x' });
    for (const res of [placed, list, detail, rejected]) {
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
});

describe('validation thông tin nhận hàng (AC-16)', () => {
  it('chuẩn hóa +84 và dấu chấm thành 0912345678; họ tên, địa chỉ gom khoảng trắng', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    const p = product();
    for (const phone of ['+84 912 345 678', '091.234.5678', '(091) 234-5678', '84912345678']) {
      await a.add(p.id);
      const res = await a.placeSeen({
        recipient: { name: '  Nguyễn   Văn A ', phone, address: '12  Lê Lợi,\nQuận 1, TP. HCM' },
      });
      expect([phone, res.status]).toEqual([phone, 201]);
      expect(res.body.data.recipient).toEqual(RECIPIENT);
    }
  });

  it.each([
    ['name', { name: 'A' }],
    ['name', { name: 'a'.repeat(101) }],
    ['name', { name: 'Nguyen\u0000A' }],
    ['name', { name: 12 }],
    ['phone', { phone: '0212345678' }],
    ['phone', { phone: '091234567' }],
    ['phone', { phone: '09123456789' }],
    ['phone', { phone: '+1 202 555 0100' }],
    ['phone', { phone: null }],
    ['address', { address: 'ngắn quá' }],
    ['address', { address: 'a'.repeat(301) }],
  ])('recipient.%s sai -> 400 đúng field, không gọi repository', async (field, patch) => {
    const { ctx, buyer, product } = await setup();
    const a = await buyer();
    await a.add(product().id);
    const res = await a.placeSeen({ recipient: { ...RECIPIENT, ...patch } });
    expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect(res.body.error.details.map((d) => d.field)).toEqual([`recipient.${field}`]);
    expect(ctx.orderRepository.calls).toEqual([]);
  });

  it('thiếu hoặc sai idempotencyKey, cartFingerprint, recipient -> 400', async () => {
    const { ctx, buyer } = await setup();
    const a = await buyer();
    const cases = [
      [{ idempotencyKey: 'abc' }, 'idempotencyKey'],
      [{ idempotencyKey: undefined }, 'idempotencyKey'],
      [{ cartFingerprint: 'abc' }, 'cartFingerprint'],
      [{ cartFingerprint: undefined }, 'cartFingerprint'],
      [{ cartFingerprint: 'a'.repeat(32), recipient: undefined }, 'recipient'],
    ];
    for (const [patch, field] of cases) {
      const res = await a.place({ cartFingerprint: 'a'.repeat(32), ...patch });
      expect([field, res.status]).toEqual([field, 400]);
      expect(res.body.error.details.map((d) => d.field)).toContain(field);
    }
    expect(ctx.orderRepository.calls).toEqual([]);
  });

  it('fingerprint chữ hoa được đưa về chữ thường trước khi so (không thành CART_CHANGED oan)', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    await a.add(product().id);
    const { fingerprint } = await a.cart();
    const res = await a.place({ cartFingerprint: fingerprint.toUpperCase() });
    expect(res.status).toBe(201);
  });
});

describe('đặt hàng: tiền do server tính (AC-04), đổi giá (AC-06), ngừng bán (AC-08)', () => {
  it('totalVnd, items, priceVnd từ client bị bỏ qua; đơn đúng giá và giỏ về rỗng', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    const p1 = product('Áo A', 199000);
    const p2 = product('Áo B', 450000);
    await a.add(p1.id);
    await a.add(p1.id);
    await a.add(p2.id);
    const res = await a.placeSeen({
      totalVnd: 1,
      items: [{ productId: p1.id, priceVnd: 1, quantity: 99 }],
      userId: ZERO_ID,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ totalVnd: 848000, itemCount: 3 });
    expect(res.body.data.code).toMatch(/^DH\d{6}$/);
    expect(
      res.body.data.items.map((i) => [i.name, i.unitPriceVnd, i.quantity, i.lineTotalVnd]),
    ).toEqual(
      expect.arrayContaining([
        ['Áo A', 199000, 2, 398000],
        ['Áo B', 450000, 1, 450000],
      ]),
    );
    const after = await a.cart();
    expect([after.items.length, after.totalVnd, after.fingerprint]).toEqual([0, 0, null]);
  });

  it('response đơn không có user_id, idempotency_key, image_path', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    await a.add(product().id);
    const res = await a.placeSeen();
    const text = JSON.stringify(res.body);
    for (const leak of ['userId', 'user_id', 'idempotency', 'image_path', 'imagePath']) {
      expect(text).not.toContain(leak);
    }
    expect(res.body.data.items[0].image.url).toMatch(/^https:\/\//);
  });

  it('admin đổi giá giữa lúc xem và lúc đặt: 409 CART_CHANGED, không đơn, giỏ giữ; xác nhận lần nữa thì giá mới', async () => {
    const { ctx, buyer, product } = await setup();
    const a = await buyer();
    const p = product('Áo A', 100000);
    await a.add(p.id);
    const seen = await a.cart();
    p.price_vnd = 150000;

    const stale = await a.place({ cartFingerprint: seen.fingerprint });
    expect([stale.status, stale.body.error.code]).toEqual([409, 'CART_CHANGED']);
    expect(ctx.orderRepository.orders).toHaveLength(0);
    const cart = await a.cart();
    expect([cart.items.length, cart.totalVnd]).toEqual([1, 150000]);

    const confirmed = await a.place({ cartFingerprint: cart.fingerprint });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.items[0].unitPriceVnd).toBe(150000);
  });

  it('dùng lại cùng khóa sau CART_CHANGED được (khóa chỉ lưu khi có đơn)', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    const p = product('Áo A', 100000);
    await a.add(p.id);
    const key = randomUUID();
    const seen = await a.cart();
    p.price_vnd = 120000;
    expect((await a.place({ idempotencyKey: key, cartFingerprint: seen.fingerprint })).status).toBe(
      409,
    );
    const fresh = await a.cart();
    expect(
      (await a.place({ idempotencyKey: key, cartFingerprint: fresh.fingerprint })).status,
    ).toBe(201);
  });

  it('sản phẩm bị xóa mềm: 409 CART_HAS_UNAVAILABLE, không đơn; bỏ dòng đó rồi đặt thì đơn chỉ có sản phẩm còn bán', async () => {
    const { ctx, buyer, product } = await setup();
    const a = await buyer();
    const p1 = product('Áo A', 100000);
    const p2 = product('Áo B', 200000);
    await a.add(p1.id);
    await a.add(p2.id);
    p1.deleted_at = new Date().toISOString();

    const blocked = await a.placeSeen();
    expect([blocked.status, blocked.body.error.code]).toEqual([409, 'CART_HAS_UNAVAILABLE']);
    expect(ctx.orderRepository.orders).toHaveLength(0);

    expect((await a.remove(p1.id)).status).toBe(200);
    const res = await a.placeSeen();
    expect(res.status).toBe(201);
    expect(res.body.data.items.map((i) => i.name)).toEqual(['Áo B']);
    expect(res.body.data.totalVnd).toBe(200000);
  });

  it('đặt khi giỏ rỗng: 409 CART_EMPTY', async () => {
    const { buyer } = await setup();
    const a = await buyer();
    const res = await a.place({ cartFingerprint: 'a'.repeat(32) });
    expect([res.status, res.body.error.code]).toEqual([409, 'CART_EMPTY']);
  });
});

describe('bản chụp (AC-09)', () => {
  it('đổi giá, đổi tên, xóa mềm sau khi đặt: đơn giữ nguyên tên, giá, tổng; chỉ nhãn ngừng bán đổi', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    const p = product('Áo A', 199000);
    await a.add(p.id);
    const placed = await a.placeSeen();
    p.price_vnd = 999000;
    p.name = 'Tên mới';
    p.deleted_at = new Date().toISOString();

    const detail = (await a.order(placed.body.data.id)).body.data;
    expect(detail.totalVnd).toBe(199000);
    expect(detail.items[0]).toMatchObject({
      name: 'Áo A',
      unitPriceVnd: 199000,
      lineTotalVnd: 199000,
      stillOnSale: false,
    });
    // Ảnh vẫn hiện (D-42 giữ file) dù sản phẩm đã ngừng bán.
    expect(detail.items[0].image.url).toMatch(/^https:\/\//);
  });
});

describe('đặt trùng, hai tab, giỏ đổi ở tab khác (AC-10 → AC-13)', () => {
  it('20 request song song cùng khóa: đúng 1 đơn, 1 response 201, 19 response 200, cùng id', async () => {
    const { ctx, buyer, product } = await setup();
    const a = await buyer();
    await a.add(product().id);
    const { fingerprint } = await a.cart();
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        a.place({ idempotencyKey: key, cartFingerprint: fingerprint }),
      ),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(19);
    expect(new Set(responses.map((r) => r.body.data.id)).size).toBe(1);
    expect(ctx.orderRepository.orders).toHaveLength(1);
  });

  it('gửi lại sau khi mất response, kể cả khi recipient khác và giỏ đã có món mới: trả đúng đơn cũ, không tạo đơn hai', async () => {
    const { ctx, buyer, product } = await setup();
    const a = await buyer();
    const p = product();
    await a.add(p.id);
    const key = randomUUID();
    const first = await a.placeSeen({ idempotencyKey: key });
    await a.add(p.id); // món mới ở giỏ mới
    const retry = await a.place({
      idempotencyKey: key,
      cartFingerprint: 'b'.repeat(32),
      recipient: { ...RECIPIENT, name: 'Người khác' },
    });
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(retry.body.data.recipient.name).toBe(RECIPIENT.name);
    expect(ctx.orderRepository.orders).toHaveLength(1);
    expect((await a.cart()).itemCount).toBe(1);
  });

  it('hai tab, khác khóa, cùng giỏ: đúng 1 đơn, các tab còn lại 409 CART_EMPTY', async () => {
    const { ctx, buyer, product } = await setup();
    const a = await buyer();
    await a.add(product().id);
    const { fingerprint } = await a.cart();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => a.place({ cartFingerprint: fingerprint })),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    const rest = responses.filter((r) => r.status !== 201);
    expect(rest.map((r) => [r.status, r.body.error.code])).toEqual(
      Array(9).fill([409, 'CART_EMPTY']),
    );
    expect(ctx.orderRepository.orders).toHaveLength(1);
  });

  it('tab B thêm món trước khi tab A đặt: CART_CHANGED; thêm sau khi A đặt: món nằm ở giỏ mới, không vào đơn, không mất', async () => {
    const { ctx, buyer, product } = await setup();
    const a = await buyer();
    const p1 = product('Áo A');
    const p2 = product('Áo B');
    await a.add(p1.id);
    const seen = await a.cart();
    await a.add(p2.id); // tab B
    const changed = await a.place({ cartFingerprint: seen.fingerprint });
    expect([changed.status, changed.body.error.code]).toEqual([409, 'CART_CHANGED']);
    expect(ctx.orderRepository.orders).toHaveLength(0);

    const fresh = await a.cart();
    const placed = await a.place({ cartFingerprint: fresh.fingerprint });
    expect(placed.status).toBe(201);
    await a.add(p1.id); // tab B thêm sau khi đã đặt
    const after = await a.cart();
    expect(after.items.map((i) => i.productId)).toEqual([p1.id]);
    expect(placed.body.data.items).toHaveLength(2);
  });
});

describe('Đơn của tôi (AC-19)', () => {
  it('A có 25 đơn, B có 1: trang 1 có 20, trang 2 có 5, trang vượt có items rỗng và total thật; không có số điện thoại, địa chỉ', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    const b = await buyer();
    const p = product();
    for (let i = 0; i < 25; i += 1) {
      await a.add(p.id);
      expect((await a.placeSeen()).status).toBe(201);
    }
    await b.add(p.id);
    await b.placeSeen();

    const page1 = (await a.orders()).body.data;
    expect(page1.items).toHaveLength(20);
    expect(page1.pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
    const codes = page1.items.map((i) => i.code);
    expect([...codes].sort().reverse()).toEqual(codes); // mới nhất trước
    const page2 = (await a.orders('?page=2')).body.data;
    expect(page2.items).toHaveLength(5);
    const beyond = (await a.orders('?page=9')).body.data;
    expect([beyond.items, beyond.pagination.total]).toEqual([[], 25]);

    const text = JSON.stringify([page1, page2]);
    expect(text).not.toContain(RECIPIENT.phone);
    expect(text).not.toContain('Lê Lợi');
    expect(text).not.toContain('recipient');
    const ids = new Set([...page1.items, ...page2.items].map((i) => i.id));
    expect(ids.size).toBe(25);
  });

  it.each(['?page=0', '?page=abc', '?limit=0', '?limit=51', '?page=-1'])(
    'query %s -> 400 VALIDATION_ERROR',
    async (query) => {
      const { ctx, buyer } = await setup();
      const a = await buyer();
      const res = await a.orders(query);
      expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
      expect(ctx.orderRepository.calls).toEqual([]);
    },
  );
});

describe('giỏ: đổi số lượng, bỏ dòng (AC-03, E1 → E3)', () => {
  it('đặt 5; gửi lại vẫn 5; 0, âm, số lẻ, chuỗi, null -> 400; 11 -> 409 CART_QUANTITY_LIMIT với maxQuantity', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    const p = product('Áo A', 199000);
    await a.add(p.id);
    await a.add(p.id);

    for (let i = 0; i < 2; i += 1) {
      const res = await a.setQuantity(p.id, 5);
      expect([res.status, res.body.data.itemCount, res.body.data.totalVnd]).toEqual([
        200, 5, 995000,
      ]);
    }
    for (const bad of [0, -1, 1.5, '5', null, undefined]) {
      const res = await a.setQuantity(p.id, bad);
      expect([String(bad), res.status, res.body.error.code]).toEqual([
        String(bad),
        400,
        'VALIDATION_ERROR',
      ]);
    }
    const over = await a.setQuantity(p.id, 11);
    expect([over.status, over.body.error.code, over.body.error.details]).toEqual([
      409,
      'CART_QUANTITY_LIMIT',
      { maxQuantity: 10 },
    ]);
    // Số lớn hơn kiểu integer của SQL vẫn là 409, không thành 500.
    const huge = await a.setQuantity(p.id, 10 ** 12);
    expect([huge.status, huge.body.error.code]).toEqual([409, 'CART_QUANTITY_LIMIT']);
    expect((await a.cart()).itemCount).toBe(5);
  });

  it('dòng không có trong giỏ hoặc sản phẩm vừa ngừng bán: 404; DELETE idempotent và xóa được dòng ngừng bán', async () => {
    const { buyer, product } = await setup();
    const a = await buyer();
    const p1 = product('Áo A');
    const p2 = product('Áo B');
    await a.add(p1.id);
    await a.add(p2.id);

    const missing = await a.setQuantity(ZERO_ID, 2);
    expect([missing.status, missing.body.error.code]).toEqual([404, 'NOT_FOUND']);
    p1.deleted_at = new Date().toISOString();
    const gone = await a.setQuantity(p1.id, 2);
    expect([gone.status, gone.body.error.code]).toEqual([404, 'NOT_FOUND']);

    const cart = await a.cart();
    expect(cart.items.find((i) => i.productId === p1.id)).toMatchObject({
      available: false,
      priceVnd: null,
    });
    expect(cart.hasUnavailable).toBe(true);

    for (let i = 0; i < 2; i += 1) {
      const res = await a.remove(p1.id);
      expect([res.status, res.body.data.hasUnavailable]).toEqual([200, false]);
    }
  });

  it('PATCH, DELETE sai UUID -> 404 và không gọi repository giỏ; một người chỉ sửa giỏ của mình', async () => {
    const { ctx, buyer, product } = await setup();
    const a = await buyer();
    const b = await buyer();
    const p = product();
    await a.add(p.id);
    const calls = ctx.cartRepository.calls.length;
    for (const res of [await a.setQuantity('abc', 2), await a.remove('abc')]) {
      expect([res.status, res.body.error.code]).toEqual([404, 'NOT_FOUND']);
    }
    expect(ctx.cartRepository.calls.length).toBe(calls);

    const hit = await b.setQuantity(p.id, 3);
    expect(hit.status).toBe(404);
    expect((await a.cart()).itemCount).toBe(1);
  });

  it('thao tác giỏ và đặt hàng không chạm phòng thử đồ (AC-18)', async () => {
    const { ctx, buyer, product } = await setup({}, { tryon: true });
    const a = await buyer(); // chưa có ảnh, số đo, consent
    const p = product();
    await a.add(p.id);
    await a.setQuantity(p.id, 3);
    const res = await a.placeSeen();
    expect(res.status).toBe(201);
    expect(ctx.tryon.repository.calls).toEqual([]);
  });
});

describe('rate limit tạo đơn (D-148)', () => {
  it('đếm cả request bị từ chối ở validation; vượt giới hạn -> 429 kèm retryAfterSeconds', async () => {
    const { buyer } = await setup({ ORDER_CREATES_PER_HOUR: 3 });
    const a = await buyer();
    for (let i = 0; i < 3; i += 1) {
      const res = await a.place({ cartFingerprint: 'sai' });
      expect(res.status).toBe(400);
    }
    const res = await a.place({ cartFingerprint: 'a'.repeat(32) });
    expect([res.status, res.body.error.code]).toEqual([429, 'TOO_MANY_REQUESTS']);
    expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.headers['retry-after']).toBeDefined();
    // Bộ đếm theo người: người khác không bị ảnh hưởng.
    const other = await buyer();
    expect((await other.place({ cartFingerprint: 'sai' })).status).toBe(400);
  });
});

describe('không rò dữ liệu cá nhân vào log (AC-17)', () => {
  const PERSONAL = ['Nguyễn Văn A', '0912345678', 'Lê Lợi', 'Failing row contains'];
  const leakyError = {
    code: '23514',
    message: 'new row for relation "orders" violates check constraint "orders_recipient_phone_chk"',
    details: `Failing row contains (x, 1, y, z, 100000, 1, ${RECIPIENT.name}, ${RECIPIENT.phone}, ${RECIPIENT.address}, now).`,
    hint: null,
  };

  function spyLogger() {
    const lines = [];
    // inspect cho ra cả thuộc tính riêng, cause, stack: giống những gì console.error in ở môi trường dev.
    return {
      lines,
      error: (...args) => lines.push(args.map((a) => inspect(a, { depth: 8 })).join(' ')),
    };
  }

  it('lỗi ràng buộc từ place_order: 500 INTERNAL_ERROR; log và response không có họ tên, số điện thoại, địa chỉ', async () => {
    const logger = spyLogger();
    const client = {
      rpc: async () => ({ data: null, error: leakyError }),
      from: () => {
        throw new Error('không được đọc');
      },
    };
    const { buyer, product } = await setup(
      {},
      { logger, orderRepositoryOverride: createOrderRepository(client) },
    );
    const a = await buyer();
    await a.add(product().id);
    const res = await a.placeSeen();
    expect([res.status, res.body.error.code]).toEqual([500, 'INTERNAL_ERROR']);
    expect(logger.lines.length).toBeGreaterThan(0); // có log, và vẫn sạch
    const everything = `${logger.lines.join('\n')}\n${JSON.stringify(res.body)}`;
    for (const secret of PERSONAL) expect(everything).not.toContain(secret);
    expect(everything).toContain('23514'); // vẫn đủ để điều tra
  });

  it('ném thẳng từ client (không phải { error }) cũng không để lộ', async () => {
    const logger = spyLogger();
    const client = {
      rpc: async () => {
        throw Object.assign(new Error(leakyError.details), {
          code: '23514',
          details: leakyError.details,
        });
      },
    };
    const { buyer, product } = await setup(
      {},
      { logger, orderRepositoryOverride: createOrderRepository(client) },
    );
    const a = await buyer();
    await a.add(product().id);
    const res = await a.placeSeen();
    expect(res.status).toBe(500);
    for (const secret of PERSONAL) expect(logger.lines.join('\n')).not.toContain(secret);
  });

  it('đặt thành công và lỗi 400: không có dòng log nào chứa thông tin nhận hàng', async () => {
    const logger = spyLogger();
    const { buyer, product } = await setup({}, { logger });
    const a = await buyer();
    await a.add(product().id);
    expect((await a.place({ cartFingerprint: 'sai' })).status).toBe(400);
    expect((await a.placeSeen()).status).toBe(201);
    for (const secret of PERSONAL) expect(logger.lines.join('\n')).not.toContain(secret);
  });
});
