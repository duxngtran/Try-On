import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createErrorHandler } from '../src/middlewares/errorHandler.js';
import { AppError } from '../src/utils/AppError.js';

const silentLogger = { error: vi.fn() };
const app = createApp({ corsOrigin: 'http://localhost:5173', logger: silentLogger });

describe('GET /api/health', () => {
  it('trả success:true', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });
});

describe('404 và body JSON', () => {
  it('route lạ trả 404 NOT_FOUND đúng format', async () => {
    const res = await request(app).get('/api/khong-ton-tai');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });

  it('body JSON > 10 KB trả 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(11 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('JSON hỏng trả 400 VALIDATION_ERROR, không lộ chi tiết parser', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"a": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/Unexpected|JSON at position/i);
  });
});

describe('security headers và CORS', () => {
  it('chỉ khai báo origin cấu hình, không phản chiếu origin lạ', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    // cors với origin dạng chuỗi luôn trả đúng origin cấu hình; trình duyệt chặn origin khác
    expect(denied.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});

describe('error handler', () => {
  const build = (thrower, isProduction) => {
    const logger = { error: vi.fn() };
    const a = express();
    a.get('/boom', thrower);
    a.use(createErrorHandler({ isProduction, logger }));
    return { a, logger };
  };

  it('lỗi không lường trước -> 500 INTERNAL_ERROR, không lộ message/stack', async () => {
    const { a, logger } = build(() => {
      throw new Error('relation "users" does not exist');
    }, true);
    const res = await request(a).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/relation|users|stack/i);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('Express 5: lỗi từ handler async được chuyển tới error handler', async () => {
    const { a } = build(async () => {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email đã được đăng ký.');
    }, false);
    const res = await request(a).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'Email đã được đăng ký.',
    });
  });

  it('ZodError -> 400 với details theo từng trường', async () => {
    const { z } = await import('zod');
    const { a } = build(() => z.object({ email: z.email() }).parse({ email: 'x' }), false);
    const res = await request(a).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('email');
  });

  it('MulterError LIMIT_FILE_SIZE -> 413 FILE_TOO_LARGE', async () => {
    const { a } = build(() => {
      const e = new Error('File too large');
      e.name = 'MulterError';
      e.code = 'LIMIT_FILE_SIZE';
      throw e;
    }, false);
    const res = await request(a).get('/boom');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('AppError 429 giữ details.retryAfterSeconds', async () => {
    const { a } = build(() => {
      throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Thử lại sau.', { retryAfterSeconds: 60 });
    }, false);
    const res = await request(a).get('/boom');
    expect(res.body.error.details).toEqual({ retryAfterSeconds: 60 });
  });
});
