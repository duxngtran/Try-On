import { useEffect, useRef } from 'react';
import { tryonApi } from './tryonApi.js';
import {
  NEIGHBOR_PRELOAD_MS,
  PREFETCH_DWELL_MS,
  PREFETCH_MAX_WATCH_MS,
  PREFETCH_MIN_REMAINING,
  PREFETCH_POLL_MS,
} from './tryonConfig.js';

const tabVisible = () => document.visibilityState !== 'hidden';
const dataSaver = () => Boolean(navigator.connection?.saveData);

/** Đợi ảnh giải mã xong để lần chuyển tới hiện ngay; lỗi tải thì để `<img onError>` xử lý lúc hiển thị. */
function warmImage(url) {
  const img = new Image();
  img.src = url;
  return typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve();
}

const sleepAbortable = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/**
 * Việc nền của sản phẩm đang xem: (1) tải trước ảnh liền trước và liền sau nếu ĐÃ có (chỉ `GET /result`, không bao giờ
 * `POST`, R10); (2) generate trước đúng MỘT sản phẩm kế tiếp (D-85, flows/tryon-prefetch.md). Mọi lỗi đều im lặng.
 *
 * Điều kiện phía FE của generate trước: ảnh hiện tại sẵn sàng và dừng đủ 1 giây, có sản phẩm kế tiếp, tab hiện,
 * không bật tiết kiệm dữ liệu, `generation.prefetchAllowed`, còn hơn 3 lượt theo `/state` gần nhất. Backend vẫn tự kiểm lại.
 * Rời sản phẩm thì hủy mọi timer và ngừng theo dõi job; job chưa gửi sẽ tự bị hủy khi không còn ai theo dõi (R4).
 *
 * @param {{
 *   product: { id: string, image: { version: number } },
 *   prev: object | null, next: object | null,
 *   ready: boolean, cache: ReturnType<import('./useImageCache.js').createImageCache>,
 *   getRoom: () => { prefetchAllowed: boolean, quota: { remaining: number } },
 *   onGenerated: () => void,
 * }} options
 */
export function useNeighbors({ product, prev, next, ready, cache, getRoom, onGenerated }) {
  const latest = useRef({});
  useEffect(() => {
    latest.current = { getRoom, onGenerated, cache };
  });
  const prevId = prev?.id;
  const nextId = next?.id;
  const prevVersion = prev?.image.version;
  const nextVersion = next?.image.version;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const timers = [];
    const memo = new Map();
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const store = (id, version, image) => {
      latest.current.cache.set(id, version, image);
      return warmImage(image.url);
    };

    /** `GET /result` của một sản phẩm liền kề, mỗi sản phẩm tối đa một lần cho mỗi lượt dừng. */
    const inspect = (id, version) => {
      if (!memo.has(id)) {
        memo.set(
          id,
          tryonApi.getResult(id, { signal }).then(
            async (data) => {
              if (data.state === 'ready') await store(id, version, data.image);
              return data;
            },
            () => null,
          ),
        );
      }
      return memo.get(id);
    };

    const watchPrefetch = async (jobId) => {
      const deadline = Date.now() + PREFETCH_MAX_WATCH_MS;
      while (!signal.aborted && Date.now() < deadline) {
        await sleepAbortable(PREFETCH_POLL_MS, signal);
        if (signal.aborted) return;
        let job;
        try {
          job = await tryonApi.getJob(jobId, { signal });
        } catch {
          return; // lỗi im lặng; người mua chỉ thấy kết quả thật khi chuyển tới
        }
        if (job.status === 'succeeded' && job.image) {
          await store(nextId, nextVersion, job.image);
          latest.current.onGenerated?.(); // lượt đã tăng, làm mới /state
          return;
        }
        if (job.status !== 'queued' && job.status !== 'running') return;
      }
    };

    const prefetchNext = async () => {
      const room = latest.current.getRoom();
      const allowed =
        room.prefetchAllowed &&
        room.quota.remaining > PREFETCH_MIN_REMAINING &&
        tabVisible() &&
        !dataSaver();
      if (!allowed) return;
      const seen = await inspect(nextId, nextVersion);
      if (signal.aborted || seen?.state !== 'none') return; // ready, pending, blocked, lỗi: không tạo job
      try {
        const data = await tryonApi.createJob(nextId, { signal, purpose: 'prefetch' });
        if (signal.aborted) return;
        if (data.state === 'ready') await store(nextId, nextVersion, data.image);
        else if (data.state === 'pending') await watchPrefetch(data.job.id);
        // skipped hoặc lỗi 4xx, 5xx: bỏ qua im lặng
      } catch {
        // im lặng
      }
    };

    if (tabVisible()) {
      at(NEIGHBOR_PRELOAD_MS, () => {
        const { cache: store0 } = latest.current;
        if (prevId && !store0.get(prevId, prevVersion)) inspect(prevId, prevVersion);
        if (nextId && !store0.get(nextId, nextVersion)) inspect(nextId, nextVersion);
      });
    }
    if (ready && nextId) at(PREFETCH_DWELL_MS, prefetchNext);

    return () => {
      controller.abort();
      timers.forEach(clearTimeout);
    };
  }, [product.id, ready, prevId, prevVersion, nextId, nextVersion]);
}
