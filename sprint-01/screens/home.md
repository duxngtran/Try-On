# Screen Descriptions — Trang chủ (placeholder)

> US-01 §4.2.4, `post-login-navigation.md` · Sprint 01 chỉ làm khung; Phòng thử đồ thuộc Epic 3.

## Trang chủ — `/`

### Mục đích
Đích mặc định sau đăng nhập khi hồ sơ đã đầy đủ; nhắc user hoàn thiện hồ sơ nếu còn thiếu; chỗ giữ cho Phòng thử đồ/danh mục ở các sprint sau.

### Quyền truy cập
Đã đăng nhập, role `user` (RequireAuth). Guest → `/login`; admin → `/admin`.

### Bố cục
- **Mobile (< 640px)**: một cột, padding 16px: lời chào → banner (nếu cần) → card "Phòng thử đồ".
- **Tablet (640–1023px)**: `max-w-2xl` căn giữa, cùng thứ tự.
- **Desktop (≥ 1024px)**: `max-w-6xl`; lời chào + banner chiếm hàng trên; card "Phòng thử đồ" rộng đầy (hero editorial: khối nền `surface-muted` bên phải làm chỗ cho ảnh thử đồ sau này, `aria-hidden`).

### Các thành phần chính
1. **Lời chào** — H1 (`display`) "Xin chào" + phụ đề `body` `ink-muted` là email (cắt `…`). Không dùng tên (không thu thập, D-08).
2. **Banner hồ sơ** (chỉ khi `profileCompleted=false`; dữ liệu từ `user.profileCompleted` của `/me`, không gọi `/profile`): Card `accent-soft` "Hoàn thiện hồ sơ để bắt đầu thử đồ" + mô tả "Thêm ảnh toàn thân và số đo của bạn." + nút primary "Hoàn thiện hồ sơ" → `/profile`. Banner không đóng được (đến khi hoàn thiện).
3. **Card "Phòng thử đồ"** (placeholder): ảnh/trang trí CSS (gradient `surface-muted` → `accent-soft`, icon `Shirt`), tiêu đề "Phòng thử đồ", badge `caption` "SẮP RA MẮT", mô tả "Chọn danh mục, vuốt để xem bạn mặc từng sản phẩm. Tính năng đang được hoàn thiện." Nút "Vào phòng thử đồ" **disabled** (`aria-disabled`, `aria-describedby` mô tả "Sắp ra mắt"). Khi hồ sơ đầy đủ chỉ thêm dòng `small` `success` "Hồ sơ của bạn đã sẵn sàng."

### Trạng thái
| Trạng thái | Mô tả |
|---|---|
| Mặc định (hồ sơ đầy đủ) | Lời chào + card placeholder + dòng sẵn sàng |
| Hồ sơ chưa đầy đủ | Thêm banner ở trên card |
| Loading | Không có dữ liệu riêng (dùng `user` đã có từ phiên); nếu phiên đang khôi phục → màn chờ chung |
| Lỗi / rỗng | Không áp dụng ở sprint 01 (không có danh sách); lỗi phiên xử lý ở guard |

### Responsive
Như mục Bố cục.

### Hiệu ứng
Card hover (desktop) nâng shadow 120ms; không animation khác.

### Navigation
- Đến từ: đăng nhập (hồ sơ đầy đủ), logo/menu "Trang chủ", nút "Về trang chủ" ở `/profile`, 403, 404.
- Đi tới: `/profile` (banner, menu), `/login` (đăng xuất).

### Accessibility
`h1` duy nhất; nút disabled dùng `aria-disabled` + mô tả; banner `role="status"` (không `alert`).

### Ghi chú
Nội dung placeholder sẽ được thay ở Epic 3 (US-05); không đầu tư tương tác.
