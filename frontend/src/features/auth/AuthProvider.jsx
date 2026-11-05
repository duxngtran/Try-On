import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { setUnauthorizedHandler } from '../../services/apiClient.js';
import { TOKEN_KEY, tokenStorage } from '../../services/tokenStorage.js';
import { AuthContext } from './authContext.js';
import { authApi } from './authApi.js';
import { getPostLoginPath } from './redirects.js';

const AUTH_PAGES = ['/login', '/register'];
const GUEST_STATE = { status: 'guest', user: null, postAuthTarget: null, notice: null };
const SESSION_EXPIRED_CODES = new Set(['UNAUTHORIZED', 'TOKEN_EXPIRED']);

/**
 * Giữ trạng thái phiên (token trong localStorage, khôi phục bằng /auth/me) và là nơi duy nhất xử lý
 * 401 toàn cục (session-restore.md). Phải nằm trong Router.
 *
 * Khi hết phiên, provider chỉ xóa phiên và đặt `notice`; route guard (RequireAuth/RequireAdmin)
 * mới chuyển về /login kèm `from` + thông báo, nên trang công khai không bị đẩy đi và không có
 * hai lần điều hướng giành nhau.
 */
export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const handlingUnauthorized = useRef(false);
  const [state, setState] = useState(() => ({
    ...GUEST_STATE,
    status: tokenStorage.get() ? 'loading' : 'guest',
  }));
  const statusRef = useRef(state.status);

  useEffect(() => {
    statusRef.current = state.status;
  });

  // `postAuthTarget` chỉ cần tới khi rời trang đăng nhập/đăng ký; xóa để lần vào /login sau dùng đích mặc định.
  const { pathname } = location;
  const hasPostAuthTarget = state.postAuthTarget !== null;
  useEffect(() => {
    if (hasPostAuthTarget && !AUTH_PAGES.includes(pathname)) {
      setState((prev) => ({ ...prev, postAuthTarget: null }));
    }
  }, [hasPostAuthTarget, pathname]);

  const clearSession = useCallback((notice = null) => {
    tokenStorage.clear();
    setState({ ...GUEST_STATE, notice });
  }, []);

  // 401 từ API client: xóa phiên, chỉ một lần dù nhiều request song song cùng 401.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (handlingUnauthorized.current) return;
      handlingUnauthorized.current = true;
      clearSession('session-expired');
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const restoreSession = useCallback(
    async (signal) => {
      try {
        const user = await authApi.me({ signal });
        setState({ status: 'authenticated', user, postAuthTarget: null, notice: null });
      } catch (error) {
        if (error.code === 'CANCELED') return;
        if (error.status === 401 && SESSION_EXPIRED_CODES.has(error.code)) {
          clearSession('session-expired'); // guard sẽ chuyển về /login nếu route cần đăng nhập
          return;
        }
        // Mạng/5xx: giữ token, cho người dùng thử lại (không đăng xuất vì mạng chập chờn)
        setState((prev) => ({ ...prev, status: 'error' }));
      }
    },
    [clearSession],
  );

  useEffect(() => {
    if (!tokenStorage.get()) return undefined;
    const controller = new AbortController();
    restoreSession(controller.signal);
    return () => controller.abort();
  }, [restoreSession]);

  // Đăng xuất ở tab khác (khóa token bị xóa) -> tab này cũng thoát về /login
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== TOKEN_KEY || event.newValue || statusRef.current !== 'authenticated')
        return;
      clearSession('signed-out');
      navigate('/login', { replace: true, state: { notice: 'signed-out' } });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [navigate, clearSession]);

  const startSession = useCallback(
    ({ token, user }, target) => {
      handlingUnauthorized.current = false;
      tokenStorage.set(token);
      // Một setState duy nhất kèm `postAuthTarget` để GuestOnly cũng chuyển đúng đích dù render trước navigate.
      setState({ status: 'authenticated', user, postAuthTarget: target, notice: null });
      navigate(target, { replace: true });
    },
    [navigate],
  );

  const login = useCallback(
    async (credentials, { from } = {}) => {
      const session = await authApi.login(credentials);
      startSession(session, getPostLoginPath({ user: session.user, from }));
    },
    [startSession],
  );

  const register = useCallback(
    async (credentials) => {
      const session = await authApi.register(credentials);
      startSession(session, getPostLoginPath({ user: session.user, source: 'register' }));
    },
    [startSession],
  );

  const logout = useCallback(() => {
    clearSession('signed-out');
    navigate('/login', { replace: true, state: { notice: 'signed-out' } });
  }, [clearSession, navigate]);

  const retryRestore = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    restoreSession();
  }, [restoreSession]);

  // "Đăng nhập lại" ở màn lỗi kết nối: bỏ token cũ, vào /login (không kèm thông báo)
  const discardSession = useCallback(() => {
    clearSession();
    navigate('/login', { replace: true });
  }, [clearSession, navigate]);

  // Hồ sơ (US-02) là nguồn sự thật của profileCompleted; đồng bộ để guard/menu không phải gọi lại /auth/me.
  const setProfileCompleted = useCallback((profileCompleted) => {
    setState((prev) =>
      prev.user && prev.user.profileCompleted !== profileCompleted
        ? { ...prev, user: { ...prev.user, profileCompleted } }
        : prev,
    );
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      login,
      register,
      logout,
      retryRestore,
      discardSession,
      setProfileCompleted,
    }),
    [state, login, register, logout, retryRestore, discardSession, setProfileCompleted],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
