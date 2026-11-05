import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createTestApp, TEST_ENV } from './helpers/authTestKit.js';
import { toPublicUser } from '../src/services/authService.js';

const PASSWORD = 'abc12345';
const register = (app, body) => request(app).post('/api/auth/register').send(body);
const login = (app, body) => request(app).post('/api/auth/login').send(body);

afterEach(() => vi.restoreAllMocks());

describe('toPublicUser', () => {
  it('createdAt luôn là ISO UTC có "Z" (Postgres trả microsecond + offset)', () => {
    const user = toPublicUser({
      id: 'x',
      email: 'a@b.co',
      role: 'user',
      created_at: '2026-11-05T07:25:25.893014+00:00',
    });
    expect(user.createdAt).toBe('2026-11-05T07:25:25.893Z');
  });
});

describe('POST /api/auth/register', () => {
  it('AC-01/AC-05: tạo user, hash bcrypt, trả JWT chỉ có sub/role/iat/exp, không lộ hash', async () => {
    const { app, userRepository } = await createTestApp();
    const res = await register(app, { email: 'a@example.com', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'a@example.com', role: 'user' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);

    const [stored] = [...userRepository.rows.values()];
    expect(stored.password_hash).toMatch(/^\$2[aby]\$/);
    expect(stored.password_hash).not.toContain(PASSWORD);

    const payload = jwt.verify(res.body.data.token, TEST_ENV.JWT_SECRET, { algorithms: ['HS256'] });
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
    expect(payload.exp - payload.iat).toBe(7 * 24 * 3600);
  });

  it('AC-04: gửi role=admin vẫn tạo user thường', async () => {
    const { app, userRepository } = await createTestApp();
    const res = await register(app, { email: 'a@example.com', password: PASSWORD, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('user');
    expect([...userRepository.rows.values()][0].role).toBe('user');
    expect(jwt.decode(res.body.data.token).role).toBe('user');
  });

  it('AC-02: email khác hoa/thường và khoảng trắng -> 409; đăng nhập bằng dạng không chuẩn hóa vẫn được', async () => {
    const { app } = await createTestApp();
    await register(app, { email: 'a@example.com', password: PASSWORD });
    const dup = await register(app, { email: ' A@Example.COM ', password: PASSWORD });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    expect((await login(app, { email: ' A@Example.COM ', password: PASSWORD })).status).toBe(200);
  });

  it('E8: đăng ký đồng thời (check qua nhưng INSERT vi phạm unique) -> 409, không phải 500', async () => {
    const { app, userRepository } = await createTestApp();
    userRepository.failNextCreateWithDuplicate = true;
    const res = await register(app, { email: 'a@example.com', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('AC-03: mật khẩu yếu/non-ASCII -> 400 theo trường, không tạo user', async () => {
    const { app, userRepository } = await createTestApp();
    for (const password of ['abcdefgh', 'abc123', 'matkhau1é', 'a'.repeat(72) + '1']) {
      const res = await register(app, { email: 'a@example.com', password });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([{ field: 'password', message: expect.any(String) }]);
    }
    expect(userRepository.rows.size).toBe(0);
  });

  it('body không phải JSON object -> 400, không 500', async () => {
    const { app } = await createTestApp();
    const res = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('[1,2]');
    expect(res.status).toBe(400);
    expect((await request(app).post('/api/auth/register')).status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  async function withUser() {
    const ctx = await createTestApp();
    await register(ctx.app, { email: 'a@example.com', password: PASSWORD });
    return ctx;
  }

  it('AC-06: email lạ và sai mật khẩu cho cùng response; email lạ vẫn so với DUMMY_HASH', async () => {
    const { app } = await withUser();
    const compare = vi.spyOn(bcrypt, 'compare');
    const unknown = await login(app, { email: 'nobody@example.com', password: PASSWORD });
    const wrong = await login(app, { email: 'a@example.com', password: 'wrongpass1' });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    // cả hai nhánh đều chạy bcrypt.compare -> thời gian phản hồi tương đương
    expect(compare).toHaveBeenCalledTimes(2);
  });

  it('AC-07: 5 lần sai (401) rồi lần 6 dù đúng mật khẩu -> 429 có retryAfterSeconds + Retry-After thấy được ở details', async () => {
    const { app } = await withUser();
    for (let i = 0; i < 5; i++) {
      const res = await login(app, { email: 'a@example.com', password: 'wrongpass1' });
      expect(res.status).toBe(401);
    }
    const locked = await login(app, { email: 'a@example.com', password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(locked.body.error.details.retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect(locked.body.error.message).toContain('15 phút');
    expect(Number(locked.headers['retry-after'])).toBe(locked.body.error.details.retryAfterSeconds);
  });

  it('D-30: email không tồn tại cũng bị khóa sau 5 lần (không lộ email có đăng ký)', async () => {
    const { app } = await withUser();
    for (let i = 0; i < 5; i++)
      await login(app, { email: 'ghost@example.com', password: PASSWORD });
    const res = await login(app, { email: 'ghost@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
  });

  it('lỗi validation (400) không tính vào bộ đếm khóa', async () => {
    const { app } = await withUser();
    for (let i = 0; i < 8; i++) await login(app, { email: 'a@example.com', password: '' });
    expect((await login(app, { email: 'a@example.com', password: PASSWORD })).status).toBe(200);
  });

  it('đăng nhập đúng xóa bộ đếm sai trước đó', async () => {
    const { app } = await withUser();
    for (let i = 0; i < 4; i++)
      await login(app, { email: 'a@example.com', password: 'wrongpass1' });
    expect((await login(app, { email: 'a@example.com', password: PASSWORD })).status).toBe(200);
    for (let i = 0; i < 4; i++)
      await login(app, { email: 'a@example.com', password: 'wrongpass1' });
    expect((await login(app, { email: 'a@example.com', password: PASSWORD })).status).toBe(200);
  });

  it('mật khẩu 72 ký tự đăng ký được và đăng nhập được (không bị cắt âm thầm)', async () => {
    const { app } = await createTestApp();
    const long = `${'a'.repeat(71)}1`;
    await register(app, { email: 'long@example.com', password: long });
    expect((await login(app, { email: 'long@example.com', password: long })).status).toBe(200);
    // bcrypt chỉ dùng 72 byte đầu: mật khẩu khác ở ký tự cuối phải bị từ chối
    expect(
      (await login(app, { email: 'long@example.com', password: `${'a'.repeat(71)}2` })).status,
    ).toBe(401);
  });
});

describe('rate limit IP /api/auth/*', () => {
  it('vượt giới hạn -> 429 TOO_MANY_REQUESTS luôn có details.retryAfterSeconds (D-34)', async () => {
    const { app } = await createTestApp({ AUTH_RATE_LIMIT_PER_MIN: 3 });
    const body = { email: 'x@example.com', password: 'abc12345' };
    for (let i = 0; i < 3; i++) await login(app, body);
    const res = await login(app, body);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.body.error.details.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('middleware auth + GET /api/auth/me', () => {
  const sign = (payload, secret = TEST_ENV.JWT_SECRET, options = { algorithm: 'HS256' }) =>
    jwt.sign(payload, secret, options);
  const me = (app, token) => {
    const req = request(app).get('/api/auth/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('AC-11: token hợp lệ -> user hiện tại', async () => {
    const { app } = await createTestApp();
    const reg = await register(app, { email: 'a@example.com', password: PASSWORD });
    const res = await me(app, reg.body.data.token);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      email: 'a@example.com',
      role: 'user',
      profileCompleted: false,
    });
  });

  it('thiếu header, sai scheme, token rác -> 401 UNAUTHORIZED', async () => {
    const { app } = await createTestApp();
    expect((await me(app)).body.error.code).toBe('UNAUTHORIZED');
    const basic = await request(app).get('/api/auth/me').set('Authorization', 'Basic abc');
    expect(basic.status).toBe(401);
    expect((await me(app, 'not.a.jwt')).body.error.code).toBe('UNAUTHORIZED');
  });

  it('AC-08: token hết hạn -> 401 TOKEN_EXPIRED', async () => {
    const { app, userRepository } = await createTestApp();
    const reg = await register(app, { email: 'a@example.com', password: PASSWORD });
    const id = [...userRepository.rows.keys()][0];
    const expired = sign({ role: 'user', sub: id }, TEST_ENV.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: -10,
    });
    const res = await me(app, expired);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    expect(reg.status).toBe(201);
  });

  it('sai chữ ký, alg none, alg khác HS256 -> 401 UNAUTHORIZED', async () => {
    const { app, userRepository } = await createTestApp();
    await register(app, { email: 'a@example.com', password: PASSWORD });
    const id = [...userRepository.rows.keys()][0];
    const wrongSig = sign(
      { role: 'user', sub: id },
      'another-secret-another-secret-another-secret',
    );
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: id, role: 'admin' }),
    ).toString('base64url')}.`;
    const hs512 = sign({ role: 'user', sub: id }, TEST_ENV.JWT_SECRET, { algorithm: 'HS512' });
    for (const token of [wrongSig, none, hs512]) {
      const res = await me(app, token);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('E6: user đã bị xóa nhưng token còn hạn -> 401; token thiếu sub -> 401', async () => {
    const { app, userRepository } = await createTestApp();
    const reg = await register(app, { email: 'a@example.com', password: PASSWORD });
    expect((await me(app, sign({ role: 'user' }))).status).toBe(401);
    userRepository.rows.clear();
    const res = await me(app, reg.body.data.token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('AC-10: phân quyền /api/admin/ping', () => {
  it('không token -> 401; user -> 403; admin -> 200; role lấy từ DB, không tin token', async () => {
    const { app, userRepository } = await createTestApp();
    const reg = await register(app, { email: 'u@example.com', password: PASSWORD });
    const ping = (token) => {
      const req = request(app).get('/api/admin/ping');
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };
    expect((await ping()).status).toBe(401);

    const forbidden = await ping(reg.body.data.token);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    // Token tự ký đúng secret nhưng khai role=admin cho user thường: DB vẫn là 'user' -> 403
    const id = [...userRepository.rows.keys()][0];
    const forged = jwt.sign({ role: 'admin' }, TEST_ENV.JWT_SECRET, {
      algorithm: 'HS256',
      subject: id,
    });
    expect((await ping(forged)).status).toBe(403);

    // Nâng quyền trong DB có hiệu lực ngay với token cũ
    userRepository.rows.get(id).role = 'admin';
    const ok = await ping(reg.body.data.token);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ pong: true, role: 'admin' });
  });
});
