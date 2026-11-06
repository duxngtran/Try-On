import { useCallback, useRef, useState } from 'react';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { ToastRegion, useToast } from '../profile/useToast.jsx';
import { ConsentGate } from './ConsentGate.jsx';
import { ProfileGate } from './ProfileGate.jsx';
import { RoomError, RoomSkeleton } from './RoomParts.jsx';
import { TryOnRoom } from './TryOnRoom.jsx';
import { useTryOnState } from './useTryOnState.js';

/**
 * Phòng thử đồ `/try-on` (screens/try-on-room.md). Quyết định màn hình theo `GET /try-on/state`:
 * khung chờ -> lỗi -> cổng hồ sơ G1 -> cổng consent G2 -> phòng. Mọi cổng thay phần dưới `h1`.
 */
export function TryOnPage() {
  usePageTitle('Phòng thử đồ');
  const tryon = useTryOnState();
  const { toast, show: showToast } = useToast();
  const headingRef = useRef(null);
  const [liveMessage, setLiveMessage] = useState('');
  // 403/409 giữa chừng (E9): sân khấu bị gỡ, hiện cổng kèm câu "đã thay đổi".
  const [midGate, setMidGate] = useState(null); // { gate: 'consent' | 'profile', missing? }
  const [retrying, setRetrying] = useState(false);
  const { load, apply } = tryon;

  const announce = useCallback((message) => setLiveMessage(message), []);
  const handleGate = useCallback(
    (failure) => {
      setMidGate({ gate: failure.gate, missing: failure.missing });
      load({ silent: true });
    },
    [load],
  );
  const refreshState = useCallback(({ silent = true } = {}) => load({ silent }), [load]);

  const retryState = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  const onConsentAccepted = (next) => {
    apply(next);
    setMidGate(null);
    showToast('Đã ghi nhận sự đồng ý');
    announce('Đã ghi nhận sự đồng ý của bạn. Hãy chọn một danh mục.');
    // Hành động của người dùng: nút vừa bấm biến mất nên focus về h1 (chờ cổng gỡ khỏi DOM).
    queueMicrotask(() => headingRef.current?.focus());
  };

  let body = null;
  if (tryon.status === 'loading') body = <RoomSkeleton />;
  else if (tryon.status === 'error') body = <RoomError onRetry={retryState} retrying={retrying} />;
  else {
    const { profile, consent } = tryon.data;
    if (midGate?.gate === 'profile' || !profile.completed) {
      body = (
        <ProfileGate
          missing={midGate?.gate === 'profile' ? (midGate.missing ?? []) : profile.missing}
          midway={midGate?.gate === 'profile'}
        />
      );
    } else if (midGate?.gate === 'consent' || !consent.accepted) {
      body = (
        <ConsentGate
          consent={consent}
          midway={midGate?.gate === 'consent'}
          onAccepted={onConsentAccepted}
          onProfileIncomplete={(missing) => {
            setMidGate({ gate: 'profile', missing });
            load({ silent: true });
          }}
        />
      );
    } else {
      body = (
        <TryOnRoom
          tryonState={tryon.data}
          refreshState={refreshState}
          onGate={handleGate}
          announce={announce}
        />
      );
    }
  }

  return (
    <div className="mx-auto max-w-6xl py-2 md:py-4">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-title font-semibold focus:outline-none md:text-display"
      >
        Phòng thử đồ
      </h1>
      {/* Bản đầy đủ "...bấm mũi tên hoặc vuốt để thử sản phẩm tiếp theo" chỉ đúng sau US-06 (T-85). */}
      <p className="mt-1 hidden text-small text-ink-muted sm:block">
        Chọn một danh mục để xem bạn mặc thử sản phẩm.
      </p>
      {/* Một vùng live duy nhất, luôn có trong DOM; khối lỗi tự có role="alert" và không lặp ở đây. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
      {body}
      <ToastRegion toast={toast} />
    </div>
  );
}
