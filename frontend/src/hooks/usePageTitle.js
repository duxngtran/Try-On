import { useEffect } from 'react';

/** Đặt `document.title` dạng "<Tên trang> — Try-on". */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — Try-on` : 'Try-on';
  }, [title]);
}
