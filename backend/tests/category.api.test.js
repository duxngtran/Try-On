import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from './helpers/authTestKit.js';

const ZERO_ID = '00000000-0000-4000-8000-000000000000';
let ctx;
let admin; // header Authorization

async function tokenFor(role, email) {
  const user = await ctx.userRepository.create({
    email,
    passwordHash: '$2b$04$' + 'a'.repeat(53),
    role,
  });
  const token = jwt.sign({ role }, ctx.env.JWT_SECRET, { algorithm: 'HS256', subject: user.id });
  return { Authorization: `Bearer ${token}` };
}

const api = {
  list: (auth = admin) => request(ctx.app).get('/api/admin/categories').set(auth),
  create: (body, auth = admin) =>
    request(ctx.app).post('/api/admin/categories').set(auth).send(body),
  rename: (id, body, auth = admin) =>
    request(ctx.app).patch(`/api/admin/categories/${id}`).set(auth).send(body),
  remove: (id, auth = admin) => request(ctx.app).delete(`/api/admin/categories/${id}`).set(auth),
};

beforeEach(async () => {
  ctx = await createTestApp();
  admin = await tokenFor('admin', 'admin@example.com');
});

describe('phân quyền (AC-09)', () => {
  it('không token -> 401, token role user -> 403, trên mọi endpoint', async () => {
    const user = await tokenFor('user', 'u@example.com');
    const calls = (auth) => {
      const set = (r) => (auth ? r.set(auth) : r);
      return [
        set(request(ctx.app).get('/api/admin/categories')),
        set(request(ctx.app).post('/api/admin/categories').send({ name: 'Áo' })),
        set(request(ctx.app).patch(`/api/admin/categories/${ZERO_ID}`).send({ name: 'Áo' })),
        set(request(ctx.app).delete(`/api/admin/categories/${ZERO_ID}`)),
      ];
    };
    for (const res of await Promise.all(calls(null))) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
    for (const res of await Promise.all(calls(user))) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(ctx.categoryRepository.rows).toHaveLength(0);
  });

  it('user thường gọi id sai định dạng vẫn nhận 403, không lộ 404 (thứ tự 401 -> 403 -> 404)', async () => {
    const user = await tokenFor('user', 'u@example.com');
    expect((await api.remove('abc', user)).status).toBe(403);
  });
});

describe('danh sách và tạo (AC-01, AC-02)', () => {
  it('giữ thứ tự tạo, kèm productCount, timestamp ISO dạng Z dù DB trả +00:00', async () => {
    const a = ctx.categoryRepository.seed('Áo thun');
    ctx.categoryRepository.seed('Váy');
    ctx.categoryRepository.products.push({ category_id: a.id, deleted_at: null });
    ctx.categoryRepository.products.push({ category_id: a.id, deleted_at: 'x' });
    const res = await api.list();
    expect(res.status).toBe(200);
    const items = res.body.data.categories;
    expect(items.map((c) => [c.name, c.productCount])).toEqual([
      ['Áo thun', 1],
      ['Váy', 0],
    ]);
    expect(items[0].createdAt).toMatch(/\.\d{3}Z$/);
    expect(items[0].updatedAt).toMatch(/\.\d{3}Z$/);
  });

  it('chuẩn hóa tên rồi trả 201 với productCount 0', async () => {
    const res = await api.create({ name: '  Áo   khoác ' });
    expect(res.status).toBe(201);
    expect(res.body.data.category).toMatchObject({ name: 'Áo khoác', productCount: 0 });
  });

  it('lỗi DB khi tải danh sách -> 500 INTERNAL_ERROR, không lộ chi tiết', async () => {
    ctx.categoryRepository.failNextList = true;
    const res = await api.list();
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('db down');
  });
});

describe('validation (AC-04)', () => {
  it.each([[''], ['   '], ['A'], ['a'.repeat(51)], [123], [undefined]])(
    'tên %j -> 400 VALIDATION_ERROR có details ở trường name',
    async (name) => {
      const res = await api.create({ name });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].field).toBe('name');
      expect(ctx.categoryRepository.rows).toHaveLength(0);
    },
  );

  it('biên 2 và 50 ký tự được chấp nhận', async () => {
    expect((await api.create({ name: 'Áo' })).status).toBe(201);
    expect((await api.create({ name: 'a'.repeat(50) })).status).toBe(201);
  });
});

describe('trùng tên (AC-03)', () => {
  it('thêm trùng khác hoa thường -> 409; khác dấu thì được', async () => {
    ctx.categoryRepository.seed('Áo thun');
    const dup = await api.create({ name: 'ÁO THUN' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CATEGORY_NAME_EXISTS');
    expect(dup.body.error.message).toBe('Danh mục này đã tồn tại.');
    ctx.categoryRepository.seed('Váy');
    expect((await api.create({ name: 'Vay' })).status).toBe(201);
    expect(ctx.categoryRepository.rows).toHaveLength(3);
  });

  it('đổi tên thành tên của danh mục khác -> 409, dữ liệu không đổi; đúng tên hiện tại -> 200', async () => {
    const a = ctx.categoryRepository.seed('Áo thun');
    ctx.categoryRepository.seed('Váy');
    const clash = await api.rename(a.id, { name: 'váy' });
    expect(clash.status).toBe(409);
    expect(ctx.categoryRepository.rows[0].name).toBe('Áo thun');
    expect((await api.rename(a.id, { name: 'Áo thun' })).status).toBe(200);
  });

  it('tên của danh mục đã xóa dùng lại được (R3)', async () => {
    const a = ctx.categoryRepository.seed('Áo thun');
    expect((await api.remove(a.id)).status).toBe(200);
    expect((await api.create({ name: 'Áo thun' })).status).toBe(201);
  });
});

describe('đổi tên (AC-05)', () => {
  it('trả productCount hiện tại', async () => {
    const v = ctx.categoryRepository.seed('Váy');
    ctx.categoryRepository.products.push(
      { category_id: v.id, deleted_at: null },
      { category_id: v.id, deleted_at: null },
    );
    const res = await api.rename(v.id, { name: 'Váy đầm' });
    expect(res.status).toBe(200);
    expect(res.body.data.category).toMatchObject({ name: 'Váy đầm', productCount: 2 });
  });
});

describe('xóa (AC-06, AC-07, AC-10)', () => {
  it('còn sản phẩm -> 409 CATEGORY_HAS_PRODUCTS kèm productCount, không xóa', async () => {
    const a = ctx.categoryRepository.seed('Áo thun');
    ctx.categoryRepository.products.push(
      { category_id: a.id, deleted_at: null },
      { category_id: a.id, deleted_at: null },
      { category_id: a.id, deleted_at: null },
    );
    const res = await api.remove(a.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_HAS_PRODUCTS');
    expect(res.body.error.details).toEqual({ productCount: 3 });
    expect(res.body.error.message).toContain('3 sản phẩm');
    expect(ctx.categoryRepository.rows[0].deleted_at).toBeNull();
  });

  it('chỉ còn sản phẩm đã xóa mềm -> 200; gọi lại -> 404', async () => {
    const a = ctx.categoryRepository.seed('Áo thun');
    ctx.categoryRepository.products.push({ category_id: a.id, deleted_at: 'x' });
    const res = await api.remove(a.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: a.id });
    expect((await api.remove(a.id)).status).toBe(404);
  });

  it.each([['abc'], ['123'], [ZERO_ID]])(
    'PATCH/DELETE id %s -> 404 NOT_FOUND, không phải 500',
    async (id) => {
      for (const res of [await api.rename(id, { name: 'Áo' }), await api.remove(id)]) {
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      }
    },
  );

  it('sửa danh mục đã xóa -> 404', async () => {
    const a = ctx.categoryRepository.seed('Áo thun');
    await api.remove(a.id);
    expect((await api.rename(a.id, { name: 'Áo khác' })).status).toBe(404);
  });
});
