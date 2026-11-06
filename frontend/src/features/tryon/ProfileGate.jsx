import { useEffect, useRef } from 'react';
import { Circle, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert.jsx';

const ITEMS = {
  photo: { label: 'Ảnh toàn thân', to: '/profile#photo' },
  measurements: { label: 'Chiều cao và cân nặng', to: '/profile#measurements' },
};
const ORDER = ['photo', 'measurements'];

/**
 * Cổng hồ sơ G1 (screens/try-on-room.md): hồ sơ chưa đủ thì không có sân khấu, không gọi /categories.
 * `midway`: tới từ lỗi 409 giữa chừng (E2/E9), kèm cảnh báo và focus vào `h2`.
 */
export function ProfileGate({ missing, midway = false }) {
  const headingRef = useRef(null);
  useEffect(() => {
    if (midway) headingRef.current?.focus();
  }, [midway]);

  const keys = ORDER.filter((key) => missing.includes(key));
  const shown = keys.length > 0 ? keys : ORDER;
  return (
    <section
      aria-labelledby="profile-gate-title"
      className="mx-auto mt-6 max-w-xl rounded-xl border border-line bg-surface p-6 shadow-card"
    >
      {midway && (
        <Alert variant="warning" role="alert" className="mb-4">
          {missing.includes('photo')
            ? 'Hồ sơ của bạn vừa thay đổi, phần ảnh thử đồ đã được gỡ khỏi màn hình.'
            : 'Hồ sơ của bạn chưa đầy đủ.'}
        </Alert>
      )}
      <UserRound size={40} aria-hidden="true" className="text-ink-subtle" />
      <h2
        id="profile-gate-title"
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 font-display text-title font-semibold focus:outline-none"
      >
        Hoàn thiện hồ sơ để bắt đầu thử đồ
      </h2>
      <p className="mt-2 text-body text-ink-muted">
        Chúng tôi cần ảnh toàn thân của bạn để tạo ảnh bạn mặc thử sản phẩm.
      </p>
      {/* D-163: nói thẳng điều kiện mua hàng, vì hiện chỉ thêm được vào giỏ ở phòng thử đồ (D-147). */}
      <p className="mt-2 text-body text-ink-muted">
        Hiện bạn chỉ thêm được sản phẩm vào giỏ ở phòng thử đồ, nên cần hoàn thiện hồ sơ trước khi
        mua hàng.
      </p>
      <ul className="mt-4 space-y-3">
        {shown.map((key) => (
          <li key={key}>
            <div className="flex items-center gap-2 text-small">
              <Circle size={18} aria-hidden="true" className="shrink-0 text-ink-subtle" />
              <Link
                to={ITEMS[key].to}
                className="-my-2 inline-flex min-h-11 items-center font-semibold text-accent-strong underline hover:text-ink"
              >
                {ITEMS[key].label}
              </Link>
            </div>
            {key === 'measurements' && (
              <p className="ml-7 text-small text-ink-muted">
                Số đo chưa ảnh hưởng đến ảnh thử đồ và không được gửi tới dịch vụ AI. Hiện cần nhập
                để hoàn thiện hồ sơ.
              </p>
            )}
          </li>
        ))}
      </ul>
      <Link
        to={ITEMS[shown[0]].to}
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-md bg-ink px-5 text-body font-semibold text-ink-inverse hover:bg-[#333] sm:w-auto"
      >
        Đến Hồ sơ
      </Link>
    </section>
  );
}
