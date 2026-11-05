import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại modal (design-system 7.9): giữ focus bên trong, Esc đóng, trả focus về nút đã mở.
 * `busy` khóa đóng bằng Esc/scrim. `initialFocusRef` chọn nút nhận focus đầu tiên (mặc định nút đầu).
 * `returnFocusRef` (tùy chọn) chỉ nơi trả focus nếu phần tử đã mở không còn.
 */
export function Modal({
  open,
  title,
  onClose,
  busy = false,
  initialFocusRef,
  returnFocusRef,
  children,
  actions,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const panel = panelRef.current;
    (initialFocusRef?.current ?? panel.querySelector(FOCUSABLE))?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const target = opener?.isConnected ? opener : returnFocusRef?.current;
      target?.focus?.();
    };
  }, [open, initialFocusRef, returnFocusRef]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-scrim"
        onClick={busy ? undefined : onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md animate-toast-in rounded-t-xl bg-surface p-6 shadow-modal sm:rounded-xl"
      >
        <h2 id={titleId} className="font-display text-title font-semibold">
          {title}
        </h2>
        <div className="mt-3 text-body text-ink-muted">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}
