import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../features/auth/authContext.js';

const ITEM =
  'flex min-h-12 w-full items-center justify-between gap-2 px-4 text-left text-small font-semibold text-ink hover:bg-surface-muted focus-visible:bg-surface-muted';

/** Avatar + menu tài khoản (header-navigation.md). Esc đóng và trả focus; ↑↓ di chuyển; click ngoài đóng. */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const isAdmin = user.role === 'admin';
  const incomplete = !isAdmin && !user.profileCompleted;

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
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
          ref={menuRef}
          role="menu"
          aria-label="Tài khoản"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-pop"
        >
          <p className="truncate px-4 py-2 text-small text-ink-muted" title={user.email}>
            {user.email}
          </p>
          {isAdmin ? (
            <Link role="menuitem" to="/admin" className={ITEM} onClick={() => setOpen(false)}>
              Quản trị
            </Link>
          ) : (
            <>
              <Link role="menuitem" to="/" className={ITEM} onClick={() => setOpen(false)}>
                Trang chủ
              </Link>
              <Link role="menuitem" to="/profile" className={ITEM} onClick={() => setOpen(false)}>
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
