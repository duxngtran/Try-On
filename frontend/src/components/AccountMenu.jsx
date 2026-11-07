import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../features/auth/authContext.js';
import { useCart } from '../features/cart/cartContext.js';

const ITEM =
  'flex min-h-12 w-full items-center justify-between gap-2 px-4 text-left text-small font-semibold text-ink hover:bg-surface-muted focus-visible:bg-surface-muted';

/**
 * Avatar + menu tài khoản (header-navigation.md). Mobile (< sm): bottom sheet kèm scrim; từ sm:
 * dropdown dưới avatar. Cùng một DOM, chỉ khác lớp CSS. Esc đóng và trả focus; ↑↓ di chuyển;
 * Tab xoay vòng trong menu (sheet che nội dung phía sau); chạm scrim hoặc click ngoài đóng.
 */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const isAdmin = user.role === 'admin';
  const incomplete = !isAdmin && !user.profileCompleted;

  const closeAndRestoreFocus = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onEscape = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const onMenuKeyDown = (event) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Tab'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const forward = event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey);
    const next = forward ? index + 1 : index - 1;
    items[(next + items.length) % items.length].focus();
  };

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      {isAdmin && (
        <span className="hidden rounded-sm bg-accent-soft px-2 py-0.5 text-caption font-semibold uppercase tracking-wider text-accent-strong sm:inline">
          Admin
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-label="Tài khoản"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full bg-ink text-small font-semibold uppercase text-ink-inverse"
      >
        {user.email.charAt(0)}
        {incomplete && (
          <>
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 h-2 w-2 rounded-full bg-warning"
            />
            <span className="sr-only">Hồ sơ chưa đầy đủ</span>
          </>
        )}
      </button>
      {open && (
        <div
          aria-hidden="true"
          data-testid="account-menu-scrim"
          onClick={closeAndRestoreFocus}
          className="fixed inset-0 z-50 bg-scrim sm:hidden"
        />
      )}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Tài khoản"
          onKeyDown={onMenuKeyDown}
          className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] animate-menu-in overflow-y-auto rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] pt-1 shadow-modal sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-12 sm:z-40 sm:max-h-none sm:w-64 sm:overflow-hidden sm:rounded-lg sm:border sm:pb-0 sm:shadow-pop"
        >
          <p className="truncate px-4 py-2 text-small text-ink-muted" title={user.email}>
            {user.email}
          </p>
          {isAdmin ? (
            <Link role="menuitem" to="/admin" className={ITEM} onClick={closeAndRestoreFocus}>
              Quản trị
            </Link>
          ) : (
            <>
              <Link role="menuitem" to="/" className={ITEM} onClick={closeAndRestoreFocus}>
                Trang chủ
              </Link>
              <Link role="menuitem" to="/try-on" className={ITEM} onClick={closeAndRestoreFocus}>
                Thử đồ
              </Link>
              <Link role="menuitem" to="/cart" className={ITEM} onClick={closeAndRestoreFocus}>
                Giỏ hàng
                {cart?.itemCount > 0 && (
                  <span className="text-small font-normal text-ink-muted">
                    {cart.itemCount} món
                  </span>
                )}
              </Link>
              <Link role="menuitem" to="/orders" className={ITEM} onClick={closeAndRestoreFocus}>
                Đơn của tôi
              </Link>
              <Link role="menuitem" to="/profile" className={ITEM} onClick={closeAndRestoreFocus}>
                Hồ sơ
                {incomplete && (
                  <span className="rounded-sm bg-warning-soft px-2 py-0.5 text-caption font-semibold uppercase tracking-wider text-warning">
                    Còn thiếu
                  </span>
                )}
              </Link>
            </>
          )}
          <hr className="my-1 border-line" />
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
