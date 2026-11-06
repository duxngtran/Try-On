import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Alert } from '../../components/Alert.jsx';
import { Button } from '../../components/Button.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { GeneralStatus } from '../auth/AuthFormStatus.jsx';
import { useCountdown } from '../../hooks/useCountdown.js';
import { ConsentBlock } from './ConsentBlock.jsx';
import { hasEverConsented } from './useAiConsent.js';
import { loadImage } from './imageLoader.js';
import {
  PHOTO_ACCEPT,
  PHOTO_MESSAGES,
  checkPhotoDimensions,
  checkPhotoFile,
} from './photoRules.js';
import { PhotoGuide } from './PhotoGuide.jsx';
import { profileApi } from './profileApi.js';
import { mapActionError, mapPhotoError } from './profileErrors.js';
import { StoredPhoto } from './StoredPhoto.jsx';

const CHECKLIST = [
  'Thấy từ đầu đến chân',
  'Chỉ có một mình tôi',
  'Đứng thẳng, nhìn thẳng',
  'Nền đơn giản, đủ sáng',
];
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

/** Card ① Ảnh toàn thân: consent, chọn/xem trước/tải lên/thay/xóa (profile-photo-*.md). */
export function PhotoCard({
  profile,
  applyProfile,
  reload,
  onToast,
  sectionRef,
  showGuide,
  aiConsent,
}) {
  const { photo, consent } = profile;
  const inputRef = useRef(null);
  const chooseRef = useRef(null);
  const replaceRef = useRef(null);
  const consentCheckboxRef = useRef(null);
  const deleteButtonRef = useRef(null);
  const cancelDeleteRef = useRef(null);
  const abortRef = useRef(null);
  const previewUrlRef = useRef(null);
  const countdown = useCountdown();

  const [preview, setPreview] = useState(null); // { file, url, width, height }
  const [phase, setPhase] = useState('idle'); // 'idle' | 'checking' | 'uploading'
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null); // { variant, message, detail? }
  const [consentError, setConsentError] = useState(null);
  const [checks, setChecks] = useState(() => CHECKLIST.map(() => false));
  const [dragging, setDragging] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [focusRequest, setFocusRequest] = useState(null); // 'replace' | 'choose' | 'consent'

  const locked = !consent.accepted;
  const everSentToAi = hasEverConsented(aiConsent);
  const busy = phase !== 'idle';
  const coolingDown = countdown.state === 'running';
  const pickDisabled = locked || busy || coolingDown;
  const lockReasonId = 'photo-lock-reason';
  const replaceNoteId = 'photo-replace-note';
  const processing = phase === 'uploading' && progress >= 100;

  const setPreviewUrl = (next) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = next?.url ?? null;
    setPreview(next);
    setChecks(CHECKLIST.map(() => false));
  };

  // Thu hồi object URL khi rời trang/unmount để không rò bộ nhớ; hủy request đang bay.
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  // Đang tải thì để trình duyệt cảnh báo khi đóng tab (screens/profile.md, Navigation).
  useEffect(() => {
    if (phase !== 'uploading') return undefined;
    const warn = (event) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  // Chuyển focus sau khi giao diện đã đổi (nút mới có mặt trong DOM).
  useEffect(() => {
    if (!focusRequest) return;
    const target = { replace: replaceRef, choose: chooseRef, consent: consentCheckboxRef }[
      focusRequest
    ];
    target.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusRequest(null);
  }, [focusRequest]);

  const openPicker = () => {
    if (pickDisabled) return;
    countdown.reset();
    inputRef.current?.click();
  };

  const handleFile = async (file) => {
    if (!file || pickDisabled) return;
    setError(null);
    countdown.reset();
    const fileError = checkPhotoFile(file);
    if (fileError) {
      setError({ variant: 'danger', message: fileError });
      return;
    }
    setPhase('checking');
    try {
      const image = await loadImage(file);
      const dimensionError = checkPhotoDimensions(image);
      if (dimensionError) {
        URL.revokeObjectURL(image.url);
        setError({
          variant: 'danger',
          message: dimensionError,
          detail: `Ảnh của bạn: ${image.width} × ${image.height} px`,
        });
        return;
      }
      setPreviewUrl({ file, ...image });
    } catch {
      setError({ variant: 'danger', message: PHOTO_MESSAGES.unreadable });
    } finally {
      setPhase('idle');
    }
  };

  const onInputChange = (event) => {
    const [file] = event.target.files;
    event.target.value = ''; // cho phép chọn lại đúng file đó
    handleFile(file);
  };

  const discardPreview = () => {
    setPreviewUrl(null);
    setError(null);
    countdown.reset();
  };

  const upload = async () => {
    if (!preview || busy || coolingDown) return;
    const hadPhoto = Boolean(photo);
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    countdown.reset();
    setProgress(0);
    setPhase('uploading');
    try {
      const next = await profileApi.uploadPhoto({
        file: preview.file,
        signal: controller.signal,
        onProgress: setProgress,
      });
      applyProfile(next);
      setPreviewUrl(null);
      onToast(hadPhoto ? 'Đã cập nhật ảnh. Các ảnh thử đồ cũ đã được xóa.' : 'Đã cập nhật ảnh');
      setFocusRequest('replace');
    } catch (err) {
      if (err.code === 'CANCELED') return; // user hủy: về trạng thái xem trước, không báo lỗi
      const mapped = mapPhotoError(err);
      if (mapped.discardPreview) setPreviewUrl(null);
      if (mapped.kind === 'consent') {
        // Server coi như chưa đồng ý: mở lại checkbox, giữ preview.
        applyProfile({ ...profile, consent: { ...consent, accepted: false } });
        setConsentError(mapped.message);
        setFocusRequest('consent');
        return;
      }
      if (mapped.retryAfterSeconds) countdown.start(mapped.retryAfterSeconds);
      setError({ variant: mapped.variant, message: mapped.message });
    } finally {
      abortRef.current = null;
      setPhase('idle');
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      applyProfile(await profileApi.deletePhoto());
      setDeleteOpen(false);
      onToast('Đã xóa ảnh. Các ảnh thử đồ của bạn cũng đã được xóa.');
      setFocusRequest('choose');
    } catch (err) {
      if (err.code === 'CANCELED') return;
      setDeleteOpen(false);
      setError({ variant: 'danger', message: mapActionError(err).general });
    } finally {
      setDeleting(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer?.files?.[0]);
  };
  const dropProps =
    !pickDisabled && !photo && !preview
      ? {
          onDragOver: (event) => {
            event.preventDefault();
            setDragging(true);
          },
          onDragLeave: () => setDragging(false),
          onDrop,
        }
      : {};

  const showRateStatus = error?.variant === 'warning' || countdown.state !== 'idle';

  let frame;
  if (preview) {
    frame = (
      <>
        <img
          src={preview.url}
          alt="Ảnh bạn vừa chọn, chưa lưu"
          className={`h-full w-full object-contain transition-opacity ${
            phase === 'uploading' ? 'opacity-60' : ''
          }`}
        />
        <span className="absolute left-2 top-2 rounded-sm bg-ink px-2 py-0.5 text-caption font-semibold text-ink-inverse">
          Xem trước
        </span>
      </>
    );
  } else if (photo) {
    frame = <StoredPhoto photo={photo} onRefresh={() => reload({ silent: true })} />;
  } else {
    frame = (
      <button
        type="button"
        onClick={openPicker}
        aria-disabled={pickDisabled || undefined}
        aria-describedby={locked ? lockReasonId : undefined}
        aria-label="Chọn ảnh toàn thân"
        className={`flex h-full w-full flex-col items-center justify-center gap-2 border-2 border-dashed p-4 text-center text-small ${
          pickDisabled
            ? 'cursor-not-allowed border-line text-disabled-ink'
            : dragging
              ? 'border-ink bg-accent-soft text-ink'
              : 'border-line-strong text-ink-muted hover:bg-accent-soft'
        }`}
      >
        {phase === 'checking' ? (
          <Spinner size={24} label="Đang kiểm tra ảnh" />
        ) : (
          <>
            <ImagePlus size={32} aria-hidden="true" />
            <span id={lockReasonId}>
              {locked ? 'Đồng ý bên dưới để chọn ảnh' : 'Nhấn để chọn ảnh hoặc kéo thả vào đây'}
            </span>
          </>
        )}
      </button>
    );
  }

  return (
    <section
      ref={sectionRef}
      id="photo"
      tabIndex={-1}
      aria-labelledby="photo-title"
      className="rounded-xl border border-line bg-surface p-5 shadow-card focus:outline-none"
    >
      <p className="text-caption font-semibold tracking-wide text-ink-subtle">BƯỚC 1</p>
      <h2 id="photo-title" className="font-display text-heading font-semibold">
        Ảnh toàn thân
      </h2>

      <div className="mt-4">
        <ConsentBlock
          consent={consent}
          applyProfile={(next) => {
            setConsentError(null);
            applyProfile(next);
          }}
          checkboxRef={consentCheckboxRef}
          externalError={consentError}
        />
      </div>

      <div className="mt-4" {...dropProps}>
        <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-md bg-surface-muted">
          {frame}
        </div>
        {photo && !preview && (
          <p className="mt-2 text-center text-caption text-ink-muted">
            Cập nhật {dateTime.format(new Date(photo.updatedAt))}
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        aria-label="Chọn ảnh toàn thân"
        tabIndex={-1}
        onChange={onInputChange}
        className="sr-only"
      />

      {phase === 'uploading' && (
        <div className="mx-auto mt-3 max-w-xs">
          {processing ? (
            <p role="status" className="flex items-center gap-2 text-small text-ink-muted">
              <Spinner label="" />
              Đang xử lý ảnh…
            </p>
          ) : (
            <>
              <p className="mb-1 text-small text-ink-muted">Đang tải lên… {progress}%</p>
              <div
                role="progressbar"
                aria-label="Tiến trình tải ảnh"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="h-2 overflow-hidden rounded-full bg-line"
              >
                <div
                  className="h-full origin-left bg-ink transition-transform"
                  style={{ transform: `scaleX(${progress / 100})`, width: '100%' }}
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-3 empty:hidden">
        {showRateStatus ? (
          <GeneralStatus
            general={error?.variant === 'warning' ? error : null}
            countdown={countdown}
            retryNoun="tải ảnh"
          />
        ) : (
          error && (
            <Alert variant={error.variant} role="alert" onClose={() => setError(null)}>
              <p>{error.message}</p>
              {error.detail && <p className="mt-1 text-ink-muted">{error.detail}</p>}
            </Alert>
          )
        )}
      </div>

      {preview && (
        <fieldset className="mt-4" disabled={phase === 'uploading'}>
          <legend className="text-small font-semibold">Kiểm tra nhanh trước khi lưu</legend>
          <div className="mt-2 space-y-1">
            {CHECKLIST.map((label, index) => (
              <label key={label} className="flex min-h-9 items-center gap-3 text-small">
                <input
                  type="checkbox"
                  checked={checks[index]}
                  onChange={(event) =>
                    setChecks((prev) =>
                      prev.map((v, i) => (i === index ? event.target.checked : v)),
                    )
                  }
                  className="h-5 w-5 accent-ink"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {preview && photo && (
        <Alert variant="info" role="status" className="mt-4">
          <p id={replaceNoteId}>
            Khi bạn lưu ảnh mới, các ảnh thử đồ cũ sẽ bị xóa và phải tạo lại. Việc này dùng lượt tạo
            ảnh của bạn.
          </p>
        </Alert>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {preview ? (
          <>
            <Button
              onClick={upload}
              loading={phase === 'uploading'}
              loadingText="Đang tải…"
              softDisabled={coolingDown}
              aria-describedby={photo ? replaceNoteId : undefined}
            >
              Lưu ảnh
            </Button>
            <Button
              variant="secondary"
              onClick={openPicker}
              disabled={busy}
              softDisabled={coolingDown || locked}
            >
              Chọn ảnh khác
            </Button>
            {phase === 'uploading' ? (
              <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                Hủy tải
              </Button>
            ) : (
              <Button variant="ghost" onClick={discardPreview}>
                Hủy
              </Button>
            )}
          </>
        ) : photo ? (
          <>
            <Button
              ref={replaceRef}
              variant="secondary"
              onClick={openPicker}
              disabled={busy}
              softDisabled={pickDisabled && !busy}
              aria-describedby={locked ? lockReasonId : undefined}
            >
              Thay ảnh
            </Button>
            <Button
              ref={deleteButtonRef}
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
              className="text-danger"
            >
              <Trash2 size={16} aria-hidden="true" />
              Xóa ảnh
            </Button>
          </>
        ) : (
          <Button
            ref={chooseRef}
            onClick={openPicker}
            disabled={busy}
            softDisabled={pickDisabled && !busy}
            aria-describedby={locked ? lockReasonId : undefined}
            className="w-full sm:w-auto"
          >
            Chọn ảnh
          </Button>
        )}
      </div>

      {showGuide && <PhotoGuide hasPhoto={Boolean(photo)} />}

      <Modal
        open={deleteOpen}
        title="Xóa ảnh?"
        busy={deleting}
        onClose={() => setDeleteOpen(false)}
        initialFocusRef={cancelDeleteRef}
        returnFocusRef={chooseRef}
        actions={
          <>
            <Button
              ref={cancelDeleteRef}
              variant="secondary"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              loadingText="Đang xóa…"
              onClick={confirmDelete}
            >
              Xóa ảnh
            </Button>
          </>
        }
      >
        <p>
          Ảnh toàn thân sẽ bị xóa khỏi Try-on. Các ảnh thử đồ đã tạo từ ảnh này cũng sẽ bị xóa, và
          bạn sẽ không thể dùng phòng thử đồ cho đến khi tải ảnh mới.
        </p>
        {everSentToAi && (
          <p className="mt-3 text-small text-ink-muted">
            Việc xóa không thu hồi được những ảnh đã được gửi tới dịch vụ AI trước đây.
          </p>
        )}
      </Modal>
    </section>
  );
}
