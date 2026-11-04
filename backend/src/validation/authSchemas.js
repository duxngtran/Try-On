import { z } from 'zod';

// Bộ quy tắc này được chép sang frontend/src/features/auth/authSchemas.js (D-21).
// Sửa một nơi thì phải sửa nơi kia và bảng case ở cả hai file test.

export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

const MSG = {
  emailRequired: 'Vui lòng nhập email.',
  emailInvalid: 'Email không hợp lệ.',
  emailTooLong: 'Email quá dài.',
  passwordLength: 'Mật khẩu phải từ 8 đến 72 ký tự.',
  passwordCharset: 'Mật khẩu chỉ gồm chữ không dấu, số và ký hiệu.',
  passwordStrength: 'Mật khẩu phải có ít nhất 1 chữ cái và 1 chữ số.',
  passwordSameAsEmail: 'Mật khẩu không được trùng với email.',
  loginPasswordRequired: 'Vui lòng nhập mật khẩu.',
  loginPasswordTooLong: 'Mật khẩu tối đa 72 ký tự.',
};

/** Email chuẩn hóa: trim + lowercase; mỗi lần chỉ báo một lỗi (thứ tự: rỗng, quá dài, định dạng). */
export const emailSchema = z
  .string({ error: (iss) => (iss.input === undefined ? MSG.emailRequired : MSG.emailInvalid) })
  .trim()
  .toLowerCase()
  .check((ctx) => {
    const value = ctx.value;
    let message = null;
    if (value.length === 0) message = MSG.emailRequired;
    else if (value.length > EMAIL_MAX) message = MSG.emailTooLong;
    else if (!EMAIL_PATTERN.test(value)) message = MSG.emailInvalid;
    if (message) ctx.issues.push({ code: 'custom', message, input: value });
  });

/** Lỗi đầu tiên của mật khẩu đăng ký theo thứ tự ưu tiên của bảng validation (US-01 §6), hoặc null. */
export function firstPasswordProblem(password) {
  if (typeof password !== 'string') return MSG.passwordLength;
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return MSG.passwordLength;
  if (!PRINTABLE_ASCII.test(password)) return MSG.passwordCharset;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return MSG.passwordStrength;
  return null;
}

const registerPasswordSchema = z.any().check((ctx) => {
  const message = firstPasswordProblem(ctx.value);
  if (message) ctx.issues.push({ code: 'custom', message, input: ctx.value });
});

// z.object mặc định bỏ trường lạ (kể cả `role`, `confirmPassword`) — AC-04.
export const registerSchema = z
  .object({ email: emailSchema, password: registerPasswordSchema })
  .check((ctx) => {
    const { email, password } = ctx.value;
    // Chỉ so khi cả hai hợp lệ (nếu một trong hai lỗi thì đã có lỗi riêng ở trường đó).
    if (
      typeof email === 'string' &&
      typeof password === 'string' &&
      password.toLowerCase() === email
    ) {
      ctx.issues.push({
        code: 'custom',
        message: MSG.passwordSameAsEmail,
        path: ['password'],
        input: password,
      });
    }
  });

const loginPasswordSchema = z.any().check((ctx) => {
  const value = ctx.value;
  let message = null;
  if (typeof value !== 'string' || value.length === 0) message = MSG.loginPasswordRequired;
  else if (value.length > PASSWORD_MAX) message = MSG.loginPasswordTooLong;
  if (message) ctx.issues.push({ code: 'custom', message, input: value });
});

export const loginSchema = z.object({ email: emailSchema, password: loginPasswordSchema });
