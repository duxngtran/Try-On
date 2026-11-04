import { Link, Outlet } from 'react-router';

export function Layout() {
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
          <Link to="/" className="font-display text-[22px] font-semibold">
            Try-on
          </Link>
          {/* Điều hướng theo trạng thái đăng nhập: thêm ở US-01 */}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
