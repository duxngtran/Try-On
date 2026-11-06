# Screen Descriptions — Quản trị: Danh sách đơn hàng và Chi tiết đơn

> US-09 §4–§9 (AC-01 → AC-09) · `GET /api/admin/orders`, `GET /api/admin/orders/:id` · D-14, D-28, D-42, D-44, D-46, D-61, D-65, D-119, D-138, D-139, D-151 · Flow: `design/flows/admin-orders.md` · `AdminNav` và card `/admin`: [`entry-points.md`](entry-points.md) mục 4 · Mẫu danh sách: `sprint-02/screens/products.md`

Không tạo token mới. Dùng lại `AdminLayout`, `AdminNav`, `DataList`, phân trang, `ProductThumb`, Error/Empty state. Component mới: `AdminOrderRow`, `AdminOrderItemRow`.

**Chỉ đọc.** Không có nút Sửa, Xóa, Hủy, Đổi trạng thái, Xuất file, Tìm kiếm, Lọc (US-09 §3, R2). **Không có cột hay nhãn trạng thái** ("Mới", "Đang xử lý"…, R6, D-138). Không hiện ảnh hồ sơ, ảnh try-on, số đo, consent (D-14, R4).

---

## Đơn hàng — `/admin/orders`

### Mục đích
Admin xem các đơn đã đặt (mới nhất trước) để biết ai mua gì và mở chi tiết khi cần liên hệ.

### Quyền truy cập
Admin (`RequireAdmin`). Guest → `/login`. Người mua → trang 403.

### Trạng thái URL
`/admin/orders?page=<n>`. `page = 1` thì bỏ khỏi URL. `limit` cố định 20. Mỗi lần đổi trang là một mục lịch sử. `page` sai (không phải số nguyên ≥ 1) → coi là 1 (E4). `page` vượt tổng trang (`items: []`, `total > 0`) → tự chuyển (replace) sang trang cuối; `total = 0` → trạng thái rỗng (E5, D-61).

### Bố cục tổng
1. Hàng tiêu đề: `h1` "Đơn hàng" + `small` `ink-muted` "{total} đơn" (ẩn khi tải lần đầu). **Không** có nút "Thêm".
2. `DataList` các đơn.
3. Phân trang.

### Các thành phần chính

#### 1. Dòng đơn (`AdminOrderRow`)
- **Nội dung:** số đơn `DH000123` (`body` 700, `tabular-nums`) · thời gian `09:00, 06/11/2026` (`Asia/Ho_Chi_Minh`, `small`) · **tên người nhận** (`recipientName`, `body`, tối đa 1 dòng, `…`, `title` đầy đủ) · "{itemCount} món" · tổng tiền (`body` 600, `tabular-nums`) · icon `ChevronRight` (`aria-hidden`).
- **Không** có số điện thoại, địa chỉ, email, `userId` ở danh sách (R3, AC-03); chúng chỉ có ở chi tiết. Không có ảnh.
- **Cả dòng là một `<a>`** thật tới `/admin/orders/:id` (Tab và Enter dùng được, US-09 §9), mang `state.from` = `location.search`. Trạng thái: default / hover (nền `surface-muted`) / focus-visible (vòng focus, offset -2) / active.
- **Hiệu ứng:** đổi nền 120ms.

#### 2. Phân trang
Giống `products.md`: `<nav aria-label="Phân trang">`, "Trước" / "Trang 2 / 2" (`aria-live="polite"`) / "Sau", dòng tóm tắt "Hiển thị 21–25 trên 25 đơn". Ẩn khi `totalPages ≤ 1`. Bấm: đổi `page`, cuộn về đầu, focus `h1`.

### Trạng thái màn hình

| Trạng thái | Hiển thị |
|---|---|
| Đang tải lần đầu | `h1` thật + 5 dòng skeleton đúng cấu trúc dòng; `aria-busy`; `role="status"` ẩn "Đang tải đơn hàng" |
| Đổi trang | Giữ dòng cũ mờ 60%, `aria-busy`, `inert`; không skeleton |
| Có dữ liệu | Như trên |
| Rỗng | Empty state: icon `ClipboardList` 40px, "Chưa có đơn hàng nào." (không CTA: admin không tạo đơn) |
| Lỗi tải (mạng, 500) (E6) | Error state "Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại." + **Thử lại**. Có dữ liệu cũ: giữ dòng cũ + Alert `danger` + Thử lại |
| 400 `VALIDATION_ERROR` (URL sai mà FE chưa chuẩn hóa) | Chuyển về trang 1 (replace), không hiện lỗi |
| 401 / `TOKEN_EXPIRED` | Xử lý toàn cục |
| 403 | Trang 403 sẵn có (`RequireAdmin`) |
| Đơn mới trong lúc đang xem | **Không** cập nhật thời gian thực (AC-08); thấy khi tải lại trang |

### Responsive
- **Mobile 360px:** mỗi đơn là một card nhỏ (cao ≥ 80px): hàng 1 = số đơn (trái) · tổng tiền (phải); hàng 2 = tên người nhận (tối đa 1 dòng); hàng 3 = thời gian · "3 món" · chevron. Phân trang như `products.md`.
- **Tablet 768px:** lưới `[số đơn 130px] [người nhận 1fr] [thời gian 150px] [số món 72px] [tổng tiền 130px] [chevron 24px]` với hàng tiêu đề cột `caption` (`aria-hidden`: "SỐ ĐƠN", "NGƯỜI NHẬN", "THỜI GIAN", "SỐ MÓN", "TỔNG TIỀN").
- **Desktop ≥ 1024px:** như tablet trong cột nội dung `max-w-4xl` cạnh sidebar; hover dòng đổi nền nhẹ; `title` cho tên bị cắt.

### Trình đọc màn hình
`h1` "Đơn hàng". Danh sách là `<ul>`, mỗi `<li>` một `<a>` có chữ ẩn đủ thông tin: "DH000123, người nhận {tên}, 09:00 ngày 06/11/2026, 3 món, 848.000 đồng". Sau đổi trang: vùng `aria-live="polite"` ẩn "Hiển thị 20 đơn, trang 2 trên 2".

---

## Chi tiết đơn — `/admin/orders/:id`

### Mục đích
Admin xem đầy đủ một đơn: người nhận, số điện thoại, địa chỉ, các dòng hàng theo bản chụp, tổng tiền, để liên hệ người mua.

### Quyền truy cập
Admin. Id sai định dạng hoặc không có: cùng kết quả 404 (E3).

### Bố cục tổng
1. Link "← Đơn hàng" (→ `/admin/orders` + `state.from`, giữ đúng trang; vùng chạm 44px).
2. `h1` "Đơn DH000123" + `small` `ink-muted` "Đặt lúc 09:00, 06/11/2026".
3. `Alert` `info`, `role="group"`: "Chưa thanh toán trực tuyến." (cố định, US-09 §4.2.3). **Không** có trạng thái, thanh tiến độ.
4. **Thông tin người mua và nhận hàng** (card với `<dl>`): **Tài khoản** (`buyerEmail`) · **Người nhận** · **Số điện thoại** · **Địa chỉ** (`pre-line`, `break-words`).
5. **Danh sách dòng hàng** (`AdminOrderItemRow`) và tổng tiền.
6. Dòng `small` `ink-muted`: "Tên, giá và số lượng ghi theo lúc đặt hàng. Ảnh là ảnh hiện tại của sản phẩm."
7. Dòng `small` `ink-muted` có icon `Info`: "Đây là dữ liệu cá nhân của người mua, chỉ dùng để liên hệ về đơn này."

### Các thành phần chính

#### 1. Thông tin người mua và nhận hàng
- Số điện thoại là chữ thường, **kèm** link `tel:` (chỉ trên thiết bị cảm ứng, `@media (pointer: coarse)`, nút `secondary` cao 44px, `aria-label` "Gọi {số điện thoại}") để admin dùng điện thoại gọi ngay; trên desktop chỉ chữ chọn được. Không có nút sao chép, không có "Gửi tin".
- Email (`buyerEmail`) hiển thị nguyên văn, `break-all`, `small` `ink-muted` dưới nhãn "Tài khoản"; không phải link `mailto:`.
- **Không** hiển thị `userId`, `idempotencyKey`, ảnh hồ sơ, ảnh try-on, chiều cao, cân nặng, consent (AC-06).

#### 2. Dòng hàng (`AdminOrderItemRow`)
- Ảnh (`ProductThumb` 56px mobile, 64px ≥ md, `alt` = tên bản chụp) · **tên** (bản chụp) · "{`unitPriceVnd`} × {`quantity`}" · **thành tiền** `lineTotalVnd` (`tabular-nums`, căn phải).
- `stillOnSale = false`: huy hiệu `warning-soft` icon `PackageX` "Đã ngừng bán" (US-09 AC-04). Tên và giá vẫn theo bản chụp (R5, AC-04). Ảnh còn nhờ D-42; ảnh lỗi: `ImageOff` (E8), phần còn lại vẫn hiện.
- Hàng cuối: "Tổng tiền" + "{itemCount} món" + `totalVnd` (bản chụp, không tính lại).

### Trạng thái màn hình

| Trạng thái | Hiển thị |
|---|---|
| Đang tải | `h1` "Đơn hàng" + skeleton (card thông tin, 3 dòng hàng); `aria-busy`; `role="status"` ẩn "Đang tải đơn hàng" |
| Có dữ liệu | Như trên |
| 404 `NOT_FOUND` (E3) | Icon `SearchX` 40px, `h2` "Không tìm thấy đơn hàng.", nút secondary **Về danh sách đơn hàng** → `/admin/orders` |
| Lỗi tải (E6) | Error state + **Thử lại** + link "Về danh sách đơn hàng" |
| Sản phẩm trong đơn đã xóa mềm (E7) | Hiện đủ theo bản chụp, có nhãn "Đã ngừng bán" |
| 401, 403 | Như danh sách |

### Responsive
- **Mobile 360px:** một cột: card thông tin (`<dl>` xếp dọc), danh sách dòng (ảnh 56px · tên · "giá × số lượng" · thành tiền căn phải ở hàng 2), tổng tiền. Nút `tel:` rộng 100% (chỉ khi `pointer: coarse`).
- **Tablet 768px:** `max-w-3xl`, `<dl>` hai cột (nhãn 140px, giá trị); dòng hàng một hàng ngang.
- **Desktop ≥ 1024px:** cột nội dung `max-w-4xl` cạnh sidebar; card thông tin ở trên, danh sách dòng bên dưới (không chia hai cột để dòng hàng đủ rộng).

### Focus và trình đọc màn hình
`RouteFocus` → `h1`. Tab: Quay lại → (nút `tel:` nếu có) → không còn phần tử tương tác khác. `<dl>` dùng `<dt>`/`<dd>` thật. Tiền đọc "199.000 đồng". Quay lại bằng link giữ đúng trang; Back của trình duyệt cũng về đúng trang vì trang nằm trên URL (AC-09).

### Motion và `prefers-reduced-motion`
Skeleton shimmer 1,5s (tắt khi reduced motion), đổi nền hover 120ms. Không có animation khác.

### Navigation
- Đến từ: `/admin/orders`, `AdminNav`, card "Đơn hàng" ở `/admin`.
- Đi tới: `/admin/orders` (Quay lại, giữ trang), `/login` (401).

### Ghi chú
- **Dữ liệu cá nhân:** admin được xem họ tên, số điện thoại, địa chỉ, email vì cần liên hệ (mở rộng có chủ đích của D-14, D-151). Chưa có nhật ký ai xem gì; chấp nhận với một tài khoản admin (US-09 §9), xem lại trước khi ra mắt.
- Số điện thoại, địa chỉ, tên **không** vào tiêu đề tab, URL, log hay `localStorage`.
- Không có trạng thái, lọc, xuất file, thống kê (US-09 §3).
- Frontend **không** hiển thị `error.message` của server (D-119).
