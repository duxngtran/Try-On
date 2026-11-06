import { describe, it, expect } from 'vitest';
import {
  consentBodySchema,
  createJobBodySchema,
  decodeCursor,
  encodeCursor,
  listProductsQuerySchema,
} from '../src/validation/tryonSchemas.js';

const ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('con trỏ', () => {
  it('khứ hồi giữ nguyên chuỗi created_at, kể cả micro giây và các dạng offset của Postgres', () => {
    for (const createdAtRaw of [
      '2026-11-06 02:00:00.893014+00',
      '2026-11-06T02:00:00.893014+00:00',
      '2026-11-06 02:00:00+07',
      '2026-11-06T02:00:00.1Z',
    ]) {
      expect(decodeCursor(encodeCursor({ createdAtRaw, id: ID }))).toEqual({
        createdAt: createdAtRaw,
        id: ID,
      });
    }
  });

  it.each([
    ['không phải chuỗi', 42],
    ['rỗng', ''],
    ['ký tự ngoài base64url', 'abc$%^'],
    ['không phải JSON', Buffer.from('xyz').toString('base64url')],
    ['thiếu trường', b64({ c: '2026-11-06 02:00:00+00' })],
    ['id không phải UUID', b64({ c: '2026-11-06 02:00:00+00', i: 'abc' })],
    ['thời gian sai định dạng (Postgres sẽ báo 22007)', b64({ c: 'hôm qua', i: ID })],
    ['SQL trong thời gian', b64({ c: "2026-11-06 02:00:00+00'; drop table x;--", i: ID })],
    ['quá dài', 'a'.repeat(201)],
  ])('từ chối: %s', (name, value) => {
    expect(decodeCursor(value)).toBeNull();
  });
});

describe('query danh sách sản phẩm', () => {
  const cursor = encodeCursor({ createdAtRaw: '2026-11-06 02:00:00+00', id: ID });

  it('mặc định limit 20; chấp nhận biên 1 và 50', () => {
    expect(listProductsQuerySchema.parse({}).limit).toBe(20);
    expect(listProductsQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(listProductsQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  it.each(['0', '51', '-1', '1.5', 'abc', ['1', '2']])('limit %j bị từ chối', (limit) => {
    expect(listProductsQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('tối đa một trong after, before, at', () => {
    expect(listProductsQuerySchema.safeParse({ after: cursor }).success).toBe(true);
    expect(listProductsQuerySchema.safeParse({ at: ID }).success).toBe(true);
    for (const q of [
      { after: cursor, before: cursor },
      { after: cursor, at: ID },
      { before: cursor, at: ID },
    ]) {
      expect(listProductsQuerySchema.safeParse(q).success).toBe(false);
    }
  });

  it('con trỏ hỏng và at không phải UUID bị từ chối', () => {
    expect(listProductsQuerySchema.safeParse({ after: 'rac' }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ at: 'abc' }).success).toBe(false);
  });
});

describe('body', () => {
  it('consent: chỉ true mới hợp lệ, trường thừa bị bỏ', () => {
    expect(consentBodySchema.parse({ accepted: true, userId: 'x' })).toEqual({ accepted: true });
    for (const v of [false, 'true', 1, null, undefined]) {
      expect(consentBodySchema.safeParse({ accepted: v }).success).toBe(false);
    }
  });

  it('job: purpose mặc định display; chỉ display hoặc prefetch; trường thừa bị bỏ', () => {
    expect(createJobBodySchema.parse({})).toEqual({ purpose: 'display' });
    expect(createJobBodySchema.parse({ purpose: 'prefetch', photoVersion: 9 })).toEqual({
      purpose: 'prefetch',
    });
    expect(createJobBodySchema.safeParse({ purpose: 'DISPLAY' }).success).toBe(false);
    expect(createJobBodySchema.safeParse({ purpose: null }).success).toBe(false);
  });
});
