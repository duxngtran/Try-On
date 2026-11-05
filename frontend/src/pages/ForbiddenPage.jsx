import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { usePageTitle } from '../hooks/usePageTitle.js';

export function ForbiddenPage() {
  usePageTitle('Không có quyền');
  return (
    <section className="flex flex-col items-center py-12 text-center">
      <ShieldAlert size={40} aria-hidden="true" className="text-ink-subtle" />
      <h1 className="mt-4 font-display text-display font-semibold">Bạn không có quyền truy cập.</h1>
      <p className="mt-3 text-body text-ink-muted">Trang này chỉ dành cho quản trị viên.</p>
      <Link
        to="/"
        className="mt-6 inline-flex h-11 items-center rounded-md bg-ink px-5 text-small font-semibold text-ink-inverse hover:bg-[#333]"
      >
        Về trang chủ
      </Link>
    </section>
  );
}
