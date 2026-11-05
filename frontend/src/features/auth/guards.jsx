import { Navigate, Outlet, useLocation } from 'react-router';
import { ConnectionError, FullPageLoader } from '../../components/FullPageMessage.jsx';
import { ForbiddenPage } from '../../pages/ForbiddenPage.jsx';
import { useAuth } from './authContext.js';
import { getGuestOnlyRedirect } from './redirects.js';

/**
 * Chặn mọi route trong lúc khôi phục phiên (loading) hoặc khi khôi phục lỗi mạng (error),
 * để không nháy form đăng nhập rồi mới chuyển (session-restore.md, header-navigation.md).
 */
export function SessionGate({ children }) {
  const { status, retryRestore, discardSession } = useAuth();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'error') {
    return <ConnectionError onRetry={retryRestore} onSignInAgain={discardSession} />;
  }
  return children;
}

function RedirectToLogin() {
  const { notice } = useAuth();
  const { pathname, search } = useLocation();
  // Sau đăng xuất không giữ trang cũ làm đích; hết phiên thì giữ để đăng nhập xong quay lại (AC-08).
  const state = notice === 'signed-out' ? { notice } : { from: `${pathname}${search}`, notice };
  return <Navigate to="/login" replace state={state} />;
}

/** Route cho người dùng thường: khách -> /login, admin -> /admin (D-38). */
export function RequireAuth() {
  const { status, user } = useAuth();
  if (status !== 'authenticated') return <RedirectToLogin />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  return <Outlet />;
}

/** Route cho admin: khách -> /login, user thường -> 403. */
export function RequireAdmin() {
  const { status, user } = useAuth();
  if (status !== 'authenticated') return <RedirectToLogin />;
  if (user.role !== 'admin') return <ForbiddenPage />;
  return <Outlet />;
}

/** /login, /register: người đã đăng nhập bị chuyển đi (D-33). */
export function GuestOnly() {
  const { status, user, postAuthTarget } = useAuth();
  if (status === 'authenticated') {
    return <Navigate to={postAuthTarget ?? getGuestOnlyRedirect(user)} replace />;
  }
  return <Outlet />;
}
