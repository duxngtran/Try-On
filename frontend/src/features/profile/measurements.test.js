import { describe, expect, it } from 'vitest';
import { parseHeight, parseWeight, validateMeasurements } from './measurements.js';

describe('parseWeight (D-13)', () => {
  it.each([
    ['52,5', 52.5],
    ['52.5', 52.5],
    ['  60 ', 60],
    ['30', 30],
    ['250', 250],
    ['52,0', 52],
  ])('nhận %j -> %d', (raw, expected) => {
    expect(parseWeight(raw)).toBe(expected);
  });

  it.each([
    '', // rỗng
    '   ',
    'abc',
    '52kg',
    '52.55', // 2 chữ số thập phân
    '52,55',
    '29.9', // dưới biên
    '250.1', // trên biên
    '-50',
    '1e2',
    '52,5,1',
    '.5',
    '5 2',
  ])('từ chối %j', (raw) => {
    expect(parseWeight(raw)).toBeNull();
  });

  it('không nhận null/undefined', () => {
    expect(parseWeight(null)).toBeNull();
    expect(parseWeight(undefined)).toBeNull();
  });
});

describe('parseHeight (D-13)', () => {
  it.each([
    ['165', 165],
    ['100', 100],
    ['250', 250],
  ])('nhận %j -> %d', (raw, expected) => {
    expect(parseHeight(raw)).toBe(expected);
  });

  it.each(['', 'abc', '99', '251', '165.5', '165,5', '-170', '1e2', '0170x'])(
    'từ chối %j',
    (raw) => {
      expect(parseHeight(raw)).toBeNull();
    },
  );
});

describe('validateMeasurements', () => {
  it('trả số (không phải chuỗi) khi hợp lệ', () => {
    expect(validateMeasurements({ height: '165', weight: '52,5' })).toEqual({
      values: { heightCm: 165, weightKg: 52.5 },
      errors: {},
    });
  });

  it('báo lỗi từng ô, ô còn lại vẫn hợp lệ', () => {
    const { errors } = validateMeasurements({ height: '', weight: '52.55' });
    expect(Object.keys(errors).sort()).toEqual(['heightCm', 'weightKg']);
    expect(validateMeasurements({ height: '170', weight: 'x' }).errors).toEqual({
      weightKg: 'Cân nặng phải từ 30 đến 250 kg.',
    });
  });
});
