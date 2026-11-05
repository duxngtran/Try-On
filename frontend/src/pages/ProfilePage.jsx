import { Alert } from '../components/Alert.jsx';
import { useAuth } from '../features/auth/authContext.js';
import { usePageTitle } from '../hooks/usePageTitle.js';

/** Placeholder: nội dung thật (ảnh, số đo) thuộc US-02. */
export function ProfilePage() {
  const { user } = useAuth();
  usePageTitle('Hồ sơ');
  return (
    <section className="mx-auto max-w-2xl py-8">
      <h1 className="font-display text-display font-semibold">Hồ sơ của bạn</h1>
      {!user.profileCompleted && (
        <Alert variant="info" className="mt-6">
          <p className="font-semibold">Hoàn thiện hồ sơ để thử đồ</p>
          <p className="mt-1 text-ink-muted">
            Bạn sẽ thêm ảnh toàn thân và số đo ở bước tiếp theo. Tính năng này sắp có.
          </p>
        </Alert>
      )}
    </section>
  );
}
