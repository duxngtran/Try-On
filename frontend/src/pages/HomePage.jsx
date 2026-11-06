import { Link } from 'react-router';
import { Silhouette } from '../components/Silhouette.jsx';
import { useAuth } from '../features/auth/authContext.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

/** Trang chủ (screens/home.md, entry-points.md): card Phòng thử đồ dẫn tới /try-on. */
export function HomePage() {
  const { user } = useAuth();
  usePageTitle('Trang chủ');
  return (
    <section className="mx-auto max-w-2xl py-4 lg:max-w-none">
      <h1 className="font-display text-display font-semibold">Xin chào</h1>
      <p className="mt-1 truncate text-body text-ink-muted" title={user.email}>
        {user.email}
      </p>

      {!user.profileCompleted && (
        <div role="status" className="mt-6 rounded-lg bg-accent-soft p-5">
          <p className="font-semibold">Hoàn thiện hồ sơ để bắt đầu thử đồ</p>
          <p className="mt-1 text-small text-ink-muted">Thêm ảnh toàn thân và số đo của bạn.</p>
          <Link
            to="/profile"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-ink px-5 text-small font-semibold text-ink-inverse hover:bg-[#333]"
          >
            Hoàn thiện hồ sơ
          </Link>
        </div>
      )}

      <div className="mt-6 flex items-center gap-6 overflow-hidden rounded-lg border border-line bg-gradient-to-br from-surface-muted to-accent-soft p-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold">Phòng thử đồ</h2>
          <p className="mt-2 max-w-prose text-body text-ink-muted">
            Chọn danh mục để xem bạn mặc thử sản phẩm.
          </p>
          <Link
            to="/try-on"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-ink px-5 text-small font-semibold text-ink-inverse hover:bg-[#333]"
          >
            Vào phòng thử đồ
          </Link>
          {user.profileCompleted && (
            <p className="mt-3 text-small text-success">Hồ sơ của bạn đã sẵn sàng.</p>
          )}
        </div>
        <Silhouette className="hidden h-32 shrink-0 sm:block" />
      </div>
    </section>
  );
}
