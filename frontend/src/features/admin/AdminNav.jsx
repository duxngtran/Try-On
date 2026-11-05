import { NavLink } from 'react-router';
import { Boxes, ClipboardList, LayoutDashboard, Tags } from 'lucide-react';

// `soon`: chưa có trang (Đơn hàng ở Epic 4).
export const ADMIN_NAV_ITEMS = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/categories', label: 'Danh mục', icon: Tags },
  { to: '/admin/products', label: 'Sản phẩm', icon: Boxes },
  { to: '/admin/orders', label: 'Đơn hàng', icon: ClipboardList, soon: true, sidebarOnly: true },
];

const ITEM =
  'flex h-11 shrink-0 items-center gap-2 px-3 text-small font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const linkClass = ({ isActive }) =>
  [
    ITEM,
    'border-b-2 lg:rounded-md lg:border-b-0',
    isActive
      ? 'border-ink text-ink lg:bg-surface-muted'
      : 'border-transparent text-ink-muted hover:text-ink lg:hover:bg-surface-muted',
  ].join(' ');

/** Điều hướng quản trị (design-system 7.11): sidebar từ lg, thanh tab ngang bên dưới. */
export function AdminNav() {
  return (
    <nav aria-label="Quản trị" className="border-b border-line lg:w-56 lg:shrink-0 lg:border-b-0">
      <ul className="-mb-px flex overflow-x-auto lg:sticky lg:top-20 lg:mb-0 lg:flex-col lg:gap-1">
        {ADMIN_NAV_ITEMS.map(({ to, label, icon: Icon, end, soon, sidebarOnly }) => (
          <li key={to} className={sidebarOnly ? 'hidden lg:block' : undefined}>
            {soon ? (
              <span
                aria-disabled="true"
                className={`${ITEM} cursor-not-allowed border-b-2 border-transparent text-disabled-ink lg:border-b-0`}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
                <span className="hidden text-caption uppercase tracking-wider lg:inline">
                  Sắp ra mắt
                </span>
              </span>
            ) : (
              <NavLink to={to} end={end} className={linkClass}>
                <Icon size={18} aria-hidden="true" />
                {label}
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
