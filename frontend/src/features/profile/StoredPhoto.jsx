import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Button } from '../../components/Button.jsx';

/**
 * Ảnh đã lưu qua signed URL (profile-get.md, screens/profile.md "Quy tắc ảnh").
 * - Ảnh lỗi tải (URL hết hạn): tự gọi `onRefresh` đúng 1 lần, vẫn lỗi thì hiện trạng thái H + "Thử lại".
 * - URL mới (làm mới ngầm trước hạn hoặc ảnh mới): tải trước rồi mới đổi `src`, ảnh không nháy.
 * - `photo.url = null` (ký URL lỗi): trạng thái H ngay.
 */
export function StoredPhoto({ photo, onRefresh }) {
  const url = photo.url;
  const [shownUrl, setShownUrl] = useState(url);
  const [loadedUrl, setLoadedUrl] = useState(null);
  const [failedUrl, setFailedUrl] = useState(null);
  const errorRefreshed = useRef(false);

  // Đổi sang URL mới chỉ sau khi ảnh mới đã tải xong, để không nháy.
  useEffect(() => {
    if (!url || url === shownUrl) return undefined;
    // Chưa có ảnh nào đang hiển thị, hoặc ảnh hiện tại đã hỏng: đổi ngay, không cần tải trước.
    if (!shownUrl || errorRefreshed.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShownUrl(url);
      return undefined;
    }
    let cancelled = false;
    const preload = new Image();
    preload.onload = () => {
      if (!cancelled) setShownUrl(url);
    };
    preload.onerror = () => {
      // URL mới cũng hỏng: hiển thị luôn để luồng onError/Thử lại xử lý.
      if (!cancelled) setShownUrl(url);
    };
    preload.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, shownUrl]);

  const src = shownUrl ?? url;
  const failed = !url || failedUrl === src;

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <ImageOff size={32} aria-hidden="true" className="text-ink-subtle" />
        <p className="text-small text-ink-muted">Không tải được ảnh</p>
        <Button
          variant="secondary"
          onClick={() => {
            errorRefreshed.current = false;
            onRefresh();
          }}
        >
          Thử lại
        </Button>
      </div>
    );
  }

  const loaded = loadedUrl === src;
  return (
    <>
      {!loaded && (
        <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-surface-muted" />
      )}
      <img
        src={src}
        alt="Ảnh toàn thân của bạn"
        loading="lazy"
        onLoad={() => {
          errorRefreshed.current = false;
          setLoadedUrl(src);
        }}
        onError={() => {
          if (errorRefreshed.current) {
            setFailedUrl(src);
            return;
          }
          errorRefreshed.current = true;
          onRefresh();
        }}
        className={`h-full w-full object-contain transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </>
  );
}
