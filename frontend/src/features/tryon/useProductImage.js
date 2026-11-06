import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  MAX_TIMER_MS,
  POLL_BACKOFF_MS,
  POLL_MS,
  SETTLE_MS,
  URL_REFRESH_BEFORE_MS,
  WAIT_LONG_MS,
  WAIT_TIMEOUT_MS,
} from './tryonConfig.js';
import { tryonApi } from './tryonApi.js';
import { pickQuotaReset } from './tryonFormat.js';
import { classifyError, overlayForBlocked, overlayForJobError } from './tryonStates.js';

const MIN_REFRESH_DELAY_MS = 5_000;

const blankView = (productId) => ({
  productId,
  phase: 'resolving', // 'resolving' | 'waiting' | 'ready' | 'overlay'
  long: false,
  overlayId: null,
  overlayData: null,
  image: null,
  waitEpoch: 0,
  offline: false,
});

function reducer(state, action) {
  switch (action.type) {
    case 'resolving':
      return { ...blankView(action.productId), waitEpoch: state.waitEpoch };
    case 'waiting':
      // Đã đang chờ thì giữ nguyên đồng hồ (gắn vào job đang chạy không đếm lại).
      if (state.phase === 'waiting') return state;
      return {
        ...state,
        phase: 'waiting',
        long: false,
        overlayId: null,
        overlayData: null,
        image: null,
        waitEpoch: state.waitEpoch + 1,
      };
    case 'long':
      return state.phase === 'waiting' ? { ...state, long: true } : state;
    case 'timeout':
      // Mốc 60 giây chỉ là lỗi hiển thị; việc theo dõi job vẫn tiếp tục (S5).
      return state.phase === 'waiting'
        ? { ...state, phase: 'overlay', long: false, overlayId: 'timeout', overlayData: null }
        : state;
    case 'ready':
      return {
        ...state,
        phase: 'ready',
        long: false,
        overlayId: null,
        overlayData: null,
        image: action.image,
      };
    case 'image':
      return state.phase === 'ready' ? { ...state, image: action.image } : state;
    case 'overlay':
      return {
        ...state,
        phase: 'overlay',
        long: false,
        overlayId: action.id,
        overlayData: action.data ?? null,
        image: null,
      };
    case 'offline':
      return state.offline === action.value ? state : { ...state, offline: action.value };
    default:
      return state;
  }
}

/** Đợi ảnh giải mã xong rồi mới đổi `src`, để không nhấp nháy (E20). Lỗi tải để `<img onError>` xử lý. */
function preload(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    if (typeof img.decode === 'function') img.decode().then(resolve, resolve);
    else resolve();
  });
}

/**
 * Máy trạng thái ảnh thử đồ của MỘT sản phẩm đang xem (US-05 §4–§6, try-on-states.md).
 *
 * Luồng: `GET /result` -> (none) chờ 400 ms -> `POST /jobs` -> poll `GET /jobs/:id` mỗi 2 giây.
 * Đổi `productId` hoặc unmount hủy mọi timer, request và poll của sản phẩm trước, nên kết quả muộn của
 * sản phẩm khác không bao giờ đổi ảnh đang hiển thị (US-06 R7). Đồng hồ 15/60 giây tính từ lúc bắt đầu chờ.
 *
 * `getRoom()` trả `{ generationAvailable, quota }` mới nhất từ `/state` (đọc qua hàm để làm mới `/state`
 * không khởi động lại luồng). `onGate({ gate, missing })`: 403/409 giữa chừng. `onGenerated()`: một ảnh vừa
 * sinh xong, nơi gọi làm mới `/state`. `refreshState()` trả `/state` mới (hoặc null).
 */
export function useProductImage(productId, { getRoom, refreshState, onGate, onGenerated }) {
  const [state, dispatch] = useReducer(reducer, productId, blankView);
  const [attempt, setAttempt] = useState(0);
  const modeRef = useRef('normal'); // 'normal' | 'post' | 'check', dùng một lần cho lần chạy kế tiếp
  const callbacks = useRef({});
  const productRef = useRef(productId);
  const imageErrorRetried = useRef(false);
  const refreshToken = useRef(0);

  useEffect(() => {
    callbacks.current = { getRoom, refreshState, onGate, onGenerated };
    productRef.current = productId;
  });

  useEffect(() => {
    if (!productId) return undefined;
    const mode = modeRef.current;
    modeRef.current = 'normal';
    imageErrorRetried.current = false;
    const session = { alive: true, timers: new Set(), controller: new AbortController() };
    const { signal } = session.controller;
    const startedAt = Date.now();
    const live = () => session.alive;
    const sleep = (ms) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          session.timers.delete(timer);
          resolve();
        }, ms);
        session.timers.add(timer);
      });
    const show = (id, data) => dispatch({ type: 'overlay', id, data });
    let rechecks = 0;

    /** Gọi API; lỗi mạng thì thử lại giãn dần cho tới khi có mạng (S13). */
    async function call(context, fn) {
      let failures = 0;
      while (live()) {
        try {
          const data = await fn({ signal });
          if (!live()) return null;
          dispatch({ type: 'offline', value: false });
          return { data };
        } catch (error) {
          if (!live()) return null;
          const failure = classifyError(error, context);
          if (failure.type !== 'offline') return { failure };
          dispatch({ type: 'offline', value: true });
          await sleep(POLL_BACKOFF_MS[Math.min(failures, POLL_BACKOFF_MS.length - 1)]);
          failures += 1;
        }
      }
      return null;
    }

    function handleFailure(failure) {
      if (failure.type === 'gate') callbacks.current.onGate?.(failure);
      else if (failure.type === 'overlay') {
        show(failure.id, failure.data);
        if (['quotaDay', 'quotaMonth', 'quotaPending', 'throttled'].includes(failure.id)) {
          callbacks.current.refreshState?.();
        }
      } else if (failure.type !== 'canceled') show('failed');
    }

    async function recheck() {
      rechecks += 1;
      if (rechecks > 1) return show('failed'); // canceled/discarded lặp lại: dừng, tránh vòng lặp
      const result = await call('result', (opts) => tryonApi.getResult(productId, opts));
      if (!result) return undefined;
      if (result.failure) return handleFailure(result.failure);
      return settle(result.data, { posted: false });
    }

    async function track(jobId) {
      let failures = 0;
      let wait = POLL_MS;
      while (live()) {
        await sleep(wait);
        if (!live()) return;
        let job;
        try {
          job = await tryonApi.getJob(jobId, { signal });
        } catch (error) {
          if (!live()) return;
          const failure = classifyError(error, 'poll');
          if (failure.type === 'canceled') return;
          if (failure.type === 'gate') return handleFailure(failure);
          if (failure.type === 'job-gone') return recheck();
          if (failure.type === 'poll-slow') {
            wait = Math.max((failure.retryAfterSeconds ?? 0) * 1000, POLL_MS);
            continue;
          }
          failures += 1;
          if (error.code === 'NETWORK_ERROR' || failures >= 3) {
            dispatch({ type: 'offline', value: true });
          }
          wait = POLL_BACKOFF_MS[Math.min(failures - 1, POLL_BACKOFF_MS.length - 1)];
          continue;
        }
        if (!live()) return;
        failures = 0;
        wait = POLL_MS;
        dispatch({ type: 'offline', value: false });
        if (job.productId && job.productId !== productId) return; // không phải sản phẩm đang xem
        if (job.status === 'succeeded') {
          if (!job.image) return recheck();
          dispatch({ type: 'ready', image: job.image });
          callbacks.current.onGenerated?.();
          return;
        }
        if (job.status === 'failed') return show(overlayForJobError(job.error?.code));
        if (job.status === 'canceled' || job.status === 'discarded') return recheck();
        // queued, running: poll tiếp
      }
    }

    async function create() {
      const result = await call('create', (opts) => tryonApi.createJob(productId, opts));
      if (!result) return undefined;
      if (result.failure) return handleFailure(result.failure);
      return settle(result.data, { posted: true });
    }

    async function settle(data, { posted }) {
      switch (data.state) {
        case 'ready':
          return dispatch({ type: 'ready', image: data.image });
        case 'pending':
          dispatch({ type: 'waiting' });
          return track(data.job.id);
        case 'blocked':
          return show(overlayForBlocked(data.errorCode));
        case 'none': {
          if (posted) return show('failed');
          const room = callbacks.current.getRoom?.() ?? {};
          // Biết trước là không tạo được thì không gửi (D-118): tiết kiệm lệnh gọi và rate limit.
          if (room.generationAvailable === false) return show('paused');
          if (room.quota && room.quota.remaining === 0 && room.quota.held === 0) {
            const { scope, resetsAt } = pickQuotaReset(room.quota);
            return show(scope === 'month' ? 'quotaMonth' : 'quotaDay', { resetsAt });
          }
          dispatch({ type: 'waiting' });
          await sleep(Math.max(0, SETTLE_MS - (Date.now() - startedAt)));
          if (!live()) return undefined;
          return create();
        }
        default:
          return show('failed'); // gồm `skipped`: không phải hợp đồng của purpose display
      }
    }

    (async () => {
      try {
        if (mode === 'post') {
          dispatch({ type: 'resolving', productId });
          dispatch({ type: 'waiting' });
          await create();
        } else if (mode === 'check') {
          dispatch({ type: 'resolving', productId });
          const fresh = await callbacks.current.refreshState?.();
          if (!live()) return;
          if (fresh && fresh.generation?.available === false) return show('paused');
          dispatch({ type: 'waiting' });
          await create();
        } else {
          dispatch({ type: 'resolving', productId });
          const result = await call('result', (opts) => tryonApi.getResult(productId, opts));
          if (!result) return;
          if (result.failure) handleFailure(result.failure);
          else await settle(result.data, { posted: false });
        }
      } catch {
        if (live()) show('failed');
      }
    })();

    return () => {
      session.alive = false;
      session.controller.abort();
      session.timers.forEach(clearTimeout);
    };
  }, [productId, attempt]);

  // Đồng hồ chờ 15/60 giây: bắt đầu lại mỗi khi bắt đầu chờ ở sản phẩm này (D-113).
  const waiting = state.productId === productId && state.phase === 'waiting';
  const { waitEpoch } = state;
  useEffect(() => {
    if (!waiting) return undefined;
    const longTimer = setTimeout(() => dispatch({ type: 'long' }), WAIT_LONG_MS);
    const timeoutTimer = setTimeout(() => dispatch({ type: 'timeout' }), WAIT_TIMEOUT_MS);
    return () => {
      clearTimeout(longTimer);
      clearTimeout(timeoutTimer);
    };
  }, [waiting, waitEpoch]);

  const viewReady = state.productId === productId;
  const view = viewReady ? state : blankView(productId);
  const image = view.phase === 'ready' ? view.image : null;

  const refreshImage = useCallback(async ({ forced = false } = {}) => {
    const id = productRef.current;
    const token = (refreshToken.current += 1);
    const stale = () => token !== refreshToken.current || id !== productRef.current;
    try {
      const data = await tryonApi.getResult(id);
      if (stale()) return;
      if (data.state === 'ready') {
        await preload(data.image.url);
        if (!stale()) dispatch({ type: 'image', image: data.image });
      } else {
        setAttempt((n) => n + 1); // ảnh không còn hiệu lực (đổi ảnh hồ sơ ở tab khác): xác định lại
      }
    } catch (error) {
      if (stale()) return;
      const failure = classifyError(error, 'result');
      if (failure.type === 'gate') callbacks.current.onGate?.(failure);
      else if (forced) dispatch({ type: 'overlay', id: 'imageError' });
    }
  }, []);

  // Làm mới signed URL trước khi hết hạn (E20), không báo lỗi nếu thất bại.
  const expiresAt = image?.expiresAt;
  const imageUrl = image?.url;
  useEffect(() => {
    if (!imageUrl) return undefined;
    const delay = Math.min(
      Math.max(Date.parse(expiresAt) - Date.now() - URL_REFRESH_BEFORE_MS, MIN_REFRESH_DELAY_MS),
      MAX_TIMER_MS,
    );
    const timer = setTimeout(() => refreshImage(), Number.isFinite(delay) ? delay : MAX_TIMER_MS);
    return () => clearTimeout(timer);
  }, [imageUrl, expiresAt, refreshImage]);

  const rerun = useCallback((mode) => {
    modeRef.current = mode;
    setAttempt((n) => n + 1);
  }, []);

  return {
    view,
    /** S5, S6, S10c, S11: gọi lại `POST /jobs` (backend gắn vào đúng job đang chạy, AC-15). */
    retry: useCallback(() => rerun('post'), [rerun]),
    /** S9: làm mới `/state`, tạo job nếu đã bật lại. */
    recheck: useCallback(() => rerun('check'), [rerun]),
    /** S12: chỉ `GET /result`, không tốn lượt (E22). */
    reloadImage: useCallback(() => rerun('normal'), [rerun]),
    /** `<img>` ảnh thử đồ lỗi: làm mới URL một lần, lần hai thì S12 (E20). */
    onImageError: useCallback(() => {
      if (!imageErrorRetried.current) {
        imageErrorRetried.current = true;
        refreshImage({ forced: true });
      } else {
        dispatch({ type: 'overlay', id: 'imageError' });
      }
    }, [refreshImage]),
    onImageLoad: useCallback(() => {
      imageErrorRetried.current = false;
    }, []),
  };
}
