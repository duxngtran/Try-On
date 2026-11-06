# Screen Descriptions — Lối vào Giỏ hàng và Đơn hàng (Header, Menu tài khoản, Admin)

> Cập nhật của `sprint-01/screens/header-navigation.md`, `sprint-02/screens/admin.md` · US-07 (số trên header), US-08 §4.1, E16, US-09 AC-09 · D-38, D-141, D-146 · **Chỉ nêu phần thay đổi.**

Không tạo token mới. Component mới: `CartLink`, `CartNotice` (mục 3 và 4); ghép từ token sẵn có (design-system 7.13).

## 1. Header — biểu tượng giỏ hàng (`CartLink`)

### Quyền hiển thị
Chỉ role `user` đã đăng nhập, ở **mọi** trang (kể cả `/profile`, cổng hồ sơ và cổng consent của phòng thử đồ, vì giỏ không phụ thuộc hồ sơ, consent: D-146, US-07 R6). Guest và admin không có (admin không có giỏ, D-14, D-28).

### Thành phần
- **Link** (`<a>` tới `/cart`, không phải `<button>`), vùng chạm **44 × 44px**, icon `ShoppingBag` 24px, nằm giữa nhóm nav và avatar tài khoản, cách avatar 8px. Active ở `/cart` hoặc `/checkout`: gạch chân 2px `ink` ở đáy ô và `aria-current="page"` (cùng cách với nav link khác).
- **Số lượng** (badge): chấm tròn góc trên phải icon, `min-w-5 h-5` (20px), nền `ink`, chữ `ink-inverse` `caption` 700 không uppercase, số = `cart.itemCount` (gồm cả dòng ngừng bán, api.md 7.1). Từ 100 trở lên hiện `99+`. `itemCount = 0` thì **không** hiện badge (không hiện số 0).
- **Cờ có dòng ngừng bán**: khi `cart.hasUnavailable = true`, thêm chấm `warning` 8px ở góc dưới phải icon (cùng mẫu chấm "hồ sơ chưa đầy đủ" ở avatar), để người mua biết giỏ cần xử lý trước khi đặt.
- **Tên truy cập** (`aria-label`, badge và chấm là `aria-hidden`):
  - Chưa biết số (đang tải lần đầu, hoặc tải lỗi): "Giỏ hàng".
  - Trống: "Giỏ hàng, trống".
  - Có hàng: "Giỏ hàng, 3 món". Có dòng ngừng bán: "Giỏ hàng, 3 món, có sản phẩm không còn bán".

### Trạng thái
| Trạng thái | Hiển thị |
|---|---|
| Đang tải `GET /cart` lần đầu | Chỉ icon, **không badge** (tránh nháy "0" rồi nhảy lên). Không skeleton |
| Tải lỗi (mạng, 500) | Chỉ icon, không badge, không báo lỗi ở header. Trang `/cart` có Error state riêng. Thử lại ngầm khi tab hiển thị lại hoặc sau mỗi thao tác giỏ |
| Có số | Như trên |
| Số vừa **tăng** do thêm vào giỏ | Badge nảy `scale 1 → 1.15 → 1` 200ms (chỉ `transform`). Reduced motion: không nảy |
| Số giảm hoặc về 0 | Đổi ngay, không hiệu ứng |

Số cập nhật theo **response** của `POST/PATCH/DELETE /cart…` (cùng dạng `Cart`), không tự cộng trừ ở FE. Nguồn số: `CartProvider` (đặt trong `AuthProvider`); đọc `GET /cart` một lần khi `status = authenticated` và role `user`; xóa sạch bộ nhớ khi đăng xuất, nhận 401 (US-07 R7). Làm mới ngầm (không đổi giao diện) khi tab trở lại hiển thị, **trừ ở `/checkout`** (xem `checkout.md`, mục "Không làm mới ngầm").

### Responsive
- **Mobile 360px:** hàng header gồm logo "Try-on" (~64px) + "Thử đồ" (icon ẩn, ~64px) + `CartLink` 44px + avatar 44px, khoảng cách 8–16px: vừa 328px (360 trừ gutter 32). Không cần chuyển vào menu. Nếu chữ lớn (200% zoom) làm tràn, **ưu tiên giữ `CartLink` trên header** và đẩy "Thử đồ" vào menu tài khoản (như `entry-points.md` sprint 03 đã dự phòng).
- **Tablet, desktop:** cùng vị trí. Không có chữ "Giỏ hàng" cạnh icon (tên truy cập đã đủ; tooltip `title="Giỏ hàng"` cho chuột).

## 2. Menu tài khoản — thêm hai mục (cho role `user`)

Thứ tự: email, Trang chủ, Thử đồ, **Giỏ hàng**, **Đơn của tôi**, Hồ sơ, đường kẻ, Đăng xuất.
- **Giỏ hàng** → `/cart`; bên phải hiện số món dạng chữ `small` `ink-muted` "3 món" khi `itemCount > 0` (không dùng màu làm thông tin duy nhất). Số này giúp người dùng điện thoại không cần nhìn lên header.
- **Đơn của tôi** → `/orders`.
- Giữ nguyên hành vi menu hiện có (↑↓, Tab xoay vòng, Esc, trả focus). `role="menuitem"`, cao ≥ 48px.
- **Không** thêm "Đơn của tôi" vào hàng nav ngang của header: ít dùng hơn, và 360px không đủ chỗ. Đã có lối vào ở menu, trang trống của giỏ, trang `/checkout` khi giỏ rỗng (xem `cart.md`, `checkout.md`).

## 3. `CartNotice` — thông báo của giỏ, cấp Layout

Thông báo "Đã thêm … vào giỏ" và lỗi thêm giỏ khi người mua đã rời sản phẩm đó. Đặt ở `Layout` (không nằm trong `ProductStage`) vì: (a) request thêm có thể về sau khi người mua đã đổi sản phẩm, mà `ProductStage` mount lại theo `key` (US-07 R2, AC-05); (b) cổng hồ sơ, consent có thể gỡ sân khấu giữa chừng (US-07 E10).

- **Hình dạng:** toast theo design-system 7.4 (nền `ink`, chữ `ink-inverse`, `shadow-pop`, icon `Check` `#8FD3B0`), góc **dưới giữa** như `AdminToast`, `useToast` hiện có (giữ nhất quán với code; design-system 7.4 ghi trên-phải ở ≥ md nhưng toàn bộ code đang đặt dưới giữa, xem câu hỏi mở số 6 ở báo cáo). Rộng tối đa 360px, chữ tối đa 3 dòng (`line-clamp-3`, nhưng văn bản trong DOM luôn đầy đủ cho trình đọc màn hình).
- **Không tương tác:** container và toast đều `pointer-events: none`, không có nút đóng, không có link. Lý do: không được chặn chạm, vuốt, hay che mũi tên ở phòng thử đồ trong 4 giây (xem `add-to-cart.md`, mục "Không che mũi tên, vuốt"). Lối tới giỏ nằm ở ghi chú "Trong giỏ" cạnh nút và ở header.
- **Thời gian:** thành công 4 giây. Lỗi (khi người mua đã rời sản phẩm): 6 giây, `role="alert"`, icon `AlertCircle`, nền `danger` (một biến thể của toast `ink`, như design-system 7.4 mô tả toast lỗi). Thông báo mới thay thông báo cũ (không chồng nhau, vì thêm nhanh nhiều sản phẩm sẽ làm tràn).
- **Trình đọc màn hình:** một vùng `role="status"` (`aria-live="polite"`, `aria-atomic="true"`) **luôn tồn tại** trong Layout, nhận chữ của toast thành công; toast lỗi tự có `role="alert"`. Dùng vùng riêng này thay vì vùng `aria-live` của phòng thử đồ, vì vùng của phòng gộp theo 400ms và thay thế nội dung cũ, nên lời xác nhận có thể bị nuốt khi người mua lướt tiếp (đề xuất D-156).
- **Hiệu ứng:** `animate-toast-in` 200ms (opacity + translateY 8px). Reduced motion: hiện tức thì (đã có quy tắc toàn cục).
- **Vị trí so với nút ở phòng thử đồ:** cách đáy `16px + safe-area`. Ở 360×640 toast phủ vùng đáy màn hình trong 4 giây nhưng vì không nhận chạm nên mọi nút bên dưới vẫn bấm được.

## 4. Quản trị — bật "Đơn hàng"

### `AdminNav` (`ADMIN_NAV_ITEMS`)
- Bỏ `soon`, `sidebarOnly` ở mục **Đơn hàng**; thành `NavLink` thường tới `/admin/orders`, icon `ClipboardList` (đã có). Sáng cả ở `/admin/orders/:id` (nhận theo tiền tố, như sản phẩm). Badge "Sắp ra mắt" biến mất.
- **Thanh tab ngang ở < lg giờ có 4 mục** (trước là 3). Ở 360px, 4 mục kèm icon rộng ~420px, quá 328px. Cách xử lý: ở < sm **ẩn icon** trong tab (chữ đủ rõ, mỗi tab còn ~84px: "Tổng quan", "Danh mục", "Sản phẩm", "Đơn hàng" ≈ 340px), padding ngang 12px; nếu vẫn tràn thì `overflow-x-auto`, mục đang chọn được `scrollIntoView({ inline: 'nearest' })` khi vào trang, và mép phải có dải mờ `canvas` 16px gợi còn mục (như chip danh mục). Từ sm trở lên hiện icon.
- Mục đang chọn vẫn `aria-current="page"` và gạch chân 2px `ink`.

### Card "Đơn hàng" ở `/admin`
- Bỏ disabled và badge "SẮP RA MẮT". Thành `<a>` tới `/admin/orders`, icon `ClipboardList`, mô tả "Xem danh sách đơn hàng và thông tin nhận hàng." Không hiện số liệu (không thêm API, như D-53). Trạng thái hover, focus, active giống card "Sản phẩm".
- Ba card Danh mục, Sản phẩm, Đơn hàng: mobile xếp dọc (cao ≥ 72px); tablet 2 cột; desktop 3 cột (đã đủ chỗ như sprint 02 dự kiến).

## 5. Bảo vệ route

| Route | Guest | `user` | `admin` |
|---|---|---|---|
| `/cart`, `/checkout`, `/orders`, `/orders/:id` | `/login`, sau đăng nhập về lại đúng URL | Vào | Chuyển về `/admin` (như D-38, không hiện trang 403; US-08 E16) |
| `/admin/orders`, `/admin/orders/:id` | `/login` | Trang 403 (`RequireAdmin`, như các trang admin) | Vào |

`document.title`: "Giỏ hàng — Try-on", "Đặt hàng — Try-on", "Đơn của tôi — Try-on", "Đơn DH000123 — Try-on", "Đơn hàng — Try-on" (admin), "DH000123 — Đơn hàng — Try-on" (admin chi tiết). Sau mỗi lần đổi pathname `RouteFocus` đưa focus vào `h1` (giữ nguyên cơ chế sẵn có).

## Navigation
- Đến `/cart` từ: `CartLink`, menu tài khoản, ghi chú "Xem giỏ hàng" cạnh nút Thêm vào giỏ, `/checkout` (Quay lại giỏ hàng, và khi giỏ đổi/ngừng bán/rỗng), URL trực tiếp.
- Đến `/orders` từ: menu tài khoản, giỏ trống, `/checkout` khi `CART_EMPTY`, trang chi tiết đơn (Quay lại).
