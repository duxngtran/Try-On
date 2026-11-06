import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from './helpers/authTestKit.js';
import { setupTryon } from './helpers/tryonKit.js';

const ZERO_ID = '00000000-0000-4000-8000-000000000000';

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
    return {
      id: res.body.data.user.id,
      auth,
      cart: () => request(ctx.app).get('/api/cart').set(auth),
      add: (productId) => request(ctx.app).post('/api/cart/items').set(auth).send({ productId }),
    };
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

describe('xác thực, phân quyền, validate (AC-10)', () => {
  it('không token -> 401; admin -> 403 và repository không bị chạm', async () => {
    const { ctx, admin } = await setup();
    const auth = await admin();
    for (const [method, url] of [
      ['get', '/api/cart'],
      ['post', '/api/cart/items'],
    ]) {
      const anon = await request(ctx.app)[method](url).send({ productId: ZERO_ID });
      expect([url, anon.status]).toEqual([url, 401]);
      const res = await request(ctx.app)[method](url).set(auth).send({ productId: ZERO_ID });
      expect([url, res.status, res.body.error.code]).toEqual([url, 403, 'FORBIDDEN']);
    }
    expect(ctx.cartRepository.calls).toEqual([]);
  });

  it('productId thiếu hoặc không phải UUID -> 400 VALIDATION_ERROR, không gọi repository', async () => {
    const { ctx, buyer } = await setup();
    const b = await buyer();
    for (const body of [{}, { productId: 'abc' }, { productId: 12 }, { productId: null }]) {
      const res = await request(ctx.app).post('/api/cart/items').set(b.auth).send(body);
      expect([JSON.stringify(body), res.status, res.body.error.code]).toEqual([
        JSON.stringify(body),
        400,
        'VALIDATION_ERROR',
      ]);
      expect(res.body.error.details[0].field).toBe('productId');
    }
    expect(ctx.cartRepository.calls).toEqual([]);
  });

  it('B chỉ thấy giỏ của B; userId, giá, số lượng từ client bị bỏ qua', async () => {
    const { ctx, buyer, product } = await setup();
    const [a, b] = [await buyer(), await buyer()];
    const p = product('Áo A', 100000);
    const res = await request(ctx.app).post('/api/cart/items').set(a.auth).send({
      productId: p.id,
      userId: b.id,
      quantity: 5,
      priceVnd: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.itemCount).toBe(1);
    expect(res.body.data.items[0].priceVnd).toBe(100000);

    const mine = (await b.cart()).body.data;
    expect([mine.items, mine.itemCount, mine.fingerprint]).toEqual([[], 0, null]);
    expect(ctx.cartRepository.lines.map((l) => l.userId)).toEqual([a.id]);
  });
});

describe('thêm vào giỏ (AC-01, AC-04, AC-09, AC-11)', () => {
  it('chưa có ảnh, số đo, consent vẫn thêm và đọc được; hình dạng response khớp api.md 7', async () => {
    const { ctx, buyer, product } = await setup();
    const b = await buyer();
    expect((await b.cart()).body.data).toEqual({
      items: [],
      itemCount: 0,
      lineCount: 0,
      totalVnd: 0,
      hasUnavailable: false,
      fingerprint: null,
      limits: { maxQuantity: 10, maxLines: 30 },
    });
    const p = product('Áo thun trắng', 199000);
    const res = await b.add(p.id);
    expect(res.status).toBe(200);
    const { items, ...rest } = res.body.data;
    expect(rest).toMatchObject({
      itemCount: 1,
      lineCount: 1,
      totalVnd: 199000,
      hasUnavailable: false,
      limits: { maxQuantity: 10, maxLines: 30 },
    });
    expect(typeof rest.fingerprint).toBe('string');
    expect(items).toEqual([
      {
        productId: p.id,
        name: 'Áo thun trắng',
        category: { id: ctx.categoryRepository.rows[0].id, name: 'Áo thun' },
        image: { url: expect.stringContaining(p.image_path), version: 1 },
        quantity: 1,
        priceVnd: 199000,
        lineTotalVnd: 199000,
        priceChangedFrom: null,
        available: true,
      },
    ]);
    const text = JSON.stringify(res.body);
    for (const leaked of ['image_path', 'imagePath', 'added', 'user_id', 'userId']) {
      expect(text).not.toContain(leaked);
    }
  });

  it('thêm lại tăng số lượng, vẫn một dòng; giá đổi thì tính giá mới và báo giá cũ', async () => {
    const { buyer, product } = await setup();
    const b = await buyer();
    const p = product('Áo', 100000);
    await b.add(p.id);
    await b.add(p.id);
    p.price_vnd = 150000;

    const before = (await b.cart()).body.data;
    expect(before.items[0]).toMatchObject({
      quantity: 2,
      priceVnd: 150000,
      lineTotalVnd: 300000,
      priceChangedFrom: 100000,
    });
    expect(before.totalVnd).toBe(300000);

    const after = (await b.add(p.id)).body.data;
    expect(after.lineCount).toBe(1);
    // Thêm lại cập nhật giá lúc thêm: người mua vừa thấy giá hiện tại.
    expect(after.items[0]).toMatchObject({ quantity: 3, priceChangedFrom: null });
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });
});

describe('sản phẩm vừa bị xóa (AC-07, D-143)', () => {
  it('thêm sản phẩm đã xóa -> 404, giỏ không đổi; dòng đã có thì ngừng bán nhưng vẫn tính số món', async () => {
    const { ctx, buyer, product } = await setup();
    const b = await buyer();
    const gone = product('Áo cũ', 100000);
    const kept = product('Áo còn', 50000);
    await b.add(gone.id);
    await b.add(kept.id);
    gone.deleted_at = '2026-11-06T00:00:00Z';

    const res = await b.add(gone.id);
    expect([res.status, res.body.error.code]).toEqual([404, 'NOT_FOUND']);
    expect(res.body.error.message).toBe('Sản phẩm này không còn bán.');
    expect(ctx.cartRepository.lines).toHaveLength(2);

    const cart = (await b.cart()).body.data;
    const line = cart.items.find((i) => i.productId === gone.id);
    expect(line).toMatchObject({
      available: false,
      priceVnd: null,
      lineTotalVnd: 0,
      priceChangedFrom: null,
      name: 'Áo cũ',
    });
    expect(line.image.url).toContain(gone.image_path);
    expect([cart.totalVnd, cart.itemCount, cart.hasUnavailable]).toEqual([50000, 2, true]);

    const unknown = await b.add(ZERO_ID);
    expect(unknown.status).toBe(404);
  });

  it('sản phẩm bị xóa đúng lúc ghi (sau khi khóa) -> 404, không để lại dòng', async () => {
    const { ctx, buyer, product } = await setup();
    const b = await buyer();
    const p = product();
    ctx.cartRepository.beforeWrite = async () => {
      p.deleted_at = '2026-11-06T00:00:00Z';
    };
    expect((await b.add(p.id)).status).toBe(404);
    expect(ctx.cartRepository.lines).toHaveLength(0);
  });
});

describe('giới hạn khi song song (AC-08)', () => {
  it('20 request song song cùng sản phẩm: đúng 10 thành công, 10 CART_QUANTITY_LIMIT kèm maxQuantity', async () => {
    const { buyer, product } = await setup();
    const b = await buyer();
    const p = product();
    const results = await Promise.all(Array.from({ length: 20 }, () => b.add(p.id)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    const rejected = results.filter((r) => r.status === 409);
    expect(rejected).toHaveLength(10);
    for (const r of rejected) {
      expect(r.body.error.code).toBe('CART_QUANTITY_LIMIT');
      expect(r.body.error.details).toEqual({ maxQuantity: 10 });
    }
    expect((await b.cart()).body.data.items[0].quantity).toBe(10);
  });

  it('giới hạn dòng: vượt -> CART_FULL kèm maxLines, tính cả dòng ngừng bán; thêm sản phẩm đã có vẫn được', async () => {
    const { buyer, product } = await setup({ CART_MAX_LINES: 3 });
    const b = await buyer();
    const products = [product('A'), product('B'), product('C'), product('D'), product('E')];
    const results = await Promise.all(products.map((p) => b.add(p.id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    const full = results.filter((r) => r.status === 409);
    expect(full).toHaveLength(2);
    expect(full[0].body.error).toMatchObject({ code: 'CART_FULL', details: { maxLines: 3 } });

    const inCart = products.find((p) => results[products.indexOf(p)].status === 200);
    inCart.deleted_at = '2026-11-06T00:00:00Z';
    const other = products.find((p) => results[products.indexOf(p)].status === 409);
    expect((await b.add(other.id)).body.error.code).toBe('CART_FULL');
  });

  it('giới hạn lấy từ env, không viết cứng', async () => {
    const { buyer, product } = await setup({ CART_MAX_QUANTITY: 2 });
    const b = await buyer();
    const p = product();
    await b.add(p.id);
    await b.add(p.id);
    const res = await b.add(p.id);
    expect(res.body.error.details).toEqual({ maxQuantity: 2 });
    expect((await b.cart()).body.data.limits.maxQuantity).toBe(2);
  });
});

describe('rate limit (D-149) và lỗi hệ thống', () => {
  it('vượt giới hạn -> 429 kèm retryAfterSeconds; GET và POST dùng chung một bộ đếm, đếm cả request bị từ chối', async () => {
    const { buyer, product } = await setup({ CART_REQUESTS_PER_MIN: 3 });
    const [a, b] = [await buyer(), await buyer()];
    const p = product();
    expect((await a.cart()).status).toBe(200);
    expect((await a.add(p.id)).status).toBe(200);
    expect((await a.add('abc')).status).toBe(400);
    const limited = await a.add(p.id);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.headers['retry-after']).toBeDefined();
    // Theo từng người: B không bị ảnh hưởng.
    expect((await b.cart()).status).toBe(200);
  });

  it('lỗi DB -> 500 INTERNAL_ERROR, không lộ chi tiết', async () => {
    const { ctx, buyer, product } = await setup();
    const b = await buyer();
    const p = product();
    ctx.cartRepository.failNext = true;
    const res = await b.add(p.id);
    expect([res.status, res.body.error.code]).toEqual([500, 'INTERNAL_ERROR']);
    expect(JSON.stringify(res.body)).not.toMatch(/db down/);
  });

  it('tài khoản bị xóa giữa lúc xác thực và lúc ghi -> 401, không tạo dòng', async () => {
    const { ctx, buyer, product } = await setup();
    const b = await buyer();
    const p = product();
    ctx.cartRepository.beforeWrite = async () => {};
    const original = ctx.cartRepository.addItem;
    ctx.cartRepository.addItem = (userId, productId) => {
      ctx.userRepository.rows.delete(userId);
      return original(userId, productId);
    };
    const res = await b.add(p.id);
    expect([res.status, res.body.error.code]).toEqual([401, 'UNAUTHORIZED']);
    expect(ctx.cartRepository.lines).toHaveLength(0);
  });
});

describe('giỏ không dùng GenAI (AC-03, D-146, R1)', () => {
  it('thêm 5 lần: không job, không gọi dịch vụ, không đọc hay ghi repository try-on', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('Áo', kit.category().id);
    const usageBefore = await kit.tryon.repository.getUsage(buyer.id);
    const callsBefore = kit.tryon.repository.calls.length;
    const jobsBefore = kit.tryon.repository.jobs.length;
    const providerCallsBefore = kit.tryon.provider.calls.length;

    for (let i = 0; i < 5; i += 1) {
      const res = await buyer.post('/api/cart/items', { productId: p.id });
      expect(res.status).toBe(200);
    }
    expect((await buyer.get('/api/cart')).status).toBe(200);
    expect(kit.tryon.repository.calls).toHaveLength(callsBefore);
    // Worker chạy sau cả chuỗi thêm giỏ cũng không có job nào để xử lý.
    await kit.tryon.worker.tick();
    expect(kit.tryon.repository.jobs).toHaveLength(jobsBefore);
    expect(kit.tryon.provider.calls).toHaveLength(providerCallsBefore);
    expect(await kit.tryon.repository.getUsage(buyer.id)).toEqual(usageBefore);
    expect((await buyer.get('/api/cart')).body.data.items[0].quantity).toBe(5);
  });
});
