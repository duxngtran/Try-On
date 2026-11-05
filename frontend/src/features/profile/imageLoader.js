/**
 * Đọc kích thước ảnh qua `Image` (trình duyệt tự áp EXIF). Trả `{ url, width, height }`, `url` là
 * object URL dùng làm ảnh xem trước; người gọi phải `URL.revokeObjectURL(url)` khi bỏ preview.
 * Ném lỗi nếu không đọc được (đã tự thu hồi URL).
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_UNREADABLE'));
    };
    image.src = url;
  });
}
