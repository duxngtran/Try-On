import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { AiConsentCard } from './AiConsentCard.jsx';
import { MeasurementsCard } from './MeasurementsCard.jsx';
import { PhotoCard } from './PhotoCard.jsx';
import { PhotoGuide } from './PhotoGuide.jsx';
import { ProfileBanner } from './ProfileBanner.jsx';
import { ToastRegion, useToast } from './useToast.jsx';
import { useAiConsent } from './useAiConsent.js';
import { useProfile } from './useProfile.js';

const DESKTOP_QUERY = '(min-width: 1024px)';

/** Desktop (>= 1024px) đặt hướng dẫn ở cột phải, nhỏ hơn thì nằm trong card ảnh. */
function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia?.(DESKTOP_QUERY);
      query?.addEventListener?.('change', notify);
      return () => query?.removeEventListener?.('change', notify);
    },
    () => window.matchMedia?.(DESKTOP_QUERY)?.matches ?? false,
    () => false,
  );
}

function ProfileSkeleton() {
  const block = 'animate-pulse rounded-md bg-surface-muted';
  return (
    <div aria-hidden="true" className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <div className={`h-24 lg:col-span-7 lg:col-start-6 lg:row-start-1 ${block}`} />
      <div className="space-y-4 rounded-xl border border-line bg-surface p-5 lg:col-span-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <div className={`mx-auto aspect-[3/4] w-full max-w-xs ${block}`} />
      </div>
      <div className="space-y-4 rounded-xl border border-line bg-surface p-5 lg:col-span-7 lg:col-start-6 lg:row-start-2">
        <div className={`h-12 ${block}`} />
        <div className={`h-12 ${block}`} />
      </div>
    </div>
  );
}

/** Trang Hồ sơ (`/profile`, screens/profile.md): banner, ảnh toàn thân, số đo. */
export function ProfilePage() {
  usePageTitle('Hồ sơ');
  const { status, profile, error, reload, applyProfile } = useProfile();
  const { toast, show } = useToast();
  const isDesktop = useIsDesktop();
  const ai = useAiConsent();
  const { hash } = useLocation();
  const photoSectionRef = useRef(null);
  const heightRef = useRef(null);
  const aiHeadingRef = useRef(null);
  const hasProfile = Boolean(profile);

  // Neo #photo, #measurements (cổng hồ sơ G1, lỗi ảnh chưa phù hợp): cuộn tới card và focus vào phần cần làm.
  useEffect(() => {
    if (!hasProfile) return;
    if (hash === '#photo') {
      photoSectionRef.current?.scrollIntoView?.({ block: 'start' });
      photoSectionRef.current?.focus({ preventScroll: true });
    } else if (hash === '#measurements') {
      document.getElementById('measurements')?.scrollIntoView?.({ block: 'start' });
      heightRef.current?.focus({ preventScroll: true });
    }
  }, [hash, hasProfile]);

  if (error?.status === 403) return <Navigate to="/admin" replace />;

  const goToPhoto = () => {
    photoSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    photoSectionRef.current?.focus({ preventScroll: true });
  };
  const goToMeasurements = () => heightRef.current?.focus();

  return (
    <div aria-busy={status === 'loading'} className="mx-auto max-w-2xl py-8 lg:max-w-5xl">
      <h1 className="font-display text-display font-semibold">Hồ sơ của bạn</h1>
      <p className="mb-6 mt-1 hidden text-body text-ink-muted sm:block">
        Ảnh và số đo giúp chúng tôi tạo ảnh thử đồ giống bạn nhất.
      </p>

      {status === 'loading' && !profile && (
        <div className="mt-6">
          <ProfileSkeleton />
        </div>
      )}

      {status === 'error' && (
        <div className="mt-6 flex flex-col items-start gap-3">
          <Alert variant="danger" role="alert" className="w-full">
            Không tải được hồ sơ. Vui lòng thử lại.
          </Alert>
          <Button onClick={() => reload()}>Thử lại</Button>
        </div>
      )}

      {profile && (
        <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7 lg:col-start-6 lg:row-start-1">
            <ProfileBanner
              profile={profile}
              onGoToPhoto={goToPhoto}
              onGoToMeasurements={goToMeasurements}
            />
          </div>
          <div className="lg:sticky lg:top-24 lg:col-span-5 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:self-start">
            <PhotoCard
              profile={profile}
              applyProfile={applyProfile}
              reload={reload}
              onToast={show}
              sectionRef={photoSectionRef}
              showGuide={!isDesktop}
              aiConsent={ai}
            />
          </div>
          {isDesktop && (
            <div className="lg:col-span-7 lg:col-start-6 lg:row-start-2">
              <PhotoGuide alwaysOpen hasPhoto={Boolean(profile.photo)} />
            </div>
          )}
          <div className="lg:col-span-7 lg:col-start-6 lg:row-start-3">
            <MeasurementsCard
              profile={profile}
              applyProfile={applyProfile}
              onSaved={() => show('Đã lưu thông tin')}
              heightRef={heightRef}
            />
          </div>
          <div className="lg:col-span-7 lg:col-start-6 lg:row-start-4">
            <AiConsentCard
              ai={ai}
              sectionRef={aiHeadingRef}
              onWithdrawn={() => show('Đã rút đồng ý. Các ảnh thử đồ của bạn đang được xóa.')}
            />
          </div>
        </div>
      )}

      <ToastRegion toast={toast} />
    </div>
  );
}
