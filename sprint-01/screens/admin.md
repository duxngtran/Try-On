# Screen Descriptions — Trang quản trị (placeholder)

> US-01 §4.2, §4.4, AC-10 · `GET /api/admin/ping` · D-07, D-14 · Chi tiết quản lý thật ở Epic 2/4.

## Quản trị — `/admin`

### Mục đích
Đích của tài khoản admin sau đăng nhập; khung cho các trang quản trị (danh mục, sản phẩm, đơn hàng) ở các sprint sau; xác nhận quyền admin hoạt động.

### Quyền truy cập
**Admin** (RequireAdmin). Guest → `/login` (`state.from="/admin"`); user thường → trang **403** "Bạn không có quyền truy cập."

### Bố cục
- **Mobile (< 640px)**: một cột, padding 16px: H1 → Card trạng thái → danh sách "Sắp có".
- **Tablet (640–1023px)**: `max-w-2xl`, mục "Sắp có" 2 cột.
- **Desktop (≥ 1024px)**: `max-w-6xl`; trái sidebar `w-56` (chỉ chứa mục "Tổng quan" đang chọn + các mục "Sắp có" disabled) / phải nội dung. Sidebar ẩn ở mobile/tablet (không cần ở sprint 01).

### Các thành phần chính
1. **H1** "Khu vực quản trị" + badge `caption` "ADMIN".
2. **Card trạng thái**: "Bạn đã đăng nhập với quyền quản trị." + email admin; dòng kiểm tra kết nối quyền (tùy chọn): gọi `GET /api/admin/ping` khi vào trang: đang gọi "Đang kiểm tra quyền…" (spinner nhỏ) → thành công `success` "Quyền quản trị hợp lệ" → 403 (hiếm) hiển thị trang 403; 401 → xử lý toàn cục; lỗi mạng "Không kiểm tra được kết nối." + "Thử lại". Việc ping không chặn hiển thị trang.
3. **Danh sách "Sắp có"** (3 card disabled, nền `surface-muted`, badge "SẮP RA MẮT"): "Danh mục" (Epic 2), "Sản phẩm" (Epic 2), "Đơn hàng" (Epic 4); mỗi card icon + mô tả 1 dòng; không bấm được (`aria-disabled`).
4. **Ghi chú quyền riêng tư** `small`: "Quản trị viên không xem được ảnh và số đo của người dùng." (khớp D-14).

### Trạng thái
| Trạng thái | Mô tả |
|---|---|
| Mặc định | Như trên |
| Loading ping | Spinner nhỏ trong card trạng thái (phần còn lại hiển thị ngay) |
| Lỗi ping (mạng/500) | Dòng lỗi nội tuyến + "Thử lại"; không thay cả trang |
| 403 | Trang 403 (xem `header-navigation.md`) |
| Rỗng | Không áp dụng |

### Responsive
Như mục Bố cục.

### Hiệu ứng
Không đáng kể (fade-in 200ms khi dòng ping đổi trạng thái).

### Navigation
- Đến từ: đăng nhập (admin), logo/menu "Quản trị", `/login`/`/register`/`/`/`/profile` khi admin đã đăng nhập (D-33).
- Đi tới: `/login` (đăng xuất). Các mục "Sắp có" chưa điều hướng.

### Accessibility
`h1`, `main`; mục disabled `aria-disabled="true"`; trạng thái ping `role="status"`.

### Ghi chú
- Header admin chỉ có "Quản trị" + menu tài khoản (không "Hồ sơ", không "Trang chủ" của user).
- Admin không có trang hồ sơ; API hồ sơ trả 403 nên FE không bao giờ gọi `/api/profile` với admin.
