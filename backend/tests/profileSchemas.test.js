import { describe, it, expect } from 'vitest';
import { consentSchema, measurementsSchema } from '../src/validation/profileSchemas.js';

const parse = (heightCm, weightKg) => measurementsSchema.safeParse({ heightCm, weightKg });
const fieldsWithError = (result) => result.error.issues.map((i) => i.path.join('.'));

describe('measurementsSchema (AC-07, AC-08, D-13)', () => {
  it.each([
    [100, 30],
    [250, 250],
    [165, 52.5],
    [165, 52],
    [170, 30.1],
  ])('nhận chiều cao %s, cân nặng %s', (h, w) => {
    expect(parse(h, w)).toMatchObject({ success: true, data: { heightCm: h, weightKg: w } });
  });

  it.each([
    [99, 'heightCm'],
    [90, 'heightCm'],
    [251, 'heightCm'],
    [165.5, 'heightCm'],
    ['165', 'heightCm'],
    [null, 'heightCm'],
    [-1, 'heightCm'],
    [Infinity, 'heightCm'],
  ])('từ chối chiều cao %j', (h, field) => {
    const result = parse(h, 52.5);
    expect(result.success).toBe(false);
    expect(fieldsWithError(result)).toEqual([field]);
    expect(result.error.issues[0].message).toBe('Chiều cao phải từ 100 đến 250 cm.');
  });

  it.each([29.9, 25, 250.1, 52.55, 52.51, '52.5', null, 0, -52.5, Number.POSITIVE_INFINITY])(
    'từ chối cân nặng %j (kể cả > 1 chữ số thập phân: numeric(4,1) sẽ tự làm tròn 52.55 thành 52.6)',
    (w) => {
      const result = parse(165, w);
      expect(result.success).toBe(false);
      expect(fieldsWithError(result)).toEqual(['weightKg']);
      expect(result.error.issues[0].message).toBe('Cân nặng phải từ 30 đến 250 kg.');
    },
  );

  it('thiếu một trong hai trường -> lỗi đúng trường; bỏ qua trường thừa', () => {
    expect(fieldsWithError(measurementsSchema.safeParse({ heightCm: 165 }))).toEqual(['weightKg']);
    const parsed = measurementsSchema.parse({
      heightCm: 165,
      weightKg: 52.5,
      userId: 'x',
      photoPath: 'y',
    });
    expect(parsed).toEqual({ heightCm: 165, weightKg: 52.5 });
  });
});

describe('consentSchema (D-22)', () => {
  it.each([[{ accepted: true }, true]])('nhận %j', (body, expected) => {
    expect(consentSchema.safeParse(body).success).toBe(expected);
  });

  it.each([{ accepted: false }, { accepted: 'true' }, { accepted: 1 }, {}])(
    'từ chối %j (phải đúng literal true)',
    (body) => {
      expect(consentSchema.safeParse(body).success).toBe(false);
    },
  );
});
