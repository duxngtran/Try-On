import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

const TOAST_MS = 4000;

/** Toast thành công (design-system 7.4): `show(message)` rồi render `<ToastRegion toast={toast} />`. */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((message) => {
    clearTimeout(timer.current);
    setToast({ message, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, show };
}

export function ToastRegion({ toast }) {
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-center">
      <div role="status">
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex animate-toast-in items-center gap-2 rounded-md bg-ink px-4 py-3 text-small text-ink-inverse shadow-pop"
          >
            <CheckCircle2 size={18} aria-hidden="true" />
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
