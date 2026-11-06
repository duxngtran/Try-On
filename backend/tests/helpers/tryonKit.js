import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { generateFixtures } from '../../scripts/generate-fixtures.js';
import { createTestApp } from './authTestKit.js';

const PASSWORD = 'abc12345';

let fixturePromise;
/** JPEG toàn thân giả (có GPS) sinh bằng sharp. KHÔNG phải ảnh người. */
export function loadPhotoFixture() {
  fixturePromise ??= (async () => {
    const files = await generateFixtures(await mkdtemp(path.join(tmpdir(), 'tryon-')));
    return readFile(files['valid-1080x1920-gps.jpg']);
  })();
  return fixturePromise;
}

/** Logger ghi lại mọi dòng log để test AC-20. */
export function createLogSpy() {
  const lines = [];
  const make = (level) => (event, meta) => lines.push({ level, event, meta });
  return { lines, error: make('error'), warn: make('warn'), info: make('info') };
}

/**
 * Dựng app có phòng thử đồ (repository giả, adapter giả, đồng hồ điều khiển bằng tay) và các hàm thao tác.
 * @param {object} [envOverrides]
 * @param {{ delayMs?: number }} [options]
 */
export async function setupTryon(envOverrides = {}, { delayMs = 0 } = {}) {
  const photo = await loadPhotoFixture();
  const logs = createLogSpy();
  const ctx = await createTestApp(envOverrides, {
    tryon: true,
    tryonDelayMs: delayMs,
    logger: logs,
  });
  const { app, tryon } = ctx;
  let emailSeq = 0;

  /** Người mua đủ hồ sơ (consent ảnh, số đo, ảnh). `consent: true` thì đồng ý luôn việc gửi ảnh cho AI. */
  async function newBuyer({ consent = true, complete = true } = {}) {
    emailSeq += 1;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `buyer${emailSeq}@example.com`, password: PASSWORD });
    const { token, user } = res.body.data;
    const auth = { Authorization: `Bearer ${token}` };
    if (complete) {
      await request(app).post('/api/profile/photo-consent').set(auth).send({ accepted: true });
      await request(app)
        .put('/api/profile/measurements')
        .set(auth)
        .send({ heightCm: 165, weightKg: 52.5 });
      const up = await request(app)
        .put('/api/profile/photo')
        .set(auth)
        .attach('photo', photo, 'p.jpg');
      if (up.status !== 200) throw new Error(`upload ảnh hồ sơ lỗi ${up.status}`);
    }
    const buyer = {
      id: user.id,
      auth,
      get: (url) => request(app).get(url).set(auth),
      post: (url, body) => request(app).post(url).set(auth).send(body),
      del: (url) => request(app).delete(url).set(auth),
      state: () => buyer.get('/api/try-on/state'),
      acceptConsent: () => buyer.post('/api/try-on/consent', { accepted: true }),
      withdrawConsent: () => buyer.del('/api/try-on/consent'),
      result: (productId) => buyer.get(`/api/try-on/products/${productId}/result`),
      job: (productId, body = {}) => buyer.post(`/api/try-on/products/${productId}/jobs`, body),
      jobStatus: (jobId) => buyer.get(`/api/try-on/jobs/${jobId}`),
      replacePhoto: () =>
        request(app).put('/api/profile/photo').set(auth).attach('photo', photo, 'p2.jpg'),
      deletePhoto: () => buyer.del('/api/profile/photo'),
    };
    if (consent) await buyer.acceptConsent();
    return buyer;
  }

  async function newAdmin() {
    const admin = await ctx.userRepository.create({
      email: 'admin@example.com',
      passwordHash: `$2b$04$${'a'.repeat(53)}`,
      role: 'admin',
    });
    const token = jwt.sign({ role: 'admin' }, ctx.env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: admin.id,
    });
    const auth = { Authorization: `Bearer ${token}` };
    return {
      id: admin.id,
      auth,
      get: (url) => request(app).get(url).set(auth),
      post: (url, body) => request(app).post(url).set(auth).send(body),
      del: (url) => request(app).delete(url).set(auth),
    };
  }

  const category = (name = 'Áo thun') => ctx.categoryRepository.seed(name);
  // categoryRepository đếm sản phẩm qua danh sách riêng của nó (như products ở DB thật): dùng chung một hàng.
  const product = (name, categoryId) => {
    const row = ctx.productRepository.seed({ name, categoryId });
    ctx.categoryRepository.products.push(row);
    return row;
  };

  /** Chạy worker tới khi không còn job đang chạy; mỗi vòng tiến đồng hồ để tới lượt poll/thử lại. */
  async function drain({ stepMs = 2100, maxTicks = 40 } = {}) {
    for (let i = 0; i < maxTicks; i += 1) {
      await tryon.worker.tick();
      if (!tryon.repository.jobs.some((j) => j.status === 'queued' || j.status === 'running')) {
        return;
      }
      tryon.clock.advance(stepMs);
    }
    throw new Error('worker không dừng sau số vòng tối đa');
  }

  /** Mọi object đang có trong bucket try-on giả. */
  const tryonObjects = () => [...tryon.supabase.objects.keys()];
  const jobsOf = (userId) => tryon.repository.jobs.filter((j) => j.user_id === userId);

  return {
    ctx,
    app,
    tryon,
    logs,
    photo,
    newBuyer,
    newAdmin,
    category,
    product,
    drain,
    tryonObjects,
    jobsOf,
  };
}
