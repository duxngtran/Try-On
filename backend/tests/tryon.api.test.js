import { describe, it, expect } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { decodeCursor } from '../src/validation/tryonSchemas.js';
import { setupTryon } from './helpers/tryonKit.js';

const UUID = '3b241101-e2bb-4255-8caf-4136c566a962';

describe('xác thực, phân quyền, id sai (AC-21)', () => {
  const endpoints = (id = UUID) => [
    ['get', '/api/try-on/state'],
    ['post', '/api/try-on/consent'],
    ['delete', '/api/try-on/consent'],
    ['get', '/api/try-on/categories'],
    ['get', `/api/try-on/categories/${id}/products`],
    ['get', `/api/try-on/products/${id}/result`],
    ['post', `/api/try-on/products/${id}/jobs`],
    ['get', `/api/try-on/jobs/${id}`],
  ];

  it('không token -> 401; admin -> 403; không endpoint nào chạm DB trước khi qua cổng', async () => {
    const kit = await setupTryon();
    const admin = await kit.newAdmin();
    for (const [method, url] of endpoints()) {
      const anon = await request(kit.app)[method](url).send({ accepted: true });
      expect([method, url, anon.status]).toEqual([method, url, 401]);
      const res = await request(kit.app)[method](url).set(admin.auth).send({ accepted: true });
      expect([method, url, res.status, res.body.error.code]).toEqual([
        method,
        url,
        403,
        'FORBIDDEN',
      ]);
    }
    expect(kit.tryon.repository.calls).toEqual([]);
  });

  it('id sai định dạng -> 404 NOT_FOUND (không phải 500), không gọi DB', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    kit.tryon.repository.calls.length = 0;
    for (const [method, url] of endpoints('abc').filter(([, u]) => /abc/.test(u))) {
      const res = await request(kit.app)[method](url).set(buyer.auth).send({});
      expect([method, url, res.status, res.body.error.code]).toEqual([
        method,
        url,
        404,
        'NOT_FOUND',
      ]);
    }
    expect(kit.tryon.repository.calls).toEqual([]);
  });
});

describe('điều kiện sinh ảnh (AC-01, AC-02, D-71)', () => {
  it('hồ sơ chưa đủ -> 409 PROFILE_INCOMPLETE kèm phần thiếu; dịch vụ không được gọi', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer({ complete: false });
    const p = kit.product('Áo', kit.category().id);

    const state = (await buyer.state()).body.data;
    expect(state.profile).toEqual({ completed: false, missing: ['photo', 'measurements'] });

    for (const res of [await buyer.job(p.id), await buyer.result(p.id)]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PROFILE_INCOMPLETE');
      expect(res.body.error.details.missing).toEqual(['photo', 'measurements']);
    }
    expect(kit.tryon.provider.calls).toHaveLength(0);
    expect(kit.tryon.repository.jobs).toHaveLength(0);
  });

  it('chưa consent hoặc consent lỗi thời -> 403 TRYON_CONSENT_REQUIRED; ảnh hồ sơ không bị xóa', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer({ consent: false });
    const p = kit.product('Áo', kit.category().id);

    const check = async () => {
      for (const res of [await buyer.job(p.id), await buyer.result(p.id)]) {
        expect([res.status, res.body.error.code]).toEqual([403, 'TRYON_CONSENT_REQUIRED']);
      }
    };
    await check();
    expect((await buyer.state()).body.data.consent.accepted).toBe(false);

    // Đã đồng ý bản cũ (D-93): phiên bản lệch thì không có hiệu lực.
    await buyer.acceptConsent();
    kit.ctx.profileRepository.rows.get(buyer.id).tryon_consent_version = 99;
    const state = (await buyer.state()).body.data;
    expect([state.consent.accepted, state.consent.requiredVersion]).toEqual([false, 1]);
    await check();

    expect(kit.tryon.provider.calls).toHaveLength(0);
    const profile = await request(kit.app).get('/api/profile').set(buyer.auth);
    expect(profile.body.data.profile.photo).not.toBeNull();
  });

  it('POST consent: accepted khác true hoặc thiếu -> 400; đồng ý lặp lại giữ nguyên thời điểm; rút là idempotent', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer({ consent: false });
    for (const body of [{ accepted: false }, {}, { accepted: 'true' }, { accepted: 1 }]) {
      expect((await buyer.post('/api/try-on/consent', body)).status).toBe(400);
    }
    const first = (await buyer.acceptConsent()).body.data.consent;
    expect(first.accepted).toBe(true);
    const again = (await buyer.acceptConsent()).body.data.consent;
    expect(again.acceptedAt).toBe(first.acceptedAt);

    const w1 = await buyer.withdrawConsent();
    const w2 = await buyer.withdrawConsent();
    expect([w1.status, w2.status]).toEqual([200, 200]);
    expect(w2.body.data.consent.accepted).toBe(false);
    expect(w2.body.data.consent.withdrawnAt).not.toBeNull();
  });
});

describe('luồng chính: consent -> job -> worker -> ảnh (AC-03, AC-04, AC-19, AC-20)', () => {
  it('tạo job 202, worker xử lý, ảnh có signed URL, tính 1 lượt; xem lại không gọi dịch vụ', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('Áo thun trắng', kit.category().id);

    const created = await buyer.job(p.id);
    expect(created.status).toBe(202);
    expect(created.body.data).toEqual({
      state: 'pending',
      job: { id: expect.any(String), status: 'queued' },
    });
    const jobId = created.body.data.job.id;
    expect((await buyer.result(p.id)).body.data.state).toBe('pending');

    await kit.drain();

    const job = (await buyer.jobStatus(jobId)).body.data.job;
    expect(job).toMatchObject({
      id: jobId,
      productId: p.id,
      purpose: 'display',
      status: 'succeeded',
    });
    expect(job.createdAt).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
    expect(job.image).toEqual({
      url: expect.stringContaining('token='),
      expiresAt: expect.stringMatching(/Z$/),
      width: 864,
      height: 1296,
    });
    expect(job.error).toBeNull();
    expect((await buyer.state()).body.data.quota).toMatchObject({
      dailyUsed: 1,
      monthlyUsed: 1,
      held: 0,
    });

    const callsBefore = kit.tryon.provider.calls.length;
    const again = await buyer.job(p.id);
    expect(again.status).toBe(200);
    expect(again.body.data.state).toBe('ready');
    expect((await buyer.result(p.id)).body.data.image.width).toBe(864);
    expect(kit.tryon.provider.calls).toHaveLength(callsBefore);
    expect((await buyer.state()).body.data.quota.dailyUsed).toBe(1);
  });

  it('dữ liệu gửi đi chỉ có ảnh người và URL ảnh sản phẩm; ảnh lưu không còn metadata (AC-19)', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('Áo', kit.category().id);
    await buyer.job(p.id);
    await kit.drain();

    expect(kit.tryon.provider.calls).toHaveLength(1);
    const [call] = kit.tryon.provider.calls;
    expect(Object.keys(call).sort()).toEqual(['garmentImageUrl', 'modelImage']);
    const sent = await sharp(call.modelImage).metadata();
    expect(sent.format).toBe('jpeg');
    expect(sent.exif).toBeUndefined(); // ảnh hồ sơ gốc có GPS
    expect(Math.max(sent.width, sent.height)).toBeLessThanOrEqual(1536);
    expect(call.garmentImageUrl).toContain(p.id);

    const [stored] = kit.tryon.supabase.objects.values();
    expect((await sharp(stored.body).metadata()).exif).toBeUndefined(); // fake provider CÓ ghi EXIF
    expect(stored.contentType).toBe('image/jpeg');
  });

  it('log không chứa ảnh, base64, URL, đường dẫn, số đo (AC-20)', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const ok = kit.product('Áo', kit.category().id);
    const blocked = kit.product('FAKE-BLOCKED áo', kit.category('Quần').id);
    const broken = kit.product('FAKE-INPUT áo', kit.category('Váy').id);
    for (const p of [ok, blocked, broken]) await buyer.job(p.id);
    await kit.drain();

    const everything = JSON.stringify(kit.logs.lines);
    expect(kit.logs.lines.length).toBeGreaterThan(0);
    const paths = [...kit.tryon.supabase.objects.keys(), ...kit.ctx.supabase.objects.keys()];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(everything).not.toContain(path);
    expect(everything).not.toMatch(/data:image|base64|token=|https?:|\.jpg|165|52\.5|@example/i);
  });
});

describe('không sinh trùng, hết lượt, hết ngân sách (AC-06, AC-17)', () => {
  it('hai tab cùng yêu cầu một khóa: một job, dịch vụ gọi 1 lần, tính 1 lượt', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('Áo', kit.category().id);

    const [a, b, c] = await Promise.all([buyer.job(p.id), buyer.job(p.id), buyer.job(p.id)]);
    expect(new Set([a, b, c].map((r) => r.body.data.job.id)).size).toBe(1);
    expect([a, b, c].map((r) => r.status)).toEqual([202, 202, 202]);
    await kit.drain();

    expect(kit.tryon.provider.calls).toHaveLength(1);
    expect(kit.jobsOf(buyer.id)).toHaveLength(1);
    expect((await buyer.state()).body.data.quota.dailyUsed).toBe(1);
  });

  it('hết lượt ngày: 429 có retryAfterSeconds, resetsAt, header Retry-After; ảnh đã có vẫn xem được', async () => {
    const kit = await setupTryon({ TRYON_DAILY_LIMIT: 2, TRYON_PREFETCH_MIN_REMAINING: 0 });
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const [p1, p2, p3] = ['A', 'B', 'C'].map((n) => kit.product(n, cat.id));
    await buyer.job(p1.id);
    await buyer.job(p2.id);
    await kit.drain();
    const calls = kit.tryon.provider.calls.length;

    const res = await buyer.job(p3.id);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TRYON_QUOTA_EXCEEDED');
    expect(res.body.error.details).toMatchObject({
      scope: 'day',
      retryAfterSeconds: expect.any(Number),
      resetsAt: expect.stringMatching(/Z$/),
    });
    expect(Number(res.headers['retry-after'])).toBe(res.body.error.details.retryAfterSeconds);
    expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.body.error.details.retryAfterSeconds).toBeLessThanOrEqual(86400);
    expect((await buyer.job(p1.id)).body.data.state).toBe('ready');
    expect((await buyer.result(p2.id)).body.data.state).toBe('ready');
    expect(kit.tryon.provider.calls).toHaveLength(calls);
    expect((await buyer.state()).body.data.quota.remaining).toBe(0);
  });

  it('hết lượt tháng: scope month', async () => {
    const kit = await setupTryon({ TRYON_DAILY_LIMIT: 5, TRYON_MONTHLY_LIMIT: 1 });
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    await buyer.job(kit.product('A', cat.id).id);
    await kit.drain();
    const res = await buyer.job(kit.product('B', cat.id).id);
    expect([res.status, res.body.error.details.scope]).toEqual([429, 'month']);
  });

  it('lượt cuối: hai yêu cầu đồng thời ở hai sản phẩm, chỉ một được sinh, bên kia nhận scope pending', async () => {
    const kit = await setupTryon({ TRYON_DAILY_LIMIT: 1 });
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const [a, b] = ['A', 'B'].map((n) => kit.product(n, cat.id));
    const results = await Promise.all([buyer.job(a.id), buyer.job(b.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([202, 429]);
    const rejected = results.find((r) => r.status === 429);
    expect(rejected.body.error.details).toMatchObject({
      scope: 'pending',
      retryAfterSeconds: 15,
      resetsAt: null,
    });
    await kit.drain();
    expect(kit.tryon.provider.calls).toHaveLength(1);
  });

  it('hết ngân sách hệ thống: 503 TRYON_UNAVAILABLE, không lộ số tiền, log TRYON_BUDGET_EXCEEDED, ảnh cũ vẫn xem được', async () => {
    // $0.15 = đúng 2 ảnh ở $0.075
    const kit = await setupTryon({ TRYON_MONTHLY_BUDGET_USD: 0.15 });
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const [a, b, c] = ['A', 'B', 'C'].map((n) => kit.product(n, cat.id));
    await buyer.job(a.id);
    await buyer.job(b.id);
    await kit.drain();
    const calls = kit.tryon.provider.calls.length;

    const res = await buyer.job(c.id);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('TRYON_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/\d\.\d|usd|\$|budget|ngân sách/i);
    expect(kit.logs.lines.some((l) => l.event === 'TRYON_BUDGET_EXCEEDED')).toBe(true);
    expect(kit.tryon.provider.calls).toHaveLength(calls);
    expect((await buyer.state()).body.data.generation.available).toBe(false);
    expect((await buyer.job(a.id)).body.data.state).toBe('ready');
  });

  it('cảnh báo 80% đúng một lần', async () => {
    // 4 ảnh = $0.30; ảnh thứ 3 chạm 75%, ảnh thứ 4 chạm 100% (>= 80%)
    const kit = await setupTryon({ TRYON_MONTHLY_BUDGET_USD: 0.3 });
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    for (const n of ['A', 'B', 'C', 'D']) await buyer.job(kit.product(n, cat.id).id);
    expect(kit.logs.lines.filter((l) => l.event === 'TRYON_BUDGET_WARNING')).toHaveLength(1);
  });

  it('tắt tính năng: không tạo job mới (503) nhưng ảnh đã có vẫn trả về', async () => {
    const kit = await setupTryon({ TRYON_ENABLED: false });
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const [withImage, without] = ['A', 'B'].map((n) => kit.product(n, cat.id));
    const pr = kit.ctx.profileRepository.rows.get(buyer.id);
    const path = `${buyer.id}/3b241101-e2bb-4255-8caf-4136c566a962.jpg`;
    kit.tryon.repository.images.push({
      user_id: buyer.id,
      product_id: withImage.id,
      photo_version: pr.photo_version,
      image_version: 1,
      storage_path: path,
      width: 864,
      height: 1296,
      model_name: kit.tryon.config.modelName,
      last_viewed_at: Date.now(),
    });

    const ready = await buyer.job(withImage.id);
    expect([ready.status, ready.body.data.state]).toEqual([200, 'ready']);
    const off = await buyer.job(without.id);
    expect([off.status, off.body.error.code]).toEqual([503, 'TRYON_UNAVAILABLE']);
    expect(kit.tryon.repository.jobs).toHaveLength(0);
    expect((await buyer.state()).body.data.generation).toEqual({
      available: false,
      prefetchAllowed: false,
    });
  });

  it('client gửi userId, version, url: bị bỏ qua, khóa do backend đọc từ DB', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const other = await kit.newBuyer();
    const p = kit.product('Áo', kit.category().id);
    const res = await buyer.job(p.id, {
      purpose: 'display',
      userId: other.id,
      photoVersion: 99,
      imageVersion: 99,
      url: 'https://evil.example/x.jpg',
    });
    expect(res.status).toBe(202);
    const [job] = kit.tryon.repository.jobs;
    const pr = kit.ctx.profileRepository.rows.get(buyer.id);
    expect([job.user_id, job.photo_version, job.image_version]).toEqual([
      buyer.id,
      pr.photo_version,
      1,
    ]);
  });
});

describe('lỗi của dịch vụ (AC-14, AC-15, AC-16)', () => {
  it('lỗi tạm thời lần đầu rồi thành công: tự thử lại, tính 1 lượt', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('FAKE-TRANSIENT-ONCE áo', kit.category().id);
    const { id } = (await buyer.job(p.id)).body.data.job;
    await kit.drain();
    expect((await buyer.jobStatus(id)).body.data.job.status).toBe('succeeded');
    expect(kit.tryon.provider.calls).toHaveLength(2);
    expect((await buyer.state()).body.data.quota.dailyUsed).toBe(1);
  });

  it('lỗi tạm thời cả hai lần: TRYON_FAILED, không tính lượt, trả giữ chỗ; Thử lại sinh job mới', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('FAKE-TRANSIENT áo', kit.category().id);
    const { id } = (await buyer.job(p.id)).body.data.job;
    await kit.drain();
    const job = (await buyer.jobStatus(id)).body.data.job;
    expect(job.status).toBe('failed');
    expect(job.error).toEqual({ code: 'TRYON_FAILED', message: expect.any(String) });
    expect(job.image).toBeNull();
    expect(kit.tryon.provider.calls).toHaveLength(2);
    expect(await buyer.state().then((r) => r.body.data.quota)).toMatchObject({
      dailyUsed: 0,
      held: 0,
    });
    expect(kit.tryon.repository.budget).toMatchObject({ spent: 0, reserved: 0 });

    const retry = await buyer.job(p.id);
    expect(retry.status).toBe(202);
    expect(retry.body.data.job.id).not.toBe(id);
  });

  it('timeout 120 giây: thử lại trước hạn gắn vào đúng job; sau hạn failed TRYON_TIMEOUT, tính ngân sách, không tính lượt', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('FAKE-HANG áo', kit.category().id);
    const { id } = (await buyer.job(p.id)).body.data.job;
    await kit.tryon.worker.tick();
    kit.tryon.clock.advance(61_000);
    const retry = await buyer.job(p.id); // mốc 60 giây là của FE; job vẫn chạy
    expect([retry.status, retry.body.data.job.id]).toEqual([202, id]);

    kit.tryon.clock.advance(60_000);
    await kit.tryon.worker.tick();
    const job = (await buyer.jobStatus(id)).body.data.job;
    expect([job.status, job.error.code]).toEqual(['failed', 'TRYON_TIMEOUT']);
    expect(kit.tryon.repository.jobs[0]).toMatchObject({ charged_at: null, cost_incurred: true });
    expect(kit.tryon.repository.budget).toMatchObject({ spent: 75000, reserved: 0 });
    expect(kit.tryon.provider.calls).toHaveLength(1);
  });

  it('bị chặn nội dung: ghi nhớ theo khóa, không gọi lại, không tính lượt; đổi ảnh hồ sơ thì được thử lại', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('FAKE-BLOCKED áo', kit.category().id);
    const { id } = (await buyer.job(p.id)).body.data.job;
    await kit.drain();
    expect((await buyer.jobStatus(id)).body.data.job.error.code).toBe('TRYON_BLOCKED');

    const again = await buyer.job(p.id);
    expect([again.status, again.body.data]).toEqual([
      200,
      { state: 'blocked', errorCode: 'TRYON_BLOCKED' },
    ]);
    expect((await buyer.result(p.id)).body.data).toEqual({
      state: 'blocked',
      errorCode: 'TRYON_BLOCKED',
    });
    expect(kit.tryon.provider.calls).toHaveLength(1);
    expect((await buyer.state()).body.data.quota.dailyUsed).toBe(0);

    expect((await buyer.replacePhoto()).status).toBe(200);
    expect((await buyer.job(p.id)).status).toBe(202);
  });

  it('ảnh không nhận ra tư thế: TRYON_PHOTO_UNUSABLE cũng được ghi nhớ (D-121)', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('FAKE-POSE áo', kit.category().id);
    await buyer.job(p.id);
    await kit.drain();
    expect((await buyer.job(p.id)).body.data).toEqual({
      state: 'blocked',
      errorCode: 'TRYON_PHOTO_UNUSABLE',
    });
  });

  it('hết credit: TRYON_UNAVAILABLE, worker tạm dừng, job mới bị từ chối 503 và không gọi dịch vụ', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const bad = kit.product('FAKE-NOCREDIT áo', cat.id);
    const other = kit.product('Áo thường', cat.id);
    const { id } = (await buyer.job(bad.id)).body.data.job;
    await kit.drain();
    expect((await buyer.jobStatus(id)).body.data.job.error.code).toBe('TRYON_UNAVAILABLE');
    expect(kit.logs.lines.some((l) => l.event === 'TRYON_PROVIDER_CONFIG_ERROR')).toBe(true);

    expect((await buyer.state()).body.data.generation.available).toBe(false);
    const res = await buyer.job(other.id);
    expect([res.status, res.body.error.code]).toEqual([503, 'TRYON_UNAVAILABLE']);
    expect(kit.tryon.provider.calls).toHaveLength(1);
  });
});

describe('kết quả về muộn bị bỏ (AC-11)', () => {
  const invalidations = {
    'rút consent': (kit, buyer) => buyer.withdrawConsent(),
    'thay ảnh hồ sơ': (kit, buyer) => buyer.replacePhoto(),
    'xóa ảnh hồ sơ': (kit, buyer) => buyer.deletePhoto(),
    'admin thay ảnh sản phẩm': (kit, buyer, p) =>
      kit.ctx.productRepository.update({
        id: p.id,
        newImagePath: `${p.id}/${crypto.randomUUID()}.jpg`,
      }),
    'admin xóa sản phẩm': (kit, buyer, p) => kit.ctx.productRepository.softDelete(p.id),
  };

  it.each(Object.keys(invalidations))(
    '%s lúc job đang chạy: không lưu, không có file trong bucket, vẫn tính lượt',
    async (name) => {
      const kit = await setupTryon({}, { delayMs: 60_000 });
      const buyer = await kit.newBuyer();
      const p = kit.product('Áo', kit.category().id);
      const { id } = (await buyer.job(p.id)).body.data.job;
      await kit.tryon.worker.tick(); // đã gửi cho dịch vụ
      expect(kit.tryon.repository.jobs[0].status).toBe('running');

      await invalidations[name](kit, buyer, p);
      kit.tryon.clock.advance(61_000);
      await kit.tryon.worker.tick(); // kết quả về
      await kit.tryon.cleanup.kick();

      expect(kit.tryon.repository.images).toHaveLength(0);
      expect(kit.tryonObjects()).toEqual([]);
      expect(kit.tryon.repository.deletions.size).toBe(0);
      const job = kit.tryon.repository.jobs[0];
      expect([job.status, job.charged_at !== null]).toEqual(['discarded', true]);
      expect(kit.tryon.provider.calls).toHaveLength(1);
      if (name !== 'rút consent' && name !== 'xóa ảnh hồ sơ' && name !== 'admin xóa sản phẩm') {
        const read = (await buyer.jobStatus(id)).body.data.job;
        expect([read.status, read.image]).toEqual(['discarded', null]);
      }
    },
  );

  it('hết hiệu lực đúng lúc đang upload: file đã lên được đưa vào hàng đợi và bị xóa', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const p = kit.product('Áo', kit.category().id);
    await buyer.job(p.id);
    await kit.tryon.worker.tick(); // gửi
    kit.tryon.clock.advance(2100);

    const bucket = kit.tryon.supabase.storage.from('x');
    const upload = bucket.upload;
    bucket.upload = async (...args) => {
      const result = await upload(...args);
      await kit.tryon.repository.withdrawConsent(buyer.id); // rút consent giữa upload và complete
      return result;
    };
    await kit.tryon.worker.tick(); // poll -> upload -> complete
    expect(kit.tryon.supabase.state.uploads).toHaveLength(1); // file đã thật sự lên bucket
    expect(kit.tryon.repository.jobs[0].status).toBe('discarded');
    await kit.tryon.cleanup.kick(); // chờ hàng đợi xóa chạy xong (worker cũng đã kick nền)
    expect(kit.tryonObjects()).toEqual([]);
    expect(kit.tryon.repository.deletions.size).toBe(0);
  });
});

describe('xóa ảnh khi ảnh gốc đổi (AC-08, AC-09, AC-10, AC-12, AC-13)', () => {
  async function withImage() {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const p = kit.product('Áo thun', cat.id);
    await buyer.job(p.id);
    await kit.drain();
    expect(kit.tryonObjects()).toHaveLength(1);
    return { kit, buyer, cat, p };
  }
  const settled = async (kit) => {
    await kit.tryon.cleanup.kick();
    return kit.tryonObjects();
  };

  it('thay ảnh hồ sơ: file cũ bị xóa, ảnh mới sinh lại khi xem và tính thêm 1 lượt (AC-08)', async () => {
    const { kit, buyer, p } = await withImage();
    expect((await buyer.replacePhoto()).status).toBe(200);
    expect(await settled(kit)).toEqual([]);
    expect((await buyer.result(p.id)).body.data.state).toBe('none');
    await buyer.job(p.id);
    await kit.drain();
    expect((await buyer.result(p.id)).body.data.state).toBe('ready');
    expect((await buyer.state()).body.data.quota.dailyUsed).toBe(2);
    expect(kit.tryonObjects()).toHaveLength(1);
  });

  it('xóa ảnh hồ sơ: mọi ảnh try-on bị xóa, /state báo thiếu ảnh (AC-09)', async () => {
    const { kit, buyer } = await withImage();
    expect((await buyer.deletePhoto()).status).toBe(200);
    expect(await settled(kit)).toEqual([]);
    expect((await buyer.state()).body.data.profile.missing).toEqual(['photo']);
  });

  it('rút consent: ảnh try-on bị xóa, ảnh hồ sơ còn, yêu cầu sau đó 403 (AC-10)', async () => {
    const { kit, buyer, p } = await withImage();
    expect((await buyer.withdrawConsent()).status).toBe(200);
    expect(await settled(kit)).toEqual([]);
    const profile = await request(kit.app).get('/api/profile').set(buyer.auth);
    expect(profile.body.data.profile.photo).not.toBeNull();
    expect((await buyer.job(p.id)).status).toBe(403);
    expect((await buyer.result(p.id)).status).toBe(403);
  });

  it('đổi tên, giá không đổi khóa; thay ảnh sản phẩm thì xóa ảnh try-on của mọi người (AC-12)', async () => {
    const { kit, buyer, p } = await withImage();
    await kit.ctx.productRepository.update({ id: p.id, name: 'Tên mới', priceVnd: 5000 });
    expect((await buyer.job(p.id)).body.data.state).toBe('ready');
    expect(kit.tryon.provider.calls).toHaveLength(1);

    await kit.ctx.productRepository.update({
      id: p.id,
      newImagePath: `${p.id}/${crypto.randomUUID()}.jpg`,
    });
    expect(await settled(kit)).toEqual([]);
    expect((await buyer.result(p.id)).body.data.state).toBe('none');
  });

  it('admin xóa sản phẩm qua API: ảnh try-on bị xóa, 404 cho người mua, danh mục ẩn (AC-13)', async () => {
    const { kit, buyer, p } = await withImage();
    const admin = await kit.newAdmin();
    expect((await admin.del(`/api/admin/products/${p.id}`)).status).toBe(200);
    expect(await settled(kit)).toEqual([]);
    for (const res of [await buyer.result(p.id), await buyer.job(p.id)]) {
      expect([res.status, res.body.error.code]).toEqual([404, 'NOT_FOUND']);
    }
    expect((await buyer.get('/api/try-on/categories')).body.data.categories).toEqual([]);
    expect(kit.ctx.productRepository.rows.find((r) => r.id === p.id)).toBeDefined(); // D-42
  });

  it('kick lỗi không làm hỏng request ở hồ sơ và sản phẩm (T-72)', async () => {
    const { kit, buyer, p } = await withImage();
    kit.tryon.cleanup.kick = () => {
      throw new Error('kick down');
    };
    const admin = await kit.newAdmin();
    expect((await buyer.replacePhoto()).status).toBe(200);
    expect((await buyer.deletePhoto()).status).toBe(200);
    expect((await admin.del(`/api/admin/products/${p.id}`)).status).toBe(200);
  });
});

describe('quyền xem: ảnh và job chỉ của chủ (AC-18)', () => {
  it('người khác nhận 404 như không tồn tại; admin 403; response không có đường dẫn, id nhà cung cấp', async () => {
    const kit = await setupTryon();
    const x = await kit.newBuyer();
    const y = await kit.newBuyer();
    const p = kit.product('Áo', kit.category().id);
    const { id } = (await x.job(p.id)).body.data.job;
    await kit.drain();

    const mine = await x.jobStatus(id);
    expect(mine.status).toBe(200);
    const theirs = await y.jobStatus(id);
    expect([theirs.status, theirs.body.error.code]).toEqual([404, 'NOT_FOUND']);
    expect((await y.result(p.id)).body.data.state).toBe('none'); // không thấy ảnh của x
    const admin = await kit.newAdmin();
    expect((await admin.get(`/api/try-on/jobs/${id}`)).status).toBe(403);

    const body = JSON.stringify([mine.body, (await x.result(p.id)).body]);
    expect(body).not.toMatch(
      /storage_path|storagePath|provider|fake-\d|photo_version|photoVersion/,
    );
  });
});

describe('job: trạng thái đặc biệt của GET /jobs/:id (api.md 6.3)', () => {
  it('job đang chạy nhưng đã hết hiệu lực trả discarded ngay; job succeeded mà ảnh bị xóa trả discarded, image null', async () => {
    const kit = await setupTryon({}, { delayMs: 60_000 });
    const buyer = await kit.newBuyer();
    const p = kit.product('Áo', kit.category().id);
    const { id } = (await buyer.job(p.id)).body.data.job;
    await kit.tryon.worker.tick();
    expect((await buyer.jobStatus(id)).body.data.job.status).toBe('running');
    await buyer.replacePhoto();
    expect((await buyer.jobStatus(id)).body.data.job.status).toBe('discarded');

    const p2 = kit.product('Áo 2', kit.category('Quần').id);
    const j2 = (await buyer.job(p2.id)).body.data.job.id;
    await kit.tryon.worker.tick(); // gửi
    kit.tryon.clock.advance(61_000);
    await kit.drain();
    expect((await buyer.jobStatus(j2)).body.data.job.status).toBe('succeeded');
    kit.tryon.repository.images.length = 0; // ảnh bị xóa sau đó
    const read = (await buyer.jobStatus(j2)).body.data.job;
    expect([read.status, read.image]).toEqual(['discarded', null]);
  });
});

describe('danh mục và sản phẩm (AC-05, AC-07, D-44, D-73)', () => {
  it('chỉ danh mục có sản phẩm chưa xóa; theo thứ tự tạo tăng dần; productCount đúng', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const full = kit.category('Áo');
    const onlyDeleted = kit.category('Quần');
    kit.category('Rỗng');
    const second = kit.category('Váy');
    kit.product('A', full.id);
    kit.product('B', full.id);
    kit.product('C', second.id);
    kit.product('X', onlyDeleted.id).deleted_at = 'x';

    const res = await buyer.get('/api/try-on/categories');
    expect(res.body.data.categories).toEqual([
      { id: full.id, name: 'Áo', productCount: 2 },
      { id: second.id, name: 'Váy', productCount: 1 },
    ]);
  });

  it('sản phẩm đầu tiên là mới nhất chưa xóa (P2, không phải P3 đã xóa); không có createdAt, image_path', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    kit.product('P1', cat.id);
    kit.product('P2', cat.id);
    const p3 = kit.product('P3', cat.id);
    p3.deleted_at = 'x';

    const res = await buyer.get(`/api/try-on/categories/${cat.id}/products`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i) => i.name)).toEqual(['P2', 'P1']);
    expect(res.body.data.items[0]).toEqual({
      id: expect.any(String),
      name: 'P2',
      priceVnd: 199000,
      category: { id: cat.id, name: 'Áo thun' },
      image: {
        url: expect.stringMatching(/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/),
        version: 1,
      },
      position: 1,
    });
    expect(res.body.data.total).toBe(2);
    expect(JSON.stringify(res.body)).not.toMatch(/createdAt|created_at|image_path|imagePath/);
  });

  it('danh mục hết sản phẩm: 200 rỗng, không sinh ảnh; không tồn tại hoặc đã xóa: 404', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const empty = kit.category('Rỗng');
    const res = await buyer.get(`/api/try-on/categories/${empty.id}/products`);
    expect([res.status, res.body.data]).toEqual([
      200,
      { items: [], total: 0, prevCursor: null, nextCursor: null },
    ]);
    const gone = kit.category('Đã xóa');
    gone.deleted_at = 'x';
    for (const id of [gone.id, UUID]) {
      const r = await buyer.get(`/api/try-on/categories/${id}/products`);
      expect([r.status, r.body.error.code]).toEqual([404, 'NOT_FOUND']);
    }
    expect(kit.tryon.repository.jobs).toHaveLength(0);
  });

  describe('con trỏ', () => {
    async function fiveProducts() {
      const kit = await setupTryon();
      const buyer = await kit.newBuyer();
      const cat = kit.category();
      const names = ['p1', 'p2', 'p3', 'p4', 'p5'];
      const rows = names.map((n) => kit.product(n, cat.id));
      const url = (query = '') => `/api/try-on/categories/${cat.id}/products${query}`;
      const page = async (query) => (await buyer.get(url(query))).body.data;
      return { kit, buyer, cat, rows, url, page };
    }
    const names = (data) => data.items.map((i) => i.name);

    it('đi qua hai chiều không lặp, không sót; position và total đúng', async () => {
      const { page } = await fiveProducts();
      const first = await page('?limit=2');
      expect([names(first), first.total, first.prevCursor]).toEqual([['p5', 'p4'], 5, null]);
      expect(first.items.map((i) => i.position)).toEqual([1, 2]);

      const second = await page(`?limit=2&after=${first.nextCursor}`);
      expect(names(second)).toEqual(['p3', 'p2']);
      const third = await page(`?limit=2&after=${second.nextCursor}`);
      expect([names(third), third.nextCursor]).toEqual([['p1'], null]);

      const back = await page(`?limit=2&before=${third.prevCursor}`);
      expect(names(back)).toEqual(['p3', 'p2']); // vẫn theo thứ tự giảm dần
      const backAgain = await page(`?limit=2&before=${back.prevCursor}`);
      expect([names(backAgain), backAgain.prevCursor]).toEqual([['p5', 'p4'], null]);
    });

    it('con trỏ giữ nguyên chuỗi created_at (micro giây), không qua Date', async () => {
      const { page, rows } = await fiveProducts();
      const first = await page('?limit=2');
      const cursor = decodeCursor(first.nextCursor);
      const p4 = rows[3];
      expect(cursor.id).toBe(p4.id);
      // Fake lưu `...456123+00:00`; chuỗi này phải còn nguyên 6 chữ số, không bị làm tròn về mili giây.
      expect(cursor.createdAt.replace(' ', 'T').replace('+00', '+00:00')).toBe(p4.created_at);
      expect(cursor.createdAt).toMatch(/\.\d{6}\+00$/);
    });

    it('`at`: bắt đầu từ sản phẩm đó; đã xóa thì từ sản phẩm kế tiếp; khác danh mục thì trang đầu', async () => {
      const { kit, rows, page } = await fiveProducts();
      const at = await page(`?at=${rows[2].id}&limit=2`);
      expect([names(at), at.anchor]).toEqual([['p3', 'p2'], { found: true, deleted: false }]);

      rows[2].deleted_at = 'x';
      const gone = await page(`?at=${rows[2].id}&limit=2`);
      expect([names(gone), gone.anchor]).toEqual([['p2', 'p1'], { found: true, deleted: true }]);

      const other = kit.product('khac', kit.category('Quần').id);
      const foreign = await page(`?at=${other.id}&limit=2`);
      expect([names(foreign), foreign.anchor]).toEqual([
        ['p5', 'p4'],
        { found: false, deleted: false },
      ]);
    });

    it('tham số sai -> 400 VALIDATION_ERROR (con trỏ hỏng, limit, nhiều hơn một vị trí)', async () => {
      const { buyer, url, rows, page } = await fiveProducts();
      const cursor = (await page('?limit=1')).nextCursor;
      const bad = [
        '?after=khong-phai-con-tro',
        `?after=${Buffer.from('{"c":"x","i":"y"}').toString('base64url')}`,
        '?limit=0',
        '?limit=51',
        '?limit=abc',
        '?limit=1.5',
        `?after=${cursor}&before=${cursor}`,
        `?after=${cursor}&at=${rows[0].id}`,
        '?at=abc',
      ];
      for (const query of bad) {
        const res = await buyer.get(url(query));
        expect([query, res.status, res.body.error.code]).toEqual([query, 400, 'VALIDATION_ERROR']);
      }
    });

    it('con trỏ trỏ tới sản phẩm đã xóa vẫn tìm được sản phẩm kế tiếp, trang rỗng vẫn có total', async () => {
      const { rows, page } = await fiveProducts();
      const first = await page('?limit=1');
      rows[4].deleted_at = 'x'; // p5, sản phẩm mà con trỏ `first` đang đứng
      const next = await page(`?limit=2&after=${first.nextCursor}`);
      expect(names(next)).toEqual(['p4', 'p3']);

      const atP2 = (await page('?limit=3')).nextCursor; // p4, p3, p2 -> con trỏ đứng ở p2
      rows[0].deleted_at = 'x'; // p1 biến mất: sau con trỏ không còn gì
      const last = await page(`?limit=5&after=${atP2}`);
      expect(last.items).toEqual([]);
      expect(last.total).toBe(3);
    });
  });
});

describe('/state', () => {
  it('quota.remaining = min(ngày, tháng) - đang giữ, không âm; generation theo cờ', async () => {
    const kit = await setupTryon({ TRYON_DAILY_LIMIT: 3, TRYON_PREFETCH_MIN_REMAINING: 0 });
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const before = (await buyer.state()).body.data;
    expect(before.quota).toMatchObject({
      dailyLimit: 3,
      dailyUsed: 0,
      monthlyLimit: 100,
      held: 0,
      remaining: 3,
    });
    expect(before.quota.dailyResetsAt).toMatch(/Z$/);
    expect(before.generation).toEqual({ available: true, prefetchAllowed: true });

    await buyer.job(kit.product('A', cat.id).id);
    await buyer.job(kit.product('B', cat.id).id);
    expect((await buyer.state()).body.data.quota).toMatchObject({ held: 2, remaining: 1 });
  });

  it('prefetchAllowed = false khi tắt generate trước', async () => {
    const kit = await setupTryon({ TRYON_PREFETCH_ENABLED: false });
    const buyer = await kit.newBuyer();
    expect((await buyer.state()).body.data.generation).toEqual({
      available: true,
      prefetchAllowed: false,
    });
  });
});

describe('generate trước (purpose = prefetch)', () => {
  it('bị bỏ qua là kết quả bình thường 200 skipped, không tạo job, không lỗi', async () => {
    const kit = await setupTryon({ TRYON_DAILY_LIMIT: 4 }); // ≤ 3 lượt thì dừng
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const [a, b] = ['A', 'B'].map((n) => kit.product(n, cat.id));
    expect((await buyer.job(a.id, { purpose: 'prefetch' })).status).toBe(202); // còn 4
    const skipped = await buyer.job(b.id, { purpose: 'prefetch' }); // còn 3
    expect([skipped.status, skipped.body.data]).toEqual([
      200,
      { state: 'skipped', reason: 'low_quota' },
    ]);
    expect(kit.tryon.repository.jobs).toHaveLength(1);
  });

  it('đủ 2 job thì bỏ qua (busy); tắt bằng cờ thì skipped disabled; gần hết ngân sách thì skipped budget', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const ps = ['A', 'B', 'C'].map((n) => kit.product(n, cat.id));
    await buyer.job(ps[0].id);
    await buyer.job(ps[1].id);
    const busy = await buyer.job(ps[2].id, { purpose: 'prefetch' });
    expect(busy.body.data).toEqual({ state: 'skipped', reason: 'busy' });

    const off = await setupTryon({ TRYON_PREFETCH_ENABLED: false });
    const b2 = await off.newBuyer();
    const p = off.product('A', off.category().id);
    expect((await b2.job(p.id, { purpose: 'prefetch' })).body.data).toEqual({
      state: 'skipped',
      reason: 'disabled',
    });
    expect(off.tryon.repository.calls).not.toContain('createJob');

    const budget = await setupTryon({ TRYON_MONTHLY_BUDGET_USD: 0.15 }); // ảnh thứ 1 đã chạm 100% của 80%
    const b3 = await budget.newBuyer();
    const c = budget.category();
    await b3.job(budget.product('A', c.id).id);
    const skippedBudget = await b3.job(budget.product('B', c.id).id, { purpose: 'prefetch' });
    expect(skippedBudget.body.data).toEqual({ state: 'skipped', reason: 'budget' });
  });

  it('display nâng ưu tiên của job generate trước đang có; display mới hủy prefetch chưa gửi khi đủ 2 job', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const [a, b, c] = ['A', 'B', 'C'].map((n) => kit.product(n, cat.id));
    const pre = await buyer.job(a.id, { purpose: 'prefetch' });
    const up = await buyer.job(a.id, { purpose: 'display' });
    expect(up.body.data.job.id).toBe(pre.body.data.job.id);
    expect(kit.tryon.repository.jobs[0].purpose).toBe('display');

    await buyer.job(b.id, { purpose: 'prefetch' });
    expect((await buyer.job(c.id)).status).toBe(202); // đủ 2 job: hủy prefetch của B nhường chỗ
    const byProduct = Object.fromEntries(
      kit.tryon.repository.jobs.map((j) => [j.product_id, j.status]),
    );
    expect(byProduct[b.id]).toBe('canceled');
    expect((await buyer.state()).body.data.quota.held).toBe(2);
  });

  it('hàng đợi của một người: tối đa 2 job đang gửi, 4 job hoạt động; vượt thì 429 thử lại sau 5 giây', async () => {
    const kit = await setupTryon();
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    const ps = ['A', 'B', 'C', 'D', 'E'].map((n) => kit.product(n, cat.id));
    for (const p of ps.slice(0, 4)) expect((await buyer.job(p.id)).status).toBe(202);
    const busy = await buyer.job(ps[4].id);
    expect(busy.status).toBe(429);
    expect(busy.body.error).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      details: { retryAfterSeconds: 5 },
    });
    expect(busy.headers['retry-after']).toBe('5');

    await kit.tryon.worker.tick();
    expect(kit.tryon.repository.jobs.filter((j) => j.status === 'running')).toHaveLength(2);
    expect(kit.tryon.repository.jobs.filter((j) => j.status === 'queued')).toHaveLength(2);
  });
});

describe('rate limit (D-88)', () => {
  it('tạo job: đếm cả request bị từ chối (400); hai bộ đếm tách nhau', async () => {
    const kit = await setupTryon({ TRYON_JOB_CREATES_PER_MIN: 2 });
    const buyer = await kit.newBuyer();
    const p = kit.product('A', kit.category().id);
    expect((await buyer.job(p.id, { purpose: 'sai' })).status).toBe(400);
    expect((await buyer.job(p.id, { purpose: 'sai' })).status).toBe(400);
    const limited = await buyer.job(p.id);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(limited.headers['retry-after'])).toBe(
      limited.body.error.details.retryAfterSeconds,
    );
    expect((await buyer.state()).status).toBe(200); // bộ đếm đọc độc lập
    expect((await buyer.get(`/api/try-on/products/${p.id}/result`)).status).toBe(200);
  });

  it('đọc có bộ đếm riêng; mỗi người một bộ đếm', async () => {
    const kit = await setupTryon({ TRYON_READS_PER_MIN: 3 });
    const a = await kit.newBuyer();
    const b = await kit.newBuyer();
    expect([(await a.state()).status, (await a.state()).status, (await a.state()).status]).toEqual([
      200, 200, 429,
    ]);
    expect((await b.state()).status).toBe(200);
  });
});
