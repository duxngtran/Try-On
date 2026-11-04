import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="py-12 text-center">
      <h1 className="font-display text-display font-semibold">Không tìm thấy trang</h1>
      <p className="mt-3 text-body text-ink-muted">Đường dẫn không tồn tại hoặc đã được di chuyển.</p>
      <Link to="/" className="mt-6 inline-block text-small font-semibold text-accent-strong underline hover:text-ink">
        Về trang chủ
      </Link>
    </section>
  );
}
