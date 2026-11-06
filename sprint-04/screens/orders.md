# Screen Descriptions — Đơn của tôi và Chi tiết đơn (kiêm xác nhận đơn)

> US-08 §4.3 bước 6, §4.4, §5 (E8, E14), §7 (R6, R8, R12, R13), AC-09, AC-15, AC-19 · `GET /api/orders`, `GET /api/orders/:id` · D-61, D-65, D-137, D-138, D-142, D-150, D-153 · Flow: `design/flows/order-view.md` · Bảng mã lỗi → giao diện: [`error-map.md`](error-map.md)

Không tạo token mới. Component mới: `OrderRow`, `OrderItemRow` (ghép từ `ProductThumb`, `DataList`, phân trang như `ProductsPage`).

**Không có trang "xác nhận đơn" riêng.** Sau khi đặt, người mua tới chính `/orders/:id` kèm banner xác nhận (cùng một trang, nên tải lại hay mở lại từ "Đơn của tôi" đều giống nhau, và Back không quay về form). Banner chỉ hiện khi tới từ `/checkout`.

Quy tắc chữ cho cả hai trang (D-138, D-153): **không** có trạng thái đơn ("Mới", "Đang xử lý", "Đang giao", "Hoàn tất"), **không** có nút hay chữ "Hủy đơn", "Sửa đơn", "Theo dõi đơn", **không** nói "thành công", "đã thanh toán", "thanh toán khi nhận hàng".

---

## Đơn của tôi — `/orders`

### Mục đích
Người mua xem lại các đơn đã đặt (mới nhất trước), và là chỗ kiểm tra khi mất kết nối lúc đặt hàng hay đặt ở tab khác (US-08 E4, E7).

### Quyền truy cập
Đã đăng nhập, role `user`. Guest → `/login`. Admin → `/admin`. Chỉ thấy đơn của chính mình (chủ sở hữu là `req.user.id`).

### Trạng thái URL
`/orders?page=<n>`. `page` mặc định 1 thì bỏ khỏi URL. `limit` cố định 20, không có ô chọn. Đổi trang là một mục lịch sử (Back quay về trang trước). `page` sai (không phải số nguyên ≥ 1) → FE coi là 1 trước khi gọi. `page` vượt tổng trang (`items: []`, `total > 0`) → tự chuyển (replace) về trang cuối (D-61, D-65).

### Bố cục tổng
1. `h1` "Đơn của tôi" + `small` `ink-muted` "{total} đơn" (ẩn khi tải lần đầu).
2. Dòng `small` `ink-muted` dưới tiêu đề: "Các đơn chưa thanh toán trực tuyến. Cửa hàng sẽ liên hệ theo số điện thoại bạn cung cấp."
3. Danh sách `OrderRow` (card chung, `divide-line`).
4. Phân trang.

### Các thành phần chính

#### 1. Dòng đơn (`OrderRow`)
- **Nội dung:** số đơn `DH000123` (`body` 700, `tabular-nums`) · thời gian đặt dạng `09:00, 06/11/2026` theo `Asia/Ho_Chi_Minh` (`small` `ink-muted`, thẻ `<time dateTime>`) · "3 món" (`small` `ink-muted`) · tổng tiền `848.000 ₫` (`body` 600, `tabular-nums`) · icon `ChevronRight` 20px (`aria-hidden`). **Không** có số điện thoại, địa chỉ, tên người nhận, trạng thái, ảnh (summary không có, AC-19).
- **Cả dòng là một `<a>`** tới `/orders/:id`, mang `state.from` = `location.search` để nút quay lại về đúng trang. `aria-label` không cần: nội dung đã đủ ("DH000123, 09:00 ngày 06/11/2026, 3 món, 848.000 đồng" qua chữ `sr-only` ở thời gian và tiền).
- **Trạng thái:** default / hover (nền `surface-muted`) / focus-visible (vòng focus chuẩn, `outline-offset` -2 để không bị cắt) / active.
- **Hiệu ứng:** đổi nền 120ms.

#### 2. Phân trang
`<nav aria-label="Phân trang">` như `ProductsPage` (design-system 7.11): "Trước" · "Trang 2 / 3" · "Sau" (cao 44px, icon), dòng tóm tắt `small` "Hiển thị 21–25 trên 25 đơn". Ẩn khi `totalPages ≤ 1`. Bấm: đổi `page`, cuộn về đầu, focus vào `h1`. "Trước" aria-disabled ở trang 1, "Sau" ở trang cuối.

### Trạng thái màn hình

| Trạng thái | Hiển thị |
|---|---|
| Đang tải lần đầu | `h1` thật + 5 dòng skeleton (thanh số đơn, thanh thời gian, thanh tiền); `aria-busy="true"`; `role="status"` ẩn "Đang tải đơn hàng" |
| Đổi trang | Giữ dòng cũ mờ 60%, `aria-busy`, dòng `inert`; không skeleton |
| Có dữ liệu | Như trên |
| **Rỗng** (`total = 0`) | Empty state: icon `ReceiptText` 40px `ink-subtle`, `h2` "Bạn chưa có đơn hàng nào.", `small` "Thử đồ rồi đặt hàng, đơn sẽ hiện ở đây.", nút primary **Vào phòng thử đồ** → `/try-on` |
| Lỗi tải (mạng, 500) | Error state: "Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại." + **Thử lại**. Đã có dữ liệu cũ (lỗi khi đổi trang): giữ dòng cũ + Alert `danger` phía trên + Thử lại |
| 429 `TOO_MANY_REQUESTS` | Alert `warning`: "Bạn thao tác quá nhanh, thử lại sau {N} giây." + **Thử lại** aria-disabled tới hết giờ |
| 401 | API client về `/login` |

### Responsive
- **Mobile 360px:** mỗi đơn là một khối (cao ≥ 72px): hàng 1 = số đơn (trái) · tổng tiền (phải); hàng 2 = thời gian · "3 món" · chevron (phải). Phân trang: "Trước"/"Sau" ở hai đầu, "Trang x / y" ở giữa.
- **Tablet 768px:** lưới `[số đơn 140px] [thời gian 1fr] [số món 80px] [tổng tiền 140px] [chevron 24px]` kèm hàng tiêu đề cột (`caption`, `aria-hidden`: "SỐ ĐƠN", "THỜI GIAN", "SỐ MÓN", "TỔNG TIỀN"). `max-w-3xl`.
- **Desktop ≥ 1024px:** như tablet, `max-w-4xl`.

### Trình đọc màn hình và focus
Danh sách là `<ul>` mỗi `<li>` chứa một `<a>`. Kết quả đổi trang thông báo qua vùng `aria-live="polite"` ẩn: "Hiển thị 20 đơn, trang 2 trên 3". Focus sau đổi trang: `h1`.

---

## Chi tiết đơn — `/orders/:id`

### Mục đích
Xem đúng nội dung đơn đã ghi: từng dòng theo **bản chụp** lúc đặt (tên, đơn giá, số lượng), tổng tiền, thông tin nhận hàng. Là nơi người mua đến sau khi đặt (kèm banner).

### Quyền truy cập
Đã đăng nhập, role `user`, chỉ đơn của chính mình. Đơn của người khác và id sai hoặc không tồn tại đều cho cùng một kết quả 404, cùng một thông báo (không tiết lộ đơn có tồn tại, E14).

### Trạng thái URL
`/orders/<uuid>`. Vào từ danh sách mang `location.state.from` (chuỗi query của danh sách) cho nút quay lại. Vào từ `/checkout` mang `state: { placed: true }`; sau khi hiển thị, banner **không** bị xóa khỏi màn hình nhưng `state.placed` được xóa bằng `replace` để tải lại trang hay Back/Forward **không** hiện lại banner (cùng cách với `state.notice` ở admin, D-56).

### Bố cục tổng
1. Link "← Đơn của tôi" (→ `/orders` kèm `from`; vùng chạm 44px).
2. `h1` "Đơn DH000123" (`display`, mobile `title`) + dòng `small` `ink-muted` "Đặt lúc 09:00, 06/11/2026".
3. **Khối lưu ý** (một trong hai, mục 1).
4. **Danh sách dòng hàng** + **tổng tiền**.
5. **Thông tin nhận hàng**.
6. Dòng chú thích về ảnh (mục 4).

### Các thành phần chính

#### 1. Khối lưu ý trên đầu trang
- **Khi `state.placed` (vừa đặt, 201 hoặc 200 do thử lại):** `Alert` `success`, `role="status"` (icon `CheckCircle2` có sẵn trong `Alert`): tiêu đề `small` 700 "Đã ghi nhận đơn hàng DH000123." + "Chưa thanh toán trực tuyến. Cửa hàng sẽ liên hệ theo số điện thoại bạn cung cấp." Đặt ngay **sau `h1`** để thứ tự đọc sau khi `RouteFocus` focus `h1` là `h1` → banner. Ở cuối trang có hai link: "Xem tất cả đơn hàng" (`/orders`, secondary) và "Tiếp tục thử đồ" (`/try-on`, primary), chỉ hiện khi vừa đặt.
- **Mặc định (xem lại sau này):** `Alert` `info`, `role="group"`: "Chưa thanh toán trực tuyến. Cửa hàng sẽ liên hệ theo số điện thoại bạn cung cấp." Không đóng được. **Không** thêm trạng thái, tiến độ.
- Chữ "Đã ghi nhận" thay cho "thành công", vì hệ thống chỉ ghi lại yêu cầu mua (US-08 §3). Chữ "ghi nhận" cũng đúng khi tới do thử lại (E8).

#### 2. Dòng hàng (`OrderItemRow`)
- **Nội dung:** ảnh (`ProductThumb`: 64px mobile, 80px ≥ md, `alt` = tên bản chụp) · **tên** (`name` bản chụp, `body` 600, tối đa 2 dòng) · "{`unitPriceVnd`} × {`quantity`}" (`small` `ink-muted`, `tabular-nums`) · **thành tiền** `lineTotalVnd` (`body` 600, `tabular-nums`, căn phải).
- `stillOnSale = false`: huy hiệu `caption`-cỡ `warning-soft` icon `PackageX` "Đã ngừng bán" cạnh tên (xem Ghi chú về nhãn). Không ảnh hưởng gì khác; dòng vẫn hiện đủ theo bản chụp. **Không** thêm câu "đơn vẫn giữ nguyên" hay lời hứa nào.
- Ảnh lỗi tải (hoặc sản phẩm đã đổi/mất ảnh): khung `surface-muted` + `ImageOff` 24px; phần còn lại bình thường.
- **Không** có link tới sản phẩm (không có trang sản phẩm), **không** có nút "Mua lại", "Thêm vào giỏ".
- Hàng cuối: "Tổng tiền" (`heading` 700) + "{`itemCount`} món" + `totalVnd` (`font-display` 600, `tabular-nums`). Số lấy từ API (bản chụp, không tính lại).

#### 3. Thông tin nhận hàng
Card (viền `line`, radius `lg`, padding 16/24) với `h2` "Thông tin nhận hàng" và danh sách mô tả `<dl>`: **Người nhận** · **Số điện thoại** · **Địa chỉ** (`pre-line` để giữ dấu xuống dòng đã chuẩn hóa, `break-words`). Chỉ chữ, không có nút sửa, không có link gọi. Dữ liệu là dữ liệu cá nhân: không ghi `localStorage`, không đưa vào URL, tiêu đề tab hay log.

#### 4. Chú thích về ảnh
Dòng `small` `ink-muted` dưới danh sách dòng: "Tên, giá và số lượng ghi theo lúc đặt hàng. Ảnh là ảnh hiện tại của sản phẩm." (D-142: ảnh không chụp, admin có thể đã thay ảnh sau đó; câu này tránh việc người mua tưởng ảnh cũng là bản chụp.)

### Trạng thái màn hình

| Trạng thái | Hiển thị |
|---|---|
| Đang tải | `h1` hiển thị "Đơn hàng" (chưa biết mã) + skeleton (khối lưu ý, 2 dòng hàng, khối nhận hàng); `aria-busy`; `role="status"` ẩn "Đang tải đơn hàng". Nếu tới từ `/checkout` thì `h1` vẫn "Đơn hàng" cho tới khi có mã |
| Có dữ liệu | Như trên |
| 404 `NOT_FOUND` (E14) | Thay nội dung: icon `SearchX` 40px, `h2` "Không tìm thấy đơn hàng.", nút secondary **Về Đơn của tôi**. Không phân biệt đơn không có với đơn của người khác |
| Lỗi tải (mạng, 500) | Error state "Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại." + **Thử lại** + link "Về Đơn của tôi" |
| 429 | Như danh sách |
| 401 | API client về `/login` |

### Responsive
- **Mobile 360px:** một cột. Dòng hàng: ảnh 64px · (tên, "đơn giá × số lượng") · thành tiền căn phải ở hàng thứ hai (tránh ép tên). Tổng tiền cuối danh sách. Thông tin nhận hàng card full-width, `<dl>` xếp dọc (nhãn trên, giá trị dưới).
- **Tablet 768px:** `max-w-2xl`, dòng hàng một hàng ngang: ảnh 80px · chữ · thành tiền; `<dl>` hai cột (nhãn 140px, giá trị).
- **Desktop ≥ 1024px:** hai cột trong `max-w-5xl`: dòng hàng và tổng bên trái (8/12), "Thông tin nhận hàng" bên phải (4/12, `sticky top-20`). Banner và lưu ý trải suốt hai cột.

### Focus và bàn phím
`RouteFocus` đưa focus vào `h1`. Thứ tự Tab: "← Đơn của tôi" → (chỉ khi vừa đặt) "Xem tất cả đơn hàng" → "Tiếp tục thử đồ". Banner và danh sách dòng hàng không có phần tử tương tác nên không có điểm dừng Tab.

### Trình đọc màn hình
`h1` "Đơn DH000123"; `h2` "Thông tin nhận hàng"; dòng hàng là `<ul>`; tiền đọc "199.000 đồng". Banner `placed` đọc ngay sau `h1`. `<time>` có `dateTime` ISO, chữ hiển thị theo giờ Việt Nam.

### Motion và `prefers-reduced-motion`
Chỉ có skeleton shimmer 1,5s (tắt khi reduced motion) và đổi nền hover 120ms. Banner xuất hiện không animation.

### Navigation
- Đến từ: `/checkout` (đặt xong, `replace`), `/orders`, `/cart` giỏ trống, menu tài khoản (`/orders`).
- Đi tới: `/orders`, `/try-on`, `/login` (401).

### Ghi chú
- **Hai nhãn ngừng bán khác nhau có chủ đích:** giỏ dùng "Không còn bán" (trạng thái hiện tại, US-08), đơn dùng "Đã ngừng bán" (trạng thái sau khi đặt, US-09 AC-04). Nếu muốn thống nhất một nhãn cho dễ làm, dùng "Đã ngừng bán" ở cả hai (xem đề xuất D-162).
- **Mất response:** danh sách này là chỗ kiểm tra; nếu đơn có mà người mua không thấy banner, đơn vẫn có đầy đủ nội dung.
- Không hiển thị email, `userId`, `idempotencyKey`. Không có nút in, chia sẻ, tải về.
- Frontend **không** hiển thị `error.message` của server (D-119).
