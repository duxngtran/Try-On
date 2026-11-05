# Screen Descriptions — Khung quản trị (AdminLayout) và trang `/admin` (cập nhật)

> Cập nhật từ `sprint-01/screens/admin.md` · US-03, US-04 · D-07, D-14, D-53 · Component mới: `AdminNav` (design-system 7.11)

## Phần thay đổi so với Sprint 01

| Hạng mục | Sprint 01 | Sprint 02 |
|---|---|---|
| Khung các trang `/admin/*` | Chỉ có `/admin` | Mọi route `/admin` và `/admin/*` dùng chung `AdminLayout` (bên trong `Layout`): có `AdminNav` |
| Card "Danh mục", "Sản phẩm" | Disabled, "SẮP RA MẮT" | **Bấm được**, dẫn tới `/admin/categories`, `/admin/products` |
| Card "Đơn hàng" | Disabled | Giữ nguyên (Epic 4) |
| Link "Quản trị" trên header | Active khi ở `/admin` | Active khi ở bất kỳ `/admin/*` (NavLink không dùng `end`) |
| Ping `GET /api/admin/ping` | Có | Giữ nguyên, chỉ ở `/admin` |

Các phần còn lại của `/admin` (H1 "Khu vực quản trị", card trạng thái, ghi chú quyền riêng tư D-14) giữ nguyên.

## AdminLayout — khung chung của `/admin/*`

### Mục đích
Cho admin chuyển nhanh giữa Tổng quan, Danh mục, Sản phẩm mà không phải quay về `/admin`.

### Quyền truy cập
Admin (`RequireAdmin`). Guest → `/login` (`state.from` = đường dẫn đang vào). User thường → trang 403 (không đổi so với Sprint 01).

### Các thành phần chính
1. **AdminNav**
   - Mục: Tổng quan (`/admin`, `end`), Danh mục (`/admin/categories`), Sản phẩm (`/admin/products`, sáng cả ở `/new` và `/:id/edit`), Đơn hàng (disabled, badge "SẮP RA MẮT", chỉ ở sidebar).
   - Tương tác: bấm/Enter để chuyển route; mục đang ở có `aria-current="page"`.
   - Trạng thái: default / hover (nền `surface-muted`) / focus-visible (vòng focus chuẩn) / current / disabled (`aria-disabled="true"`, không focus được bằng Tab, không phải link).
   - Hiệu ứng: đổi nền 120ms; không có animation chuyển trang.
2. **Vùng nội dung** (`Outlet`): mỗi trang con tự có `h1`.
3. **Toast** hiển thị ở cấp layout để thông báo còn sống sau khi chuyển trang (ví dụ "Đã thêm sản phẩm" hiện ở danh sách sau khi lưu xong). Chi tiết ở từng màn.

### Responsive
- **Mobile 360px (< 640px)**: `AdminNav` là thanh tab ngang ngay dưới header, cao 44px, cuộn ngang nếu thiếu chỗ (3 mục "Tổng quan / Danh mục / Sản phẩm" vừa 360px nên bình thường không cuộn). Nội dung một cột, padding 16px.
- **Tablet 768px (640–1023px)**: thanh tab như trên, nội dung `max-w-3xl` căn giữa, padding 24px.
- **Desktop 1280px (≥ 1024px)**: sidebar `w-56` bên trái (sticky `top-20`), nội dung bên phải `max-w-4xl`; tổng bề rộng `max-w-6xl`, khoảng cách giữa hai cột 32px. Thanh tab ẩn.

### Accessibility
- `AdminNav` là `<nav aria-label="Quản trị">` (tách biệt với `nav` "Điều hướng chính" của header).
- Thanh tab ngang: vùng cuộn có thể focus được khi cần (`tabindex="0"` chỉ khi thực sự tràn), mỗi mục cao ≥ 44px.
- Sau mỗi chuyển route focus vào `h1` của trang con (cơ chế `RouteFocus` sẵn có); `document.title` dạng "Danh mục — Try-on".

## Quản trị — `/admin` (cập nhật)

### Mục đích
Giống Sprint 01, thêm lối vào hai trang quản lý kho hàng.

### Quyền truy cập
Admin.

### Các thành phần thay đổi
1. **Card "Danh mục"**: icon `Tags`, mô tả "Thêm, đổi tên, xóa danh mục sản phẩm." Là `<a>` tới `/admin/categories`.
2. **Card "Sản phẩm"**: icon `Shirt`, mô tả "Thêm, sửa, xóa sản phẩm và ảnh." Là `<a>` tới `/admin/products`.
3. **Card "Đơn hàng"**: không đổi (disabled, "SẮP RA MẮT").
   - Trạng thái card bấm được: default (nền `surface`, viền `line`) / hover (viền `line-strong`, shadow `card`) / focus-visible / active. Card không hiển thị số liệu (không thêm API; D-53).
   - Hiệu ứng: viền + shadow đổi 120ms.

### Responsive
- Mobile: 3 card xếp dọc, mỗi card cao ≥ 72px.
- Tablet: 2 cột. Desktop: nằm cạnh sidebar, 3 cột trong vùng nội dung.

### Navigation
- Đến từ: đăng nhập (admin), logo, link "Quản trị", `AdminNav`.
- Đi tới: `/admin/categories`, `/admin/products`.

### Ghi chú
- Với admin, `AdminNav` mục "Tổng quan" gần như trùng với danh sách card; chấp nhận vì card là lối vào chính cho người mới, nav là lối đi nhanh về sau.
