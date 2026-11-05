import { useCallback, useEffect, useState } from 'react';
import { Boxes, CheckCircle2, ClipboardList, Tags } from 'lucide-react';
import { Spinner } from '../components/Spinner.jsx';
import { authApi } from '../features/auth/authApi.js';
import { useAuth } from '../features/auth/authContext.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

const COMING_SOON = [
  { icon: Tags, title: 'Danh mục', text: 'Quản lý danh mục trang phục.' },
  { icon: Boxes, title: 'Sản phẩm', text: 'Thêm và chỉnh sửa sản phẩm.' },
  { icon: ClipboardList, title: 'Đơn hàng', text: 'Theo dõi đơn hàng của khách.' },
];

/** Gọi /admin/ping khi vào trang; không chặn hiển thị. 401 do handler toàn cục xử lý. */
function usePing() {
  const [state, setState] = useState('checking'); // checking | ok | error
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    authApi
      .adminPing()
      .then(() => active && setState('ok'))
      .catch(() => active && setState('error'));
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState('checking');
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}

/** Placeholder quản trị (screens/admin.md). */
export function AdminPage() {
  const { user } = useAuth();
  const { state, retry } = usePing();
  usePageTitle('Quản trị');

  return (
    <section className="mx-auto max-w-2xl py-4 lg:max-w-none">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-display font-semibold">Khu vực quản trị</h1>
        <span className="rounded-sm bg-accent-soft px-2 py-0.5 text-caption font-semibold uppercase tracking-wider text-accent-strong">
          Admin
        </span>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <p className="text-body">Bạn đã đăng nhập với quyền quản trị.</p>
        <p className="mt-1 break-all text-small text-ink-muted">{user.email}</p>
        <div role="status" className="mt-3 flex items-center gap-2 text-small">
          {state === 'checking' && (
            <>
              <Spinner label="" />
              <span className="text-ink-muted">Đang kiểm tra quyền…</span>
            </>
          )}
          {state === 'ok' && (
            <>
              <CheckCircle2 size={16} aria-hidden="true" className="text-success" />
              <span className="text-success">Quyền quản trị hợp lệ</span>
            </>
          )}
          {state === 'error' && (
            <>
              <span className="text-danger">Không kiểm tra được kết nối.</span>
              <button
                type="button"
                onClick={retry}
                className="font-semibold text-accent-strong underline hover:text-ink"
              >
                Thử lại
              </button>
            </>
          )}
        </div>
      </div>

      <h2 className="mt-8 text-title font-semibold">Sắp có</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COMING_SOON.map(({ icon: Icon, title, text }) => (
          <li
            key={title}
            aria-disabled="true"
            className="rounded-lg bg-surface-muted p-4 text-ink-muted"
          >
            <div className="flex items-center justify-between">
              <Icon size={20} aria-hidden="true" />
              <span className="text-caption font-semibold uppercase tracking-wider">
                Sắp ra mắt
              </span>
            </div>
            <p className="mt-3 font-semibold text-ink">{title}</p>
            <p className="text-small">{text}</p>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-small text-ink-muted">
        Quản trị viên không xem được ảnh và số đo của người dùng.
      </p>
    </section>
  );
}
