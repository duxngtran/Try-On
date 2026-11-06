import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BOUNCE_MS, SWIPE_MIN_PX } from './tryonConfig.js';

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `←` `→` chuyển sản phẩm, trừ khi đang gõ, có phím bổ trợ (`Alt+←` là Back của trình duyệt) hoặc đang mở hộp thoại. */
export function useArrowKeys({ onPrev, onNext, enabled }) {
  const handlers = useRef({});
  useEffect(() => {
    handlers.current = { onPrev, onNext };
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable]')
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') handlers.current.onPrev();
      else handlers.current.onNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/**
 * Vuốt ngang bằng pointer events (chỉ `touch` và `pen`, chuột không kéo). Chỉ tính khi quãng ngang >= 50 px VÀ lớn hơn
 * quãng dọc, nên cuộn dọc không bị chặn (US-06 §6, AC-18); vùng nhận cần `touch-action: pan-y`.
 * Vuốt sang trái = sản phẩm kế tiếp; hướng không có sản phẩm thì nảy 160 ms (bỏ qua nếu giảm chuyển động) và không gọi API.
 * @returns {{ bind: object, bounce: null | 'left' | 'right' }}
 */
export function useSwipe({ canPrev, canNext, onPrev, onNext, onEdge }) {
  const start = useRef(null);
  const [bounce, setBounce] = useState(null);
  const latest = useRef({});
  // Layout effect: vùng vuốt nhận thao tác ngay khi hiện, không được đọc `latest` còn rỗng.
  useLayoutEffect(() => {
    latest.current = { canPrev, canNext, onPrev, onNext, onEdge };
  });

  useEffect(() => {
    if (!bounce) return undefined;
    const timer = setTimeout(() => setBounce(null), BOUNCE_MS);
    return () => clearTimeout(timer);
  }, [bounce]);

  const onPointerDown = useCallback((event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    start.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, []);

  const onPointerUp = useCallback((event) => {
    const origin = start.current;
    start.current = null;
    if (!origin || origin.id !== event.pointerId) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
    const { canPrev: p, canNext: n, onPrev: goPrev, onNext: goNext, onEdge: edge } = latest.current;
    const forward = dx < 0;
    if (forward ? n : p) {
      (forward ? goNext : goPrev)();
      return;
    }
    if (!reducedMotion()) setBounce(forward ? 'left' : 'right');
    edge?.(forward ? 'next' : 'prev');
  }, []);

  // `pointercancel`: trình duyệt đã nhận cử chỉ để cuộn trang, bỏ.
  const onPointerCancel = useCallback(() => {
    start.current = null;
  }, []);

  return { bind: { onPointerDown, onPointerUp, onPointerCancel }, bounce };
}
