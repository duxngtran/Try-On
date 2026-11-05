import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../features/auth/authContext.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

export function NotFoundPage() {
  const { status, user } = useAuth();
  usePageTitle('Không tìm thấy trang');
  // Khách -> /login, user -> /, admin -> /admin (header-navigation.md)
  const home = status !== 'authenticated' ? '/login' : user.role === 'admin' ? '/admin' : '/';
  return (
    <section className="flex flex-col items-center py-12 text-center">
      <SearchX size={40} aria-hidden="true" className="text-ink-subtle" />
      <h1 className="mt-4 font-display text-display font-semibold">Không tìm thấy trang</h1>
      <p className="mt-3 text-body text-ink-muted">
        Đường dẫn này không tồn tại hoặc đã được di chuyển.
      </p>
      <Link
        to={home}
        className="mt-6 inline-flex h-11 items-center rounded-md bg-ink px-5 text-small font-semibold text-ink-inverse hover:bg-[#333]"
      >
        {status === 'authenticated' ? 'Về trang chủ' : 'Đến trang đăng nhập'}
      </Link>
    </section>
  );
}
