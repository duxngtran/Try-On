const GENERIC = 'Có lỗi xảy ra, vui lòng thử lại.';
const OFFLINE = 'Mất kết nối, vui lòng kiểm tra mạng và thử lại.';
const RATE_LIMITED = 'Bạn thao tác quá nhanh, vui lòng thử lại sau.';
const FALLBACK_COOLDOWN_SECONDS = 10; // D-34: BE thiếu retryAfterSeconds thì khóa nút 10 giây

/**
 * Chuyển lỗi API của form đăng nhập/đăng ký thành cách hiển thị (screens/login.md, register.md).
 * @param {{ status?: number, code?: string, message?: string, details?: unknown }} error
 * @returns {{
 *   fieldErrors: Record<string, string>,
 *   general: { variant: 'danger' | 'warning', message: string } | null,
 *   cooldownSeconds: number | null,
 *   clearPasswords: boolean,
 * }}
 */
export function mapAuthError(error) {
  const result = { fieldErrors: {}, general: null, cooldownSeconds: null, clearPasswords: false };
  const retryAfter = Number(error?.details?.retryAfterSeconds);
  const hasRetryAfter = Number.isFinite(retryAfter) && retryAfter > 0;

  switch (error?.code) {
    case 'VALIDATION_ERROR': {
      const details = Array.isArray(error.details) ? error.details : [];
      const known = details.filter((d) => d.field === 'email' || d.field === 'password');
      for (const d of known) result.fieldErrors[d.field] ??= d.message;
      if (known.length === 0) result.general = { variant: 'danger', message: GENERIC };
      return result;
    }
    case 'EMAIL_ALREADY_EXISTS':
      result.fieldErrors.email = 'Email này đã được đăng ký.';
      return result;
    case 'INVALID_CREDENTIALS':
      result.general = { variant: 'danger', message: 'Email hoặc mật khẩu không đúng.' };
      result.clearPasswords = true;
      return result;
    case 'TOO_MANY_ATTEMPTS': {
      const seconds = hasRetryAfter ? retryAfter : FALLBACK_COOLDOWN_SECONDS;
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      result.general = {
        variant: 'warning',
        message: `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
      };
      result.cooldownSeconds = seconds;
      return result;
    }
    case 'TOO_MANY_REQUESTS':
      result.general = { variant: 'warning', message: RATE_LIMITED };
      result.cooldownSeconds = hasRetryAfter ? retryAfter : FALLBACK_COOLDOWN_SECONDS;
      return result;
    case 'NETWORK_ERROR':
      result.general = { variant: 'danger', message: OFFLINE };
      result.clearPasswords = true;
      return result;
    default:
      result.general = {
        variant: 'danger',
        message: error?.status >= 500 || !error?.message ? GENERIC : error.message,
      };
      result.clearPasswords = true;
      return result;
  }
}
