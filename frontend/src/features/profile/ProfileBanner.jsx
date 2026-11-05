import { CheckCircle2, Circle } from 'lucide-react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert.jsx';

/**
 * Banner hoàn thiện hồ sơ. `missing` do backend tính (`photo` | `measurements`), FE không tự suy luận.
 */
export function ProfileBanner({ profile, onGoToPhoto, onGoToMeasurements }) {
  if (profile.profileCompleted) {
    return (
      <Alert variant="success" role="status">
        <p className="font-semibold">Hồ sơ đã đầy đủ. Bạn có thể bắt đầu thử đồ.</p>
        <Link to="/" className="mt-2 inline-block font-semibold text-accent-strong underline">
          Về trang chủ
        </Link>
      </Alert>
    );
  }

  const steps = [
    { key: 'photo', label: 'Ảnh toàn thân', onGo: onGoToPhoto },
    { key: 'measurements', label: 'Chiều cao và cân nặng', onGo: onGoToMeasurements },
  ];
  const done = steps.filter((step) => !profile.missing.includes(step.key)).length;

  return (
    <section
      role="status"
      aria-labelledby="profile-banner-title"
      className="rounded-xl bg-accent-soft p-4"
    >
      <h2 id="profile-banner-title" className="font-display text-heading font-semibold">
        Hoàn thiện hồ sơ để bắt đầu thử đồ
      </h2>
      <p className="mt-1 text-small text-ink-muted">Đã xong {done}/2 bước</p>
      <div aria-hidden="true" className="mt-2 flex gap-1.5">
        {steps.map((step, index) => (
          <span
            key={step.key}
            className={`h-1.5 flex-1 rounded-full ${index < done ? 'bg-success' : 'bg-line'}`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {steps.map((step) => {
          const isDone = !profile.missing.includes(step.key);
          return (
            <li key={step.key} className="flex items-center gap-2 text-small">
              {isDone ? (
                <CheckCircle2 size={18} aria-hidden="true" className="shrink-0 text-success" />
              ) : (
                <Circle size={18} aria-hidden="true" className="shrink-0 text-ink-subtle" />
              )}
              {isDone ? (
                <span className="text-ink-muted line-through">
                  {step.label}
                  <span className="sr-only"> đã xong</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={step.onGo}
                  className="-my-2 min-h-11 text-left font-semibold text-accent-strong underline hover:text-ink"
                >
                  {step.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
