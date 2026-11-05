import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

const SUCCESS_MS = 4000;
const ERROR_MS = 6000;

const ToastContext = createContext(null);

/** Đặt ở `AdminLayout` để thông báo còn sống sau khi chuyển trang (D-56). */
export function AdminToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);
  const show = useCallback((message, variant = 'success') => {
    clearTimeout(timer.current);
    setToast({ message, variant, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), variant === 'error' ? ERROR_MS : SUCCESS_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center">
        {/* Hai vùng cố định để trình đọc màn hình đọc đúng mức độ (design-system 7.4). */}
        <div role="status">
          {toast?.variant === 'success' && (
            <div
              key={toast.id}
              className="pointer-events-auto flex animate-toast-in items-center gap-2 rounded-md bg-ink px-4 py-3 text-small text-ink-inverse shadow-pop"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              {toast.message}
            </div>
          )}
        </div>
        <div role="alert">
          {toast?.variant === 'error' && (
            <div
              key={toast.id}
              className="pointer-events-auto flex animate-toast-in items-center gap-2 rounded-md bg-danger px-4 py-3 text-small text-ink-inverse shadow-pop"
            >
              <AlertCircle size={18} aria-hidden="true" />
              {toast.message}
              <button
                type="button"
                onClick={dismiss}
                aria-label="Đóng thông báo"
                className="-my-3 -mr-3 ml-1 flex h-11 w-11 items-center justify-center"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useAdminToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useAdminToast phải dùng trong AdminToastProvider');
  return ctx;
}
