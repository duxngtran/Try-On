import { Shirt } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../features/auth/authContext.js';
import { CartIndicator } from '../features/cart/CartIndicator.jsx';
import { CartNotice } from '../features/cart/CartNotice.jsx';
import { AccountMenu } from './AccountMenu.jsx';

const NAV_BASE =
  'h-11 items-center border-b-2 border-transparent px-1 text-small font-semibold text-ink';
const NAV_LINK = `hidden ${NAV_BASE} sm:inline-flex`;
const navClass = ({ isActive }) => `${NAV_LINK} ${isActive ? '!border-ink' : 'hover:underline'}`;
// Liên kết Thử đồ luôn hiện (cả mobile): đây là chức năng chính của người mua (entry-points.md).
const tryOnClass = ({ isActive }) =>
  `${NAV_BASE} inline-flex gap-1.5 ${isActive ? '!border-ink' : 'hover:underline'}`;
const AUTH_BUTTON =
  'inline-flex h-11 items-center rounded-md px-4 text-small font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

function HeaderActions() {
  const { status, user } = useAuth();
  const { pathname } = useLocation();
  if (status !== 'authenticated') {
    return (
      <div className="flex items-center gap-1">
        <Link
          to="/login"
          aria-current={pathname === '/login' ? 'page' : undefined}
          className={`${AUTH_BUTTON} text-ink hover:underline`}
        >
          Đăng nhập
        </Link>
        <Link
          to="/register"
          aria-current={pathname === '/register' ? 'page' : undefined}
          className={`${AUTH_BUTTON} bg-ink text-ink-inverse hover:bg-[#333]`}
        >
          Đăng ký
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <nav aria-label="Điều hướng chính" className="flex items-center gap-4">
        {user.role === 'admin' ? (
          <NavLink to="/admin" className={navClass}>
            Quản trị
          </NavLink>
        ) : (
          <>
            <NavLink to="/" end className={navClass}>
              Trang chủ
            </NavLink>
            <NavLink to="/try-on" className={tryOnClass}>
              <Shirt size={16} aria-hidden="true" className="hidden sm:inline" />
              Thử đồ
            </NavLink>
            <NavLink to="/profile" className={navClass}>
              Hồ sơ
              {!user.profileCompleted && (
                <>
                  <span aria-hidden="true" className="ml-1.5 h-2 w-2 rounded-full bg-warning" />
                  <span className="sr-only">(chưa đầy đủ)</span>
                </>
              )}
            </NavLink>
          </>
        )}
      </nav>
      {user.role === 'user' && <CartIndicator />}
      <AccountMenu />
    </div>
  );
}

/** Khung chung: skip link, header theo vai, vùng nội dung (header-navigation.md). */
export function Layout() {
  const { status, user } = useAuth();

  const logoTarget = status === 'authenticated' && user.role === 'admin' ? '/admin' : '/';

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-60 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        Bỏ qua điều hướng
      </a>
      <header className="sticky top-0 z-30 h-14 border-b border-line bg-canvas lg:h-16">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 md:px-6 lg:px-8">
          <Link
            to={logoTarget}
            aria-label="Try-on — Trang chủ"
            className="font-display text-[22px] font-semibold"
          >
            Try-on
          </Link>
          <HeaderActions />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none md:px-6 lg:px-8"
      >
        <Outlet />
      </main>
      <CartNotice />
      <footer className="border-t border-line py-6 text-center text-small text-ink-muted">
        © Try-on
      </footer>
    </div>
  );
}
