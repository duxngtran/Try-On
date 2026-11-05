import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { generateFixtures } from '../scripts/generate-fixtures.js';
import { createTestApp } from './helpers/authTestKit.js';

const ZERO_ID = '00000000-0000-4000-8000-000000000000';
let ctx;
let admin;
let files;
let category;
let logged;
const load = (name) => readFile(files[name]);

beforeAll(async () => {
  files = await generateFixtures(await mkdtemp(path.join(tmpdir(), 'prod-')));
}, 60000);

async function tokenFor(role, email) {
  const user = await ctx.userRepository.create({
    email,
    passwordHash: '$2b$04$' + 'a'.repeat(53),
    role,
  });
  const token = jwt.sign({ role }, ctx.env.JWT_SECRET, { algorithm: 'HS256', subject: user.id });
  return { Authorization: `Bearer ${token}` };
}

const jpeg = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: '#aa5533' } })
    .jpeg()
    .toBuffer();

/** POST multipart. `fields` = chữ, `image` = Buffer | null. */
const create = (fields, image, auth = admin) => {
  const req = request(ctx.app).post('/api/admin/products').set(auth);
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  if (image) req.attach('image', image, { filename: 'a.jpg', contentType: 'image/jpeg' });
  return req;
};
const patch = (id, fields, image, auth = admin) => {
  const req = request(ctx.app).patch(`/api/admin/products/${id}`).set(auth);
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  if (image) req.attach('image', image, { filename: 'b.jpg', contentType: 'image/jpeg' });
  return req;
};
const valid = () => ({ name: 'Áo thun trắng', priceVnd: '199000', categoryId: category.id });
const stored = () => [...ctx.productSupabase.objects.keys()];

/** Dựng sản phẩm có sẵn ảnh trong Storage giả. */
function seedProduct(overrides = {}) {
  const row = ctx.productRepository.seed({ categoryId: category.id, ...overrides });
  ctx.productSupabase.objects.set(row.image_path, { body: Buffer.from('old') });
  return row;
}

beforeEach(async () => {
  logged = [];
  ctx = await createTestApp({}, { logger: { error: (...args) => logged.push(args) } });
  admin = await tokenFor('admin', 'admin@example.com');
  category = ctx.categoryRepository.seed('Áo thun');
});

describe('phân quyền (AC-12)', () => {
  it('không token -> 401, role user -> 403 trên mọi endpoint; không tạo sản phẩm, không có file', async () => {
    const user = await tokenFor('user', 'u@example.com');
    const image = await jpeg(600, 600);
    const calls = (auth) => {
      const set = (r) => (auth ? r.set(auth) : r);
      return [
        set(request(ctx.app).get('/api/admin/products')),
        set(request(ctx.app).get(`/api/admin/products/${ZERO_ID}`)),
        set(
          request(ctx.app)
            .post('/api/admin/products')
            .field('name', 'Áo')
            .attach('image', image, 'a.jpg'),
        ),
        set(request(ctx.app).patch(`/api/admin/products/${ZERO_ID}`).field('name', 'Áo')),
        set(request(ctx.app).delete(`/api/admin/products/${ZERO_ID}`)),
      ];
    };
    for (const res of await Promise.all(calls(null))) expect(res.status).toBe(401);
    for (const res of await Promise.all(calls(user))) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(ctx.productRepository.rows).toHaveLength(0);
    expect(ctx.productSupabase.state.uploads).toEqual([]);
  });

  it('user thường gọi id sai định dạng vẫn nhận 403, không lộ 404', async () => {
    const user = await tokenFor('user', 'u@example.com');
    const res = await request(ctx.app).delete('/api/admin/products/abc').set(user);
    expect(res.status).toBe(403);
  });
});

describe('thêm sản phẩm (AC-01, AC-02)', () => {
  it('201: giá là number, version 1, URL công khai, file JPEG ở đúng đường dẫn với cacheControl 7 ngày', async () => {
    const res = await create(valid(), await load('product-800x800-gps.jpg'));
    expect(res.status).toBe(201);
    const p = res.body.data.product;
    expect(p).toMatchObject({
      name: 'Áo thun trắng',
      priceVnd: 199000,
      category: { id: category.id, name: 'Áo thun' },
      image: { version: 1 },
    });
    expect(p.createdAt).toMatch(/\.\d{3}Z$/);
    const [path] = stored();
    expect(path).toMatch(new RegExp(`^${p.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(p.image.url.endsWith(path)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('image_path');
    const object = ctx.productSupabase.objects.get(path);
    expect(object.cacheControl).toBe('604800');
    expect(object.contentType).toBe('image/jpeg');
    expect((await sharp(object.body).metadata()).exif).toBeUndefined(); // GPS đã bị xóa
  });

  it('chuẩn hóa tên (NFC, gộp khoảng trắng) và nhận giá biên 1000 / 100000000', async () => {
    const a = await create(
      { ...valid(), name: '  Áo   dài ', priceVnd: '1000' },
      await jpeg(600, 600),
    );
    expect(a.body.data.product.name).toBe('Áo dài');
    const b = await create({ ...valid(), priceVnd: '100000000' }, await jpeg(600, 600));
    expect(b.status).toBe(201);
  });

  it('ảnh 512x512 và 512x1536 được nhận (AC-03)', async () => {
    expect((await create(valid(), await load('product-512x512.jpg'))).status).toBe(201);
    expect((await create(valid(), await load('product-512x1536.jpg'))).status).toBe(201);
  });
});

describe('thêm sản phẩm: từ chối, không để lại file (AC-03, AC-04, AC-05)', () => {
  it.each([
    ['không có ảnh', null, 400, 'FILE_REQUIRED'],
    ['.exe đổi đuôi .jpg', 'fake-exe.jpg', 400, 'INVALID_FILE_TYPE'],
    ['file hỏng', 'corrupt.jpg', 400, 'INVALID_IMAGE'],
    ['400x800', 'too-small-400x800.jpg', 400, 'IMAGE_TOO_SMALL'],
    ['600x9000', 'too-long-edge-600x9000.jpg', 400, 'IMAGE_TOO_LARGE'],
    ['600x2000', 'product-600x2000.jpg', 400, 'INVALID_ASPECT_RATIO'],
  ])('%s -> %i %s', async (_label, fixture, status, code) => {
    const res = await create(valid(), fixture ? await load(fixture) : null);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(ctx.productRepository.rows).toHaveLength(0);
    expect(stored()).toEqual([]);
  });

  it('ảnh vượt giới hạn dung lượng -> 413 FILE_TOO_LARGE, ưu tiên cao hơn mọi lỗi khác', async () => {
    ctx = await createTestApp({ PRODUCT_IMAGE_MAX_MB: 1 });
    admin = await tokenFor('admin', 'a2@example.com');
    category = ctx.categoryRepository.seed('Áo');
    const big = Buffer.concat([await jpeg(600, 600), Buffer.alloc(1024 * 1024 + 10)]);
    const res = await create({ name: 'x', priceVnd: 'abc', categoryId: 'abc' }, big);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(res.body.error.message).toBe('Ảnh tối đa 1 MB.');
  });

  it.each([
    ['giá 999', { priceVnd: '999' }],
    ['giá 100000001', { priceVnd: '100000001' }],
    ['giá 199.5', { priceVnd: '199.5' }],
    ['giá -1000', { priceVnd: '-1000' }],
    ['giá abc', { priceVnd: 'abc' }],
    ['tên 1 ký tự', { name: 'a' }],
    ['tên 121 ký tự', { name: 'x'.repeat(121) }],
    ['categoryId không phải UUID', { categoryId: 'abc' }],
  ])(
    '%s -> 400 VALIDATION_ERROR, details đúng trường, không gọi upload',
    async (_l, patchFields) => {
      const res = await create({ ...valid(), ...patchFields }, await jpeg(600, 600));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const [field] = Object.keys(patchFields);
      expect(res.body.error.details.map((d) => d.field)).toEqual([field]);
      expect(ctx.productSupabase.state.uploads).toEqual([]);
    },
  );

  it('lỗi trường ưu tiên hơn ảnh sai: tên sai + ảnh hỏng -> VALIDATION_ERROR', async () => {
    const res = await create({ ...valid(), name: 'a' }, await load('corrupt.jpg'));
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('danh mục không tồn tại/đã xóa -> CATEGORY_NOT_FOUND và không xử lý ảnh (kể cả ảnh hỏng)', async () => {
    const gone = ctx.categoryRepository.seed('Cũ');
    gone.deleted_at = 'x';
    for (const categoryId of [ZERO_ID, gone.id]) {
      const res = await create({ ...valid(), categoryId }, await load('corrupt.jpg'));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
    }
    expect(ctx.productSupabase.state.uploads).toEqual([]);
  });

  it('không phải multipart / nhiều hơn 3 field chữ / field chữ > 1 KB / nhiều file / sai tên field -> 400', async () => {
    const json = await request(ctx.app).post('/api/admin/products').set(admin).send(valid());
    expect(json.status).toBe(400);
    expect(json.body.error.code).toBe('VALIDATION_ERROR');

    const many = await create({ ...valid(), extra: '1' }, await jpeg(600, 600));
    expect(many.status).toBe(400);
    const long = await create({ ...valid(), name: 'x'.repeat(1025) }, await jpeg(600, 600));
    expect(long.status).toBe(400);
    const image = await jpeg(600, 600);
    const twoFiles = await request(ctx.app)
      .post('/api/admin/products')
      .set(admin)
      .field('name', 'Áo')
      .attach('image', image, 'a.jpg')
      .attach('image', image, 'b.jpg');
    expect(twoFiles.status).toBe(400);
    const wrongField = await request(ctx.app)
      .post('/api/admin/products')
      .set(admin)
      .field('name', 'Áo')
      .attach('photo', image, 'a.jpg');
    expect(wrongField.status).toBe(400);
    expect(ctx.productSupabase.state.uploads).toEqual([]);
  });
});

describe('thêm sản phẩm: lỗi hạ tầng không để lại file mồ côi (E14, E15)', () => {
  it('Storage lỗi -> 500 UPLOAD_FAILED, không có sản phẩm', async () => {
    ctx.productSupabase.state.failUpload = true;
    const res = await create(valid(), await jpeg(600, 600));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('UPLOAD_FAILED');
    expect(ctx.productRepository.rows).toHaveLength(0);
  });

  it('ghi DB lỗi -> 500 INTERNAL_ERROR, file mới bị xóa, không lộ chi tiết', async () => {
    ctx.productRepository.failNextCreate = true;
    const res = await create(valid(), await jpeg(600, 600));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('db down');
    expect(stored()).toEqual([]);
    expect(ctx.productRepository.rows).toHaveLength(0);
  });

  it('danh mục bị xóa sau lần kiểm tra sớm (race) -> 400 CATEGORY_NOT_FOUND, file mới bị xóa', async () => {
    ctx.productRepository.categoryDeletedBeforeWrite = true;
    const res = await create(valid(), await jpeg(600, 600));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(stored()).toEqual([]);
    expect(ctx.productRepository.rows).toHaveLength(0);
  });

  it('xóa file mới lỗi cả 2 lần -> vẫn trả lỗi gốc, log ORPHAN_PRODUCT_IMAGE chỉ kèm productId', async () => {
    ctx.productRepository.failNextCreate = true;
    ctx.productSupabase.state.removeFailures = 2;
    const res = await create(valid(), await jpeg(600, 600));
    expect(res.status).toBe(500);
    const orphan = logged.find(([msg]) => msg === 'ORPHAN_PRODUCT_IMAGE');
    expect(orphan).toBeTruthy();
    expect(Object.keys(orphan[1])).toEqual(['productId']);
  });
});

describe('sửa sản phẩm (AC-06 -> AC-09, AC-14)', () => {
  it('AC-06: chỉ đổi giá -> tên, danh mục, URL ảnh, version không đổi; không upload', async () => {
    const row = seedProduct();
    const before = (await request(ctx.app).get(`/api/admin/products/${row.id}`).set(admin)).body
      .data.product;
    const res = await patch(row.id, { priceVnd: '249000' });
    expect(res.status).toBe(200);
    const p = res.body.data.product;
    expect(p.priceVnd).toBe(249000);
    expect([p.name, p.category.id, p.image]).toEqual([
      before.name,
      before.category.id,
      before.image,
    ]);
    expect(ctx.productSupabase.state.uploads).toEqual([]);
  });

  it('AC-07: đổi tên + ảnh mới -> version 2, URL mới, đúng file cũ bị xóa', async () => {
    const row = seedProduct();
    const oldPath = row.image_path;
    const res = await patch(row.id, { name: 'Tên mới' }, await load('product-800x800.webp'));
    expect(res.status).toBe(200);
    const p = res.body.data.product;
    expect(p).toMatchObject({ name: 'Tên mới', image: { version: 2 } });
    expect(p.image.url).not.toContain(oldPath);
    expect(stored()).toHaveLength(1);
    expect(ctx.productSupabase.state.removed).toEqual([oldPath]);
  });

  it('chuyển sang danh mục khác không đổi image.version', async () => {
    const row = seedProduct();
    const other = ctx.categoryRepository.seed('Váy');
    const res = await patch(row.id, { categoryId: other.id });
    expect(res.body.data.product).toMatchObject({
      category: { id: other.id, name: 'Váy' },
      image: { version: 1 },
    });
  });

  it('AC-08: tên mới kèm ảnh sai quy tắc -> 400, sản phẩm và ảnh cũ không đổi, không upload', async () => {
    const row = seedProduct();
    const res = await patch(row.id, { name: 'Tên mới' }, await load('product-600x2000.jpg'));
    expect(res.body.error.code).toBe('INVALID_ASPECT_RATIO');
    expect(ctx.productRepository.rows[0].name).toBe('Áo thun trắng');
    expect(stored()).toEqual([row.image_path]);
    expect(ctx.productSupabase.state.uploads).toEqual([]);
  });

  it('AC-08: Storage lỗi -> 500 UPLOAD_FAILED, sản phẩm giữ nguyên', async () => {
    const row = seedProduct();
    ctx.productSupabase.state.failUpload = true;
    const res = await patch(row.id, { name: 'Tên mới' }, await jpeg(600, 600));
    expect(res.body.error.code).toBe('UPLOAD_FAILED');
    expect(ctx.productRepository.rows[0]).toMatchObject({
      name: 'Áo thun trắng',
      image_version: 1,
    });
    expect(stored()).toEqual([row.image_path]);
  });

  it('AC-08: ghi DB lỗi -> 500, file mới bị xóa, ảnh cũ và tên không đổi', async () => {
    const row = seedProduct();
    ctx.productRepository.failNextUpdate = true;
    const res = await patch(row.id, { name: 'Tên mới' }, await jpeg(600, 600));
    expect(res.status).toBe(500);
    expect(stored()).toEqual([row.image_path]);
    expect(ctx.productRepository.rows[0].name).toBe('Áo thun trắng');
  });

  it('danh mục mới bị xóa đúng lúc ghi -> 400 CATEGORY_NOT_FOUND, file mới bị xóa', async () => {
    const row = seedProduct();
    const other = ctx.categoryRepository.seed('Váy');
    ctx.productRepository.categoryDeletedBeforeWrite = true;
    const res = await patch(row.id, { categoryId: other.id }, await jpeg(600, 600));
    expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(stored()).toEqual([row.image_path]);
    expect(ctx.productRepository.rows[0].category_id).toBe(category.id);
  });

  it('sản phẩm bị xóa đúng lúc ghi -> 404 NOT_FOUND, file mới bị xóa', async () => {
    const row = seedProduct();
    ctx.productRepository.productDeletedBeforeWrite = true;
    const res = await patch(row.id, { name: 'Tên mới' }, await jpeg(600, 600));
    expect(res.status).toBe(404);
    expect(stored()).toEqual([row.image_path]);
  });

  it('xóa file cũ lỗi cả 2 lần -> vẫn 200, log ORPHAN_PRODUCT_IMAGE chỉ có productId; lỗi 1 lần thì thử lại, không log', async () => {
    const row = seedProduct();
    ctx.productSupabase.state.removeFailures = 1;
    expect((await patch(row.id, {}, await jpeg(600, 600))).status).toBe(200);
    expect(logged).toEqual([]);

    ctx.productSupabase.state.removeFailures = 2;
    const res = await patch(row.id, {}, await jpeg(600, 600));
    expect(res.status).toBe(200);
    expect(res.body.data.product.image.version).toBe(3);
    const orphan = logged.find(([msg]) => msg === 'ORPHAN_PRODUCT_IMAGE');
    expect(orphan[1]).toEqual({ productId: row.id });
  });

  it('AC-09: PATCH không có trường và không có ảnh -> 400 VALIDATION_ERROR', async () => {
    const row = seedProduct();
    const res = await patch(row.id, {});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('name rỗng là lỗi, không phải "giữ nguyên"', async () => {
    const row = seedProduct();
    const res = await patch(row.id, { name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('name');
  });

  it('sản phẩm đã xóa/không tồn tại -> 404 và không xử lý ảnh; thứ tự: 400 trường trước 404', async () => {
    const res = await patch(ZERO_ID, { name: 'Tên mới' }, await jpeg(600, 600));
    expect(res.status).toBe(404);
    expect(ctx.productSupabase.state.uploads).toEqual([]);
    expect((await patch(ZERO_ID, { name: 'x' })).status).toBe(400);
  });

  it('AC-14: id "abc" -> 404 NOT_FOUND (không phải 500) cho GET, PATCH, DELETE', async () => {
    const calls = [
      request(ctx.app).get('/api/admin/products/abc').set(admin),
      request(ctx.app).patch('/api/admin/products/abc').set(admin).field('name', 'Áo'),
      request(ctx.app).delete('/api/admin/products/abc').set(admin),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('xóa sản phẩm (AC-10)', () => {
  it('200; sau đó GET/PATCH/DELETE đều 404; dòng và file vẫn còn', async () => {
    const row = seedProduct();
    const del = await request(ctx.app).delete(`/api/admin/products/${row.id}`).set(admin);
    expect(del.status).toBe(200);
    expect(del.body.data).toEqual({ id: row.id });
    expect((await request(ctx.app).get(`/api/admin/products/${row.id}`).set(admin)).status).toBe(
      404,
    );
    expect((await patch(row.id, { name: 'Tên mới' })).status).toBe(404);
    expect((await request(ctx.app).delete(`/api/admin/products/${row.id}`).set(admin)).status).toBe(
      404,
    );
    expect(ctx.productRepository.rows).toHaveLength(1);
    expect(stored()).toEqual([row.image_path]);
    const list = await request(ctx.app).get('/api/admin/products').set(admin);
    expect(list.body.data.items).toEqual([]);
  });
});

describe('danh sách (AC-11)', () => {
  it('25 sản phẩm: trang 2 limit 20 có 5, total 25, không lặp, mới nhất trước; lọc danh mục', async () => {
    const other = ctx.categoryRepository.seed('Váy');
    for (let i = 0; i < 25; i += 1) {
      ctx.productRepository.seed({
        name: `SP ${String(i).padStart(2, '0')}`,
        categoryId: i % 8 === 0 ? other.id : category.id,
      });
    }
    const get = (qs) => request(ctx.app).get(`/api/admin/products${qs}`).set(admin);
    const p1 = (await get('?page=1&limit=20')).body.data;
    const p2 = (await get('?page=2&limit=20')).body.data;
    expect(p1.items).toHaveLength(20);
    expect(p2.items).toHaveLength(5);
    expect(p2.pagination).toEqual({ page: 2, limit: 20, total: 25, totalPages: 2 });
    expect(p1.items[0].name).toBe('SP 24');
    const names = [...p1.items, ...p2.items].map((p) => p.name);
    expect(new Set(names).size).toBe(25);
    expect(names).toEqual([...names].sort().reverse());

    const filtered = (await get(`?categoryId=${other.id}`)).body.data;
    expect(filtered.pagination.total).toBe(4);
    expect(filtered.items.every((p) => p.category.id === other.id)).toBe(true);

    const beyond = (await get('?page=9')).body.data;
    expect(beyond.items).toEqual([]);
    expect(beyond.pagination.total).toBe(25);
    expect((await get(`?categoryId=${ZERO_ID}`)).body.data.items).toEqual([]);
  });

  it.each([['?limit=101'], ['?page=0'], ['?categoryId=abc'], ['?limit=0'], ['?page=1.5']])(
    '%s -> 400 VALIDATION_ERROR',
    async (qs) => {
      const res = await request(ctx.app).get(`/api/admin/products${qs}`).set(admin);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );
});

describe('rate limit thêm/sửa (D-51)', () => {
  it('vượt hạn mức -> 429 có retryAfterSeconds + Retry-After; đếm cả request bị từ chối; DELETE không tính', async () => {
    ctx = await createTestApp({ PRODUCT_WRITES_PER_HOUR: 3 });
    admin = await tokenFor('admin', 'rl@example.com');
    category = ctx.categoryRepository.seed('Áo');
    const row = ctx.productRepository.seed({ categoryId: category.id });
    // 2 request bị từ chối (400) + 1 hợp lệ: cả ba đều được đếm.
    await create({ name: 'a' }, null);
    await create({ name: 'a' }, null);
    expect((await create(valid(), await jpeg(600, 600))).status).toBe(201);
    const limited = await create(valid(), await jpeg(600, 600));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect((await patch(row.id, { name: 'Tên mới' })).status).toBe(429);
    const del = await request(ctx.app).delete(`/api/admin/products/${row.id}`).set(admin);
    expect(del.status).toBe(200);
    expect(ctx.productSupabase.state.uploads).toHaveLength(1);
  });

  it('bộ đếm theo admin, không theo IP: admin khác không bị ảnh hưởng', async () => {
    ctx = await createTestApp({ PRODUCT_WRITES_PER_HOUR: 1 });
    const a = await tokenFor('admin', 'a@example.com');
    const b = await tokenFor('admin', 'b@example.com');
    await create({}, null, a);
    expect((await create({}, null, a)).status).toBe(429);
    expect((await create({}, null, b)).status).toBe(400);
  });
});

describe('không rò rỉ', () => {
  it('product DTO không có image_path, deleted_at; id sinh bằng UUID', async () => {
    const res = await create(valid(), await jpeg(600, 600));
    const keys = Object.keys(res.body.data.product).sort();
    expect(keys).toEqual(['category', 'createdAt', 'id', 'image', 'name', 'priceVnd', 'updatedAt']);
    expect(res.body.data.product.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
