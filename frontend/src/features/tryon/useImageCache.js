import { useState } from 'react';
import { URL_REFRESH_BEFORE_MS } from './tryonConfig.js';

const keyOf = (productId, imageVersion) => `${productId}:${imageVersion}`;

/**
 * Bộ nhớ ảnh thử đồ ở frontend, khóa `(productId, image.version)` để đổi ảnh sản phẩm thì không hiện ảnh cũ
 * (US-06 R9, try-on-states.md mục 5). Chỉ trong bộ nhớ của trang: không `localStorage`, không log, vì giá trị là
 * signed URL. Mất khi phòng bị gỡ khỏi màn hình (403/409, rút consent) hoặc rời trang; `clear()` khi cần.
 * @returns {{
 *   get(productId: string, imageVersion: number): object | null,
 *   set(productId: string, imageVersion: number, image: object): void,
 *   drop(productId: string, imageVersion: number): void,
 *   clear(): void,
 * }}
 */
export function createImageCache() {
  const map = new Map();
  return {
    get(productId, imageVersion) {
      const key = keyOf(productId, imageVersion);
      const image = map.get(key);
      if (!image) return null;
      // Sắp hết hạn thì coi như không có: hiện URL sắp chết chỉ gây lỗi tải.
      if (Date.parse(image.expiresAt) - Date.now() <= URL_REFRESH_BEFORE_MS) {
        map.delete(key);
        return null;
      }
      return image;
    },
    set(productId, imageVersion, image) {
      map.set(keyOf(productId, imageVersion), image);
    },
    drop(productId, imageVersion) {
      map.delete(keyOf(productId, imageVersion));
    },
    clear() {
      map.clear();
    },
  };
}

/** Một bộ nhớ ổn định suốt vòng đời của component. */
export function useImageCache() {
  const [cache] = useState(createImageCache);
  return cache;
}
