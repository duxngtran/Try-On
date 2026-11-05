import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { generateFixtures } from '../scripts/generate-fixtures.js';
import { createTestApp } from './helpers/authTestKit.js';

const PASSWORD = 'abc12345';
let files;
let validJpeg;

beforeAll(async () => {
  files = await generateFixtures(await mkdtemp(path.join(tmpdir(), 'prof-')));
  validJpeg = await readFile(files['valid-1080x1920-gps.jpg']);
}, 60000);

async function signUp(ctx, email = 'a@example.com') {
  const res = await request(ctx.app).post('/api/auth/register').send({ email, password: PASSWORD });
  const token = res.body.data.token;
  const id = res.body.data.user.id;
  const auth = { Authorization: `Bearer ${token}` };
  return {
    id,
    token,
    get: () => request(ctx.app).get('/api/profile').set(auth),
    me: () => request(ctx.app).get('/api/auth/me').set(auth),
    consent: (body = { accepted: true }) =>
      request(ctx.app).post('/api/profile/photo-consent').set(auth).send(body),
    measurements: (body) => request(ctx.app).put('/api/profile/measurements').set(auth).send(body),
    upload: (file = validJpeg, name = 'p.jpg') =>
      request(ctx.app).put('/api/profile/photo').set(auth).attach('photo', file, name),
    uploadRaw: () => request(ctx.app).put('/api/profile/photo').set(auth),
    del: () => request(ctx.app).delete('/api/profile/photo').set(auth),
  };
}

/** Một user đã consent + có số đo + có ảnh. */
async function userWithPhoto(ctx, email) {
  const user = await signUp(ctx, email);
  await user.consent();
  await user.measurements({ heightCm: 165, weightKg: 52.5 });
  expect((await user.upload()).status).toBe(200);
  return user;
}

const objectPaths = (ctx) => [...ctx.supabase.objects.keys()];

describe('xác thực & phân quyền (E1, D-28)', () => {
  it('thiếu token -> 401 trên mọi endpoint hồ sơ', async () => {
    const { app } = await createTestApp();
    const calls = [
      request(app).get('/api/profile'),
      request(app).put('/api/profile/measurements').send({}),
      request(app).post('/api/profile/photo-consent').send({ accepted: true }),
      request(app).put('/api/profile/photo'),
      request(app).delete('/api/profile/photo'),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('admin gọi API hồ sơ -> 403', async () => {
    const ctx = await createTestApp();
    const admin = await ctx.userRepository.create({
      email: 'admin@example.com',
      passwordHash: '$2b$04$' + 'a'.repeat(53),
      role: 'admin',
    });
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign({ role: 'admin' }, ctx.env.JWT_SECRET, {
      algorithm: 'HS256',
      subject: admin.id,
    });
    const res = await request(ctx.app).get('/api/profile').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('AC-01: hồ sơ trống', () => {
  it('trả đúng shape contract, thiếu cả ảnh và số đo, chưa consent', async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    const res = await user.get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        profile: {
          heightCm: null,
          weightKg: null,
          photo: null,
          consent: { accepted: false, acceptedAt: null, version: null },
          profileCompleted: false,
          missing: ['photo', 'measurements'],
        },
      },
    });
  });
});

describe('AC-02: consent', () => {
  it('upload khi chưa consent -> 400 CONSENT_REQUIRED, không có file nào được lưu', async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    const res = await user.upload();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
    expect(objectPaths(ctx)).toEqual([]);
  });

  it('CONSENT_REQUIRED được kiểm trước FILE_REQUIRED (không nhận file khi chưa consent)', async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    expect((await user.uploadRaw()).body.error.code).toBe('CONSENT_REQUIRED');
  });

  it.each([{ accepted: false }, { accepted: 'true' }, {}])(
    'consent với %j -> 400 VALIDATION_ERROR, vẫn chưa consent',
    async (body) => {
      const ctx = await createTestApp();
      const user = await signUp(ctx);
      const res = await user.consent(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect((await user.get()).body.data.profile.consent.accepted).toBe(false);
    },
  );

  it('consent idempotent: gọi lại không đổi thời điểm lần đầu; acceptedAt là ISO có "Z"', async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    const first = (await user.consent()).body.data.profile.consent;
    expect(first.accepted).toBe(true);
    expect(first.version).toBe(1);
    expect(first.acceptedAt).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
    const second = (await user.consent()).body.data.profile.consent;
    expect(second).toEqual(first);
  });

  it('consent bản cũ (version thấp hơn hiện hành) bị coi là chưa consent', async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    await user.consent();
    ctx.profileRepository.rows.get(user.id).photo_consent_version = 0;
    expect((await user.get()).body.data.profile.consent.accepted).toBe(false);
    expect((await user.upload()).body.error.code).toBe('CONSENT_REQUIRED');
  });
});

describe('AC-03, AC-09: tải ảnh hợp lệ và hồ sơ đầy đủ', () => {
  it('lưu ảnh đã xóa EXIF, signed URL, version tăng, profileCompleted ở cả hồ sơ và /auth/me', async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    await user.consent();
    expect((await user.me()).body.data.user.profileCompleted).toBe(false);

    await user.measurements({ heightCm: 165, weightKg: 52.5 });
    expect((await user.get()).body.data.profile.missing).toEqual(['photo']);

    const res = await user.upload();
    expect(res.status).toBe(200);
    const { profile } = res.body.data;
    expect(profile.profileCompleted).toBe(true);
    expect(profile.missing).toEqual([]);
    expect(profile.photo).toMatchObject({ version: 1 });
    expect(profile.photo.url).toContain('/sign/');
    expect(profile.photo.expiresAt).toMatch(/Z$/);
    expect(profile.photo.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/); // không phải dạng "+00:00" của Postgres
    expect(JSON.stringify(profile)).not.toMatch(/photo_?path/i);
    expect((await user.me()).body.data.user.profileCompleted).toBe(true);

    const [stored] = ctx.supabase.objects;
    expect(stored[0]).toMatch(new RegExp(`^${user.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(stored[1].contentType).toBe('image/jpeg');
    const meta = await sharp(stored[1].body).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
  });

  it('login cũng trả profileCompleted thật', async () => {
    const ctx = await createTestApp();
    const user = await userWithPhoto(ctx);
    expect(user.id).toBeDefined();
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'a@example.com', password: PASSWORD });
    expect(res.body.data.user.profileCompleted).toBe(true);
  });

  it('ký URL lỗi -> vẫn 200 với photo.url = null (api.md 5.1)', async () => {
    const ctx = await createTestApp();
    const user = await userWithPhoto(ctx);
    ctx.supabase.state.failSign = true;
    const res = await user.get();
    expect(res.status).toBe(200);
    expect(res.body.data.profile.photo).toMatchObject({ url: null, expiresAt: null, version: 1 });
  });
});

describe('AC-04: thay ảnh', () => {
  it('ảnh cũ bị xóa khỏi Storage, hồ sơ trỏ ảnh mới, version tăng', async () => {
    const ctx = await createTestApp();
    const user = await userWithPhoto(ctx);
    const [oldPath] = objectPaths(ctx);

    const res = await user.upload(await readFile(files['valid-1080x1920.png']), 'b.png');
    expect(res.status).toBe(200);
    expect(res.body.data.profile.photo.version).toBe(2);
    const paths = objectPaths(ctx);
    expect(paths).toHaveLength(1);
    expect(paths[0]).not.toBe(oldPath);
  });

  it('xóa ảnh cũ lỗi 1 lần -> thử lại và xóa được', async () => {
    const ctx = await createTestApp();
    const user = await userWithPhoto(ctx);
    ctx.supabase.state.removeFailures = 1;
    expect((await user.upload()).status).toBe(200);
    expect(objectPaths(ctx)).toHaveLength(1);
  });

  it('xóa ảnh cũ lỗi cả 2 lần -> vẫn 200, ghi ORPHAN_PHOTO chỉ kèm userId (không đường dẫn)', async () => {
    const logged = [];
    const ctx = await createTestApp({}, { logger: { error: (...args) => logged.push(args) } });
    const user = await userWithPhoto(ctx);
    const [oldPath] = objectPaths(ctx);
    ctx.supabase.state.removeFailures = 2;

    const res = await user.upload();
    expect(res.status).toBe(200);
    expect(res.body.data.profile.photo.version).toBe(2);
    expect(logged).toEqual([['ORPHAN_PHOTO', { userId: user.id }]]);
    expect(JSON.stringify(logged)).not.toContain(oldPath);
  });
});

describe('AC-05, E10, E11: lỗi giữa chừng không làm mất ảnh cũ, không để file mồ côi', () => {
  const failures = [
    ['sai định dạng', (user) => user.upload(Buffer.from('MZ' + 'x'.repeat(500)), 'a.jpg'), 400],
    ['ảnh hỏng', async (user) => user.upload(await readFile(files['corrupt.jpg'])), 400],
  ];
  it.each(failures)('%s -> 400, ảnh cũ nguyên vẹn', async (_name, attempt, status) => {
    const ctx = await createTestApp();
    const user = await userWithPhoto(ctx);
    const before = objectPaths(ctx);
    const res = await attempt(user);
    expect(res.status).toBe(status);
    expect(objectPaths(ctx)).toEqual(before);
    expect((await user.get()).body.data.profile.photo.version).toBe(1);
  });

  it('E10: Storage lỗi khi upload -> 500 UPLOAD_FAILED, hồ sơ và ảnh cũ giữ nguyên', async () => {
    const ctx = await createTestApp();
    const user = await userWithPhoto(ctx);
    const before = objectPaths(ctx);
    ctx.supabase.state.failUpload = true;
    const res = await user.upload();
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('UPLOAD_FAILED');
    expect(objectPaths(ctx)).toEqual(before);
    const profile = (await user.get()).body.data.profile;
    expect(profile.photo.version).toBe(1);
    expect(profile.profileCompleted).toBe(true);
  });

  it('E11: upload xong nhưng DB lỗi -> 500 INTERNAL_ERROR, file mới bị xóa, ảnh cũ còn, không lộ chi tiết', async () => {
    const ctx = await createTestApp();
    const user = await userWithPhoto(ctx);
    const before = objectPaths(ctx);
    ctx.profileRepository.failNextSetPhoto = true;
    const res = await user.upload();
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('db down');
    expect(objectPaths(ctx)).toEqual(before);
    expect((await user.get()).body.data.profile.photo.version).toBe(1);
  });

  it('E11 + xóa file mới cũng lỗi: vẫn 500 và ghi ORPHAN_PHOTO', async () => {
    const logged = [];
    const ctx = await createTestApp({}, { logger: { error: (...args) => logged.push(args) } });
    const user = await userWithPhoto(ctx);
    ctx.profileRepository.failNextSetPhoto = true;
    ctx.supabase.state.removeFailures = 2;
    expect((await user.upload()).status).toBe(500);
    expect(logged.some(([event]) => event === 'ORPHAN_PHOTO')).toBe(true);
  });
});

describe('AC-06: từ chối ảnh sai quy tắc qua API (không file nào được lưu)', () => {
  it.each([
    ['fake-exe.jpg', 400, 'INVALID_FILE_TYPE'],
    ['too-small-400x800.jpg', 400, 'IMAGE_TOO_SMALL'],
    ['landscape-1920x1080.jpg', 400, 'INVALID_ASPECT_RATIO'],
    ['too-long-edge-600x9000.jpg', 400, 'IMAGE_TOO_LARGE'],
    ['corrupt.jpg', 400, 'INVALID_IMAGE'],
    ['too-large-over-10mb.jpg', 413, 'FILE_TOO_LARGE'],
  ])('%s -> %i %s', async (name, status, code) => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    await user.consent();
    const res = await user.upload(await readFile(files[name]), name);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(res.body.success).toBe(false);
    expect(objectPaths(ctx)).toEqual([]);
  });

  it('FILE_TOO_LARGE theo PHOTO_MAX_MB cấu hình, nêu đúng dung lượng', async () => {
    const ctx = await createTestApp({ PHOTO_MAX_MB: 1 });
    const user = await signUp(ctx);
    await user.consent();
    const res = await user.upload(Buffer.concat([validJpeg, Buffer.alloc(1024 * 1024)]));
    expect(res.status).toBe(413);
    expect(res.body.error.message).toBe('Ảnh tối đa 1 MB.');
  });
});

describe('E3, multipart sai dạng', () => {
  const setup = async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    await user.consent();
    return { ctx, user, auth: { Authorization: `Bearer ${user.token}` } };
  };

  it('không có file / không phải multipart -> 400 FILE_REQUIRED', async () => {
    const { ctx, user, auth } = await setup();
    expect((await user.uploadRaw()).body.error.code).toBe('FILE_REQUIRED');
    const json = await request(ctx.app).put('/api/profile/photo').set(auth).send({ photo: 'x' });
    expect(json.body.error.code).toBe('FILE_REQUIRED');
  });

  it('sai tên field, >1 file, hoặc có field chữ -> 400 VALIDATION_ERROR', async () => {
    const { ctx, auth } = await setup();
    const put = () => request(ctx.app).put('/api/profile/photo').set(auth);
    const cases = [
      put().attach('avatar', validJpeg, 'a.jpg'),
      put().attach('photo', validJpeg, 'a.jpg').attach('photo', validJpeg, 'b.jpg'),
      put().attach('photo', validJpeg, 'a.jpg').field('userId', 'someone-else'),
    ];
    for (const res of await Promise.all(cases)) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(objectPaths(ctx)).toEqual([]);
  });

  it('multipart hỏng (cắt cụt) -> 400, không phải 500', async () => {
    const { ctx, auth } = await setup();
    const res = await request(ctx.app)
      .put('/api/profile/photo')
      .set(auth)
      .set('Content-Type', 'multipart/form-data; boundary=XXX')
      .send('--XXX\r\nContent-Disposition: form-data; name="photo"; filename="a.jpg"\r\n\r\nabc');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('AC-07, AC-08: số đo', () => {
  it('lưu 165 / 52.5 và đọc lại đúng kiểu số', async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    const res = await user.measurements({ heightCm: 165, weightKg: 52.5 });
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({ heightCm: 165, weightKg: 52.5 });
    expect((await user.get()).body.data.profile).toMatchObject({ heightCm: 165, weightKg: 52.5 });
  });

  it.each([
    [{ heightCm: 90, weightKg: 52.5 }, 'heightCm'],
    [{ heightCm: 251, weightKg: 52.5 }, 'heightCm'],
    [{ heightCm: 165, weightKg: 25 }, 'weightKg'],
    [{ heightCm: 165, weightKg: 52.55 }, 'weightKg'],
    [{ heightCm: '165', weightKg: 52.5 }, 'heightCm'],
    [{ heightCm: 165 }, 'weightKg'],
  ])('%j -> 400 VALIDATION_ERROR ở %s, dữ liệu cũ không đổi', async (body, field) => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    await user.measurements({ heightCm: 170, weightKg: 60 });
    const res = await user.measurements(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field, message: expect.any(String) }]);
    expect((await user.get()).body.data.profile).toMatchObject({ heightCm: 170, weightKg: 60 });
  });

  it('lưu số đo độc lập với ảnh và không cho sửa trường khác qua API này', async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    const res = await user.measurements({
      heightCm: 165,
      weightKg: 52.5,
      photoPath: 'x/y.jpg',
      photoVersion: 99,
      user_id: 'other',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.profile.photo).toBeNull();
    expect(ctx.profileRepository.rows.get(user.id).photo_path).toBeNull();
    expect(ctx.profileRepository.rows.get(user.id).photo_version).toBe(0);
  });
});

describe('AC-11: user X không chạm hồ sơ user Y', () => {
  it('mọi thao tác của X (kể cả truyền id của Y) chỉ tác động hồ sơ X', async () => {
    const ctx = await createTestApp();
    const x = await userWithPhoto(ctx, 'x@example.com');
    const y = await userWithPhoto(ctx, 'y@example.com');
    await y.measurements({ heightCm: 190, weightKg: 90 });
    const yBefore = { ...ctx.profileRepository.rows.get(y.id) };
    const yPaths = objectPaths(ctx).filter((p) => p.startsWith(`${y.id}/`));
    const auth = { Authorization: `Bearer ${x.token}` };

    const probe = await request(ctx.app).get(`/api/profile?userId=${y.id}`).set(auth);
    expect(probe.status).toBe(200);
    expect(probe.body.data.profile.heightCm).toBe(165); // số đo của X, không phải 190 của Y
    expect((await request(ctx.app).get(`/api/profile/${y.id}`).set(auth)).status).toBe(404);

    await request(ctx.app)
      .put('/api/profile/measurements')
      .set(auth)
      .send({ heightCm: 180, weightKg: 80, userId: y.id });
    expect((await x.del()).status).toBe(200);

    expect(ctx.profileRepository.rows.get(y.id)).toEqual(yBefore);
    expect(objectPaths(ctx).filter((p) => p.startsWith(`${y.id}/`))).toEqual(yPaths);
    expect(objectPaths(ctx).filter((p) => p.startsWith(`${x.id}/`))).toEqual([]);
  });
});

describe('AC-12: xóa ảnh', () => {
  it('xóa file + đường dẫn, profileCompleted=false, version tăng, consent và số đo giữ nguyên', async () => {
    const ctx = await createTestApp();
    const user = await userWithPhoto(ctx);
    const res = await user.del();
    expect(res.status).toBe(200);
    const { profile } = res.body.data;
    expect(profile.photo).toBeNull();
    expect(profile.profileCompleted).toBe(false);
    expect(profile.missing).toEqual(['photo']);
    expect(profile.consent.accepted).toBe(true);
    expect(profile).toMatchObject({ heightCm: 165, weightKg: 52.5 });
    expect(objectPaths(ctx)).toEqual([]);
    expect(ctx.profileRepository.rows.get(user.id).photo_version).toBe(2);
    expect((await user.me()).body.data.user.profileCompleted).toBe(false);
  });

  it('idempotent: chưa có ảnh vẫn 200 và không tăng version', async () => {
    const ctx = await createTestApp();
    const user = await signUp(ctx);
    expect((await user.del()).status).toBe(200);
    expect(ctx.profileRepository.rows.get(user.id).photo_version).toBe(0);
  });

  it('Storage lỗi khi xóa file -> vẫn 200 (DB là nguồn sự thật), ghi ORPHAN_PHOTO', async () => {
    const logged = [];
    const ctx = await createTestApp({}, { logger: { error: (...args) => logged.push(args) } });
    const user = await userWithPhoto(ctx);
    ctx.supabase.state.removeFailures = 2;
    const res = await user.del();
    expect(res.status).toBe(200);
    expect(res.body.data.profile.photo).toBeNull();
    expect(logged).toEqual([['ORPHAN_PHOTO', { userId: user.id }]]);
  });
});

describe('E14: rate limit upload theo user (D-31)', () => {
  it('request thứ 3 -> 429 có retryAfterSeconds + Retry-After; đếm cả request bị từ chối; user khác không bị ảnh hưởng', async () => {
    const ctx = await createTestApp({ PHOTO_UPLOADS_PER_HOUR: 2 });
    const a = await signUp(ctx, 'a@example.com');
    const b = await signUp(ctx, 'b@example.com');

    // 2 request bị từ chối (chưa consent) vẫn tính vào hạn mức
    expect((await a.upload()).body.error.code).toBe('CONSENT_REQUIRED');
    expect((await a.upload()).body.error.code).toBe('CONSENT_REQUIRED');
    await a.consent();
    const limited = await a.upload();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(3500);
    expect(Number(limited.headers['retry-after'])).toBe(
      limited.body.error.details.retryAfterSeconds,
    );
    expect(objectPaths(ctx)).toEqual([]);

    await b.consent();
    expect((await b.upload()).status).toBe(200);
  });
});
