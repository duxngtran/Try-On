import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema, validateRegisterForm } from './authSchemas.js';

// BẢNG CASE DÙNG CHUNG với backend/tests/authSchemas.test.js (D-21): giữ hai bảng giống hệt nhau.
const EMAIL_CASES = [
  { name: 'hợp lệ', email: 'a@example.com', expected: 'a@example.com' },
  { name: 'trim + lowercase', email: '  A@Example.COM ', expected: 'a@example.com' },
  { name: 'rỗng', email: '', error: 'Vui lòng nhập email.' },
  { name: 'chỉ khoảng trắng', email: '   ', error: 'Vui lòng nhập email.' },
  { name: 'thiếu @', email: 'abc.example.com', error: 'Email không hợp lệ.' },
  { name: 'hai @', email: 'a@b@example.com', error: 'Email không hợp lệ.' },
  { name: 'domain không có dấu chấm', email: 'a@example', error: 'Email không hợp lệ.' },
  { name: 'TLD 1 ký tự', email: 'a@example.c', error: 'Email không hợp lệ.' },
  { name: 'khoảng trắng bên trong', email: 'a b@example.com', error: 'Email không hợp lệ.' },
  {
    name: '254 ký tự',
    email: `${'a'.repeat(242)}@example.com`,
    expected: `${'a'.repeat(242)}@example.com`,
  },
  { name: '255 ký tự', email: `${'a'.repeat(243)}@example.com`, error: 'Email quá dài.' },
];

const PASSWORD_CASES = [
  { name: '8 ký tự hợp lệ', password: 'abcdefg1', ok: true },
  { name: '72 ký tự ASCII', password: `${'a'.repeat(71)}1`, ok: true },
  { name: '7 ký tự', password: 'abcdef1', error: 'Mật khẩu phải từ 8 đến 72 ký tự.' },
  { name: '73 ký tự', password: `${'a'.repeat(72)}1`, error: 'Mật khẩu phải từ 8 đến 72 ký tự.' },
  { name: 'rỗng', password: '', error: 'Mật khẩu phải từ 8 đến 72 ký tự.' },
  {
    name: 'thiếu số',
    password: 'abcdefgh',
    error: 'Mật khẩu phải có ít nhất 1 chữ cái và 1 chữ số.',
  },
  {
    name: 'thiếu chữ',
    password: '12345678',
    error: 'Mật khẩu phải có ít nhất 1 chữ cái và 1 chữ số.',
  },
  {
    name: 'chữ có dấu',
    password: 'matkhau1é',
    error: 'Mật khẩu chỉ gồm chữ không dấu, số và ký hiệu.',
  },
  {
    name: 'emoji',
    password: 'abcdef12😀',
    error: 'Mật khẩu chỉ gồm chữ không dấu, số và ký hiệu.',
  },
  {
    name: 'ký tự điều khiển (tab)',
    password: 'abcdef1\t2',
    error: 'Mật khẩu chỉ gồm chữ không dấu, số và ký hiệu.',
  },
  { name: 'khoảng trắng bên trong được phép', password: 'abc def1', ok: true },
  // Ưu tiên lỗi theo thứ tự bảng: độ dài > ký tự > độ mạnh
  {
    name: 'ngắn và có dấu -> báo độ dài',
    password: 'é1',
    error: 'Mật khẩu phải từ 8 đến 72 ký tự.',
  },
  {
    name: 'có dấu và thiếu số -> báo ký tự',
    password: 'abcdefghé',
    error: 'Mật khẩu chỉ gồm chữ không dấu, số và ký hiệu.',
  },
];

const fieldErrors = (result) => {
  const out = {};
  for (const i of result.error.issues) out[i.path.join('.')] ??= i.message;
  return out;
};

describe('registerSchema (bảng case dùng chung FE/BE)', () => {
  it.each(EMAIL_CASES)('email: $name', ({ email, expected, error }) => {
    const result = registerSchema.safeParse({ email, password: 'abcdefg1' });
    if (error) expect(fieldErrors(result).email).toBe(error);
    else expect(result.data.email).toBe(expected);
  });

  it.each(PASSWORD_CASES)('mật khẩu: $name', ({ password, ok, error }) => {
    const result = registerSchema.safeParse({ email: 'a@example.com', password });
    if (ok) expect(result.success).toBe(true);
    else expect(fieldErrors(result).password).toBe(error);
  });

  it('mật khẩu trùng email (không phân biệt hoa thường, sau chuẩn hóa)', () => {
    const result = registerSchema.safeParse({
      email: ' User1234@Example.com ',
      password: 'USER1234@example.com',
    });
    expect(fieldErrors(result).password).toBe('Mật khẩu không được trùng với email.');
  });

  it('bỏ trường thừa, đặc biệt role (AC-04)', () => {
    const result = registerSchema.safeParse({
      email: 'a@example.com',
      password: 'abcdefg1',
      role: 'admin',
      confirmPassword: 'x',
    });
    expect(result.data).toEqual({ email: 'a@example.com', password: 'abcdefg1' });
  });

  it('thiếu trường hoặc sai kiểu -> lỗi theo trường, không ném exception', () => {
    const result = registerSchema.safeParse({ email: 123, password: { $ne: '' } });
    expect(result.success).toBe(false);
    expect(Object.keys(fieldErrors(result)).sort()).toEqual(['email', 'password']);
  });
});

describe('loginSchema', () => {
  it('không áp quy tắc độ mạnh/ASCII (mật khẩu có dấu chỉ là sai)', () => {
    expect(loginSchema.safeParse({ email: 'a@example.com', password: 'é' }).success).toBe(true);
  });

  it('mật khẩu rỗng hoặc > 72 ký tự bị từ chối', () => {
    const empty = loginSchema.safeParse({ email: 'a@example.com', password: '' });
    expect(fieldErrors(empty).password).toBe('Vui lòng nhập mật khẩu.');
    const long = loginSchema.safeParse({ email: 'a@example.com', password: 'a'.repeat(73) });
    expect(fieldErrors(long).password).toBe('Mật khẩu tối đa 72 ký tự.');
  });

  it('chuẩn hóa email như đăng ký', () => {
    expect(loginSchema.parse({ email: ' A@B.CO ', password: 'x' }).email).toBe('a@b.co');
  });
});

describe('validateRegisterForm (chỉ có ở FE)', () => {
  const base = { email: 'a@example.com', password: 'abcdefg1' };

  it('nhập lại khớp thì không có lỗi', () => {
    expect(validateRegisterForm({ ...base, confirmPassword: 'abcdefg1' })).toEqual({});
  });

  it.each([
    ['rỗng', ''],
    ['không khớp', 'abcdefg2'],
    ['khác hoa thường', 'ABCDEFG1'],
  ])('nhập lại %s -> lỗi', (_name, confirmPassword) => {
    expect(validateRegisterForm({ ...base, confirmPassword }).confirmPassword).toBe(
      'Mật khẩu nhập lại không khớp.',
    );
  });
});
