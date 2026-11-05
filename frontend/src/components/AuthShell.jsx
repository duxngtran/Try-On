import { Link } from 'react-router';

/**
 * Khung trang Đăng nhập/Đăng ký: header tối giản (chỉ logo), mobile không card,
 * tablet card giữa, desktop hai cột kèm slogan trang trí (screens/login.md).
 */
export function AuthShell({ title, subtitle, slogan, children }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex h-14 items-center justify-center border-b border-line lg:h-16">
        <Link
          to="/"
          aria-label="Try-on — Trang chủ"
          className="font-display text-[22px] font-semibold"
        >
          Try-on
        </Link>
      </header>
      <div className="flex flex-1 lg:grid lg:grid-cols-2">
        <div
          aria-hidden="true"
          className="hidden items-center justify-center bg-surface-muted p-12 lg:flex"
        >
          <p className="max-w-sm font-display text-[2.75rem] font-semibold leading-[3.25rem]">
            {slogan}
          </p>
        </div>
        <main
          id="main"
          className="flex flex-1 justify-center px-4 py-8 sm:items-start sm:py-12 lg:items-center"
        >
          <div className="w-full max-w-md sm:rounded-lg sm:border sm:border-line sm:bg-surface sm:p-8">
            <h1 className="font-display text-display font-semibold">{title}</h1>
            <p className="mt-2 text-body text-ink-muted">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
