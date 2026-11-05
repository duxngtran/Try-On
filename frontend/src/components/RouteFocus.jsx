import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * Sau mỗi lần đổi route chuyển focus vào `h1` của trang mới (header-navigation.md); không chạy ở
 * lần tải đầu. Nếu focus đã nằm sẵn trong `main` (ví dụ ô Email tự focus ở /login) thì giữ nguyên.
 * Render sau <Routes> để trang mới đã mount xong khi effect chạy.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;

    const main = document.querySelector('main');
    const active = document.activeElement;
    if (main && active && active !== main && main.contains(active)) return;

    const target = main?.querySelector('h1') ?? main;
    if (!target) return;
    // h1 không focus được mặc định; tabindex=-1 chỉ cho focus bằng code, không thêm vào thứ tự Tab
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
