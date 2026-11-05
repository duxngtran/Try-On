const AUTH_PAGES = new Set(['/login', '/register']);
// Ký tự điều khiển (kể cả tab/xuống dòng mà trình duyệt có thể lược bỏ khi phân tích URL)
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Chỉ nhận đường dẫn nội bộ (chống open redirect), không phải trang login/register
 * (post-login-navigation.md).
 */
export function isSafeInternalPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return false;
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  if (path.includes('://') || path.includes('\\') || CONTROL_CHARS.test(path)) return false;
  const pathname = path.split(/[?#]/)[0];
  return !AUTH_PAGES.has(pathname);
}

const isAdminPath = (path) => /^\/admin(?:[/?#]|$)/.test(path);

/**
 * Đích sau đăng nhập/đăng ký (post-login-navigation.md §1).
 * @param {{ user: { role: string, profileCompleted: boolean }, from?: unknown, source?: 'login' | 'register' }} input
 */
export function getPostLoginPath({ user, from, source = 'login' }) {
  if (source === 'register') return '/profile'; // D-16: onboarding
  const isAdmin = user.role === 'admin';
  // Hợp vai: from bắt đầu /admin <=> role admin (tránh vòng lặp login <-> 403)
  if (isSafeInternalPath(from) && isAdminPath(from) === isAdmin) return from;
  if (isAdmin) return '/admin';
  return user.profileCompleted ? '/' : '/profile';
}

/** Đích khi người đã đăng nhập vào trang chỉ dành cho khách (/login, /register — D-33). */
export function getGuestOnlyRedirect(user) {
  return user.role === 'admin' ? '/admin' : '/';
}
