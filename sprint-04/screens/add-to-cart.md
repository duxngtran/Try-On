# Screen Descriptions — Thêm vào giỏ ở Phòng thử đồ

> Cập nhật của `sprint-03/screens/try-on-room.md` (khối thông tin sản phẩm 2d, mục Ghi chú "Chừa chỗ giỏ hàng") · US-07 (§4–§8, AC-01 → AC-13) · `POST /api/cart/items` · D-52, D-87, D-119, D-140, D-146 · Flow: `design/flows/cart-add.md` · Lối vào giỏ ở header: [`entry-points.md`](entry-points.md)

Màn hình vẫn là `/try-on`. **Chỉ nêu phần thêm.** Mọi thứ khác (chip, khung ảnh, mũi tên, vuốt, nhãn AI, trạng thái ảnh S0 → S16) giữ nguyên, không đổi thứ tự DOM trước khối thông tin.

## Phần thay đổi so với Sprint 03

| Hạng mục | Sprint 03 | Sprint 04 |
|---|---|---|
| Khối thông tin sản phẩm (`ProductInfo`) | Tên, danh mục, giá, vị trí, lượt còn lại | Thêm **nút Thêm vào giỏ**, ghi chú "Trong giỏ", Alert lỗi của nút (mục 1) |
| Vùng chừa chỗ giỏ hàng | Chỉ ghi chú | Đã dùng: nút nằm ngay dưới giá ở **mọi** cỡ màn hình (xem Ghi chú về vị trí) |
| Header | Không có giỏ | `CartLink` (xem `entry-points.md`) |
| Thông báo | Một vùng `aria-live` của phòng | Thêm `CartNotice` cấp Layout cho lời xác nhận giỏ |
| Thanh cố định đáy | Không có | **Vẫn không có** (US-07 mục 9) |

## Phòng thử đồ — nút Thêm vào giỏ — `/try-on`

### Mục đích
Người mua đang xem một sản phẩm và muốn mua: bấm một lần là sản phẩm vào giỏ, **ở lại phòng** để thử tiếp. Việc thêm không phụ thuộc ảnh thử đồ đang chờ, lỗi, bị chặn, hết lượt hay tạm dừng (US-07 E9, R1, R6).

### Quyền truy cập
Đã đăng nhập, role `user`. Nút chỉ tồn tại khi có **sản phẩm đang xem** ở bố cục G4 (US-07 R8): không có ở S0 (chưa chọn danh mục), danh mục trống, G1, G2, G3, sản phẩm trên URL đã xóa. Giỏ vẫn còn và vẫn vào được qua `CartLink` khi nút không có.

### Các thành phần chính

#### 1. Nút "Thêm vào giỏ" (`AddToCartButton`) và ghi chú "Trong giỏ"
- **Vị trí:** trong `ProductInfo`, **ngay dưới giá** (và dưới dòng vị trí "3 / 12" ở desktop), **trên** `Alert` lượt còn lại và `NavNotices` (cuối danh mục, lỗi tải sản phẩm kế). Vị trí cố định theo giá, nên không nhảy khi các thông báo xuất hiện hay biến mất. Thứ tự Tab: … mũi tên Trước → mũi tên Sau → **Thêm vào giỏ** → liên kết "Xem giỏ hàng" → các nút trong thông báo.
- **Mô tả nút:** `<button type="button">` primary (nền `ink`), cao **48px** (`lg`), icon `ShoppingBag` 20px (`aria-hidden`) + chữ "Thêm vào giỏ" (theo `Button` size `lg`: `body` 600). Mobile: rộng 100% khối thông tin. ≥ md: `w-full max-w-xs` trong cột phải. `margin-top` 12px so với giá. Có thuộc tính `data-cart-add` để quản lý focus (mục "Focus").
- **Ghi chú "Trong giỏ"** (`InCartNote`), hiện khi sản phẩm đang xem đã có trong giỏ: dòng dưới nút (mobile và desktop), `small` `ink-muted`, icon `Check` 16px `success` (`aria-hidden`) + "Trong giỏ: 2" + dấu chấm giữa + link "Xem giỏ hàng" (`accent-strong`, gạch chân, cao vùng chạm 44px, tới `/cart`). Số lấy từ `cart.items[productId].quantity` của response gần nhất. Ghi chú là mô tả của nút (`aria-describedby`), nên trình đọc màn hình đọc "Thêm vào giỏ, nút, Trong giỏ: 2". Khi số đổi: nền `accent-soft` mờ dần 1,2 giây (opacity; reduced motion: không hiệu ứng).
- **Tương tác:** bấm, Enter, Space. Mỗi lần bấm **tăng 1** (US-07 R3). Lấy `productId`, `name`, `priceVnd` hiện trên màn hình **tại lúc bấm** rồi mới gửi; các lần xử lý sau đó dùng đúng giá trị đã chụp (R2).
- **Trạng thái:**

| Trạng thái | Hiển thị | Hành vi |
|---|---|---|
| Default | Như trên | Bấm được |
| Hover | `bg-[#333]` (như `Button` primary) | |
| Focus-visible | Vòng focus chuẩn 2px `ink`, offset 2px | |
| Active | `scale-[0.98]` 120ms | |
| **Đang gửi** (`POST` của **chính sản phẩm này** đang chạy) | Spinner 16px thay icon, chữ "Đang thêm…", cùng chiều rộng, nền `ink` giữ nguyên nhưng `opacity-80`, `aria-busy="true"` **và `aria-disabled="true"`**; chặn click | **Không dùng thuộc tính `disabled`** (xem Ghi chú về `Button`). Bấm đúp chỉ gửi một request (AC-06). Chỉ nút này bị khóa: ảnh, mũi tên, vuốt, poll job chạy bình thường (US-07 §4.4) |
| Đang gửi nhưng người mua đã sang sản phẩm khác | Nút của sản phẩm mới ở trạng thái Default (khóa theo **từng sản phẩm**, không khóa toàn cục) | Quay lại sản phẩm cũ khi request còn chạy: nút lại hiện "Đang thêm…" |
| **Đã đạt tối đa** (số trong giỏ ≥ `maxQuantity` đã biết từ một lần 409 trước đó, hoặc từ `limits` nếu đề xuất D-155 được chốt) | Soft-disabled (`aria-disabled`, nền `disabled-bg`, chữ `disabled-ink`), ghi chú đổi thành "Đã đạt tối đa 10 món trong giỏ." (icon `Info`) | Vẫn focus được; mô tả bằng `aria-describedby` |
| **Sản phẩm không còn bán** (S14 hoặc 404 từ chính nút này) | Soft-disabled, ghi chú "Sản phẩm này không còn bán." (đã nằm trong lớp phủ S14 nếu đang ở S14, không lặp lại hai lần: khi S14 đang hiện, nút chỉ soft-disabled và `aria-describedby` trỏ tới Alert S14) | Mở lại khi sang sản phẩm khác. Không tự chuyển sản phẩm (D-87) |
| Lỗi | Alert nội tuyến dưới nút (xem mục 2) | Nút dùng lại được ngay |

- **Hiệu ứng:** chỉ đổi nền 120ms. Không có animation riêng khi thêm xong (lời xác nhận là toast, ghi chú "Trong giỏ" và badge header).

#### 2. Alert lỗi của nút (khi người mua vẫn đang ở sản phẩm đó)
`Alert` nội tuyến ngay dưới nút (và dưới ghi chú "Trong giỏ"), `role="alert"`, có nút đóng 44px. Mất khi: bấm nút lại (bắt đầu request mới), đóng, hoặc đổi sản phẩm (gắn vào `ProductStage`, mount lại theo `key`). Chữ theo `error.code` (D-119), **không** dùng `error.message` của server:

| Mã | Biến thể | Chữ | Kèm |
|---|---|---|---|
| `NOT_FOUND` | `warning` | "Sản phẩm này không còn bán." | Nút soft-disabled (bảng trên) |
| `CART_QUANTITY_LIMIT` | `warning` | "Mỗi sản phẩm chỉ đặt tối đa {`details.maxQuantity`} món." | Link "Xem giỏ hàng" |
| `CART_FULL` | `warning` | "Giỏ hàng đã đầy (tối đa {`details.maxLines`} sản phẩm). Hãy bỏ bớt sản phẩm trong giỏ để thêm sản phẩm mới." | Link "Xem giỏ hàng" |
| `TOO_MANY_REQUESTS` | `warning` | "Bạn thao tác quá nhanh, thử lại sau {N} giây." | Nút aria-disabled đếm ngược theo `details.retryAfterSeconds` (hiển thị mỗi giây, **chỉ thông báo cho trình đọc màn hình lúc bắt đầu và lúc kết thúc**, design-system mục 8.8); hết giờ thì mở lại và Alert tự đóng |
| `INTERNAL_ERROR`, mất mạng | `danger` | "Chưa thêm được vào giỏ. Vui lòng thử lại." | Không tự gửi lại (US-07 R3) |
| `VALIDATION_ERROR` (không nên xảy ra vì FE lấy `productId` từ dữ liệu server) | `danger` | Như `INTERNAL_ERROR` | Báo lỗi lập trình qua log dev |

Số trong chữ lấy từ `details`, **không** viết cứng 10 và 30 (hai ngưỡng là ước lượng, đổi bằng env: `CART_MAX_QUANTITY`, `CART_MAX_LINES`). Nếu `details` thiếu (phòng thủ): "Mỗi sản phẩm có giới hạn số lượng trong giỏ."

**Khi người mua đã rời sản phẩm** lúc lỗi về (Alert gắn với `ProductStage` đã gỡ): hiện `CartNotice` lỗi (6 giây, nêu tên): "Chưa thêm được {tên} vào giỏ. Vui lòng thử lại." hoặc câu tương ứng mã, ví dụ "{tên} không còn bán." Không cố tạo lại Alert ở sản phẩm khác.

#### 3. Thông báo thành công
- Qua `CartNotice` (xem `entry-points.md`, mục 3): "Đã thêm {tên sản phẩm} vào giỏ." Tên là của sản phẩm **đã bấm**, kể cả khi đã chuyển sản phẩm (US-07 R2, AC-05).
- **Giá màn hình đã cũ (E6):** nếu `priceVnd` của dòng đó trong response khác giá chụp lúc bấm: "Đã thêm {tên} vào giỏ. Giá hiện tại: 150.000 ₫." Không đổi giá đang hiện ở khối thông tin (giá đó đổi khi làm mới danh sách, ngoài phạm vi sprint). Trang giỏ luôn dùng giá mới.
- Cùng lúc: badge header tăng (nảy 200ms), ghi chú "Trong giỏ: N" cập nhật.
- **Không** chuyển trang, **không** mở drawer hay hộp thoại, **không** đổi sản phẩm đang xem, ảnh, trạng thái poll (AC-01, AC-02).

### Focus và bàn phím
- Nút nằm trong `ProductInfo`, thuộc sản phẩm đang xem nên bị mount lại khi đổi sản phẩm. Yêu cầu: nếu focus đang ở **`[data-cart-add]`** lúc người mua nhấn `←`/`→` (hoặc bấm vuốt), thì sau khi sản phẩm mới hiện, **focus được đặt lại vào nút Thêm vào giỏ của sản phẩm mới**, không rơi về `body` (US-07 AC-13). Cách làm gợi ý: hook điều hướng ghi nhận `document.activeElement.closest('[data-cart-add]')` trước khi đổi, rồi dùng cơ chế `focusRequest` có sẵn để focus phần tử mới. Đây là **khôi phục** focus chứ không di chuyển focus ngoài ý muốn nên không mâu thuẫn quy tắc "không tự ý di chuyển focus" của phòng.
- Phím `←` `→` vẫn hoạt động khi focus ở nút này (nút không phải `input`, `textarea`, `select`, `contenteditable`). `Enter`/`Space` bấm nút (mặc định của `<button>`), không bị hook phím tắt chặn.
- Khi nút đang soft-disabled hoặc đang gửi: **vẫn focus được** để người dùng bàn phím đọc lý do, không mất focus khi bấm (đây là lý do không dùng `disabled`).
- Thêm vào giỏ thành công/lỗi **không** chuyển focus.

### Trình đọc màn hình
- Tên nút "Thêm vào giỏ"; mô tả = ghi chú "Trong giỏ: N" hoặc lý do soft-disabled. Tên sản phẩm không lặp trong nhãn nút (nút nằm trong `<section aria-labelledby>` của `h2` tên sản phẩm).
- Lời xác nhận: `CartNotice` (vùng `role="status"` riêng, luôn tồn tại). Lỗi nội tuyến tự có `role="alert"`, không lặp lại qua vùng live.
- Tiến độ "Đang thêm…": chỉ qua `aria-busy`; không đọc thêm.

### Responsive
- **Mobile < 640px (360px):** thứ tự sau khung ảnh: nhãn AI → hàng điều khiển `[‹] 3 / 12 [›]` → tên → danh mục → giá → **nút Thêm vào giỏ (100% rộng)** → ghi chú "Trong giỏ" → Alert lỗi → các Alert khác. Nút nằm **dưới nếp gấp** ở màn 360 × 640 (khung ảnh chiếm ~60% chiều cao) nhưng đúng như tên, giá đã nằm dưới nếp gấp từ sprint 03; vì không có thanh cố định đáy nên người mua cuộn xuống để thấy nút. Header (cố định) có badge để xác nhận mà không cần cuộn. Xem câu hỏi mở số 2.
- **Tablet 640–1023px:** cột phải (từ md): tên, danh mục, giá, nút (`max-w-xs`), ghi chú, thông báo.
- **Desktop ≥ 1024px:** cột phải: chip, tên, danh mục, giá, vị trí "3 / 12", **nút**, ghi chú, lượt còn lại, thông báo cuối danh mục. Vì nút đứng dưới giá, nên reserve chiều cao hai dòng cho tên sản phẩm (`min-h` 2 dòng ở ≥ md) để nút không nhảy giữa sản phẩm tên ngắn và tên dài.
- Màn ngang điện thoại (cao < 500px): cột phải như tablet; nút vẫn dưới giá.

### Không che mũi tên, vuốt
- Không có phần tử `fixed` hay `sticky` nào che sân khấu ngoài header (cao 56px, nằm trên cùng). Nút giỏ **không** nằm trong hay chồng lên khung ảnh, không nằm trong hàng mũi tên.
- Vùng vuốt (`touch-action: pan-y`) vẫn chỉ là khung ảnh; nút nằm ngoài vùng đó, nên vuốt không kích hoạt nút và bấm nút không kích hoạt vuốt.
- `CartNotice` là `pointer-events: none`, nên toast ở đáy màn hình không chặn chạm vào bất cứ nút nào (mũi tên, nút giỏ) kể cả khi phủ lên chúng trong 4 giây.
- Hai vùng chạm liền kề cách ≥ 8px: mũi tên Sau → nút Thêm vào giỏ cách ≥ 12px (tên, danh mục, giá nằm giữa).

### Motion và `prefers-reduced-motion`
| Hiệu ứng | Bình thường | Reduced motion |
|---|---|---|
| Spinner nút | Quay 0,8s | Thay bằng chữ tĩnh "Đang thêm…" (không xoay) |
| Badge header nảy | 200ms `transform` | Không nảy |
| Nền ghi chú "Trong giỏ" mờ dần | 1,2s `opacity` | Không hiệu ứng |
| Toast vào | 200ms | Tức thì |

### Navigation
- Đến màn hình này: như `try-on-room.md`.
- Từ nút: `/cart` (link "Xem giỏ hàng", `CartLink`). Bản thân nút không điều hướng.

### Ghi chú
- **Vị trí so với sprint 03:** sprint 03 và US-07 ghi desktop là "cuối cột phải". Thiết kế này đặt nút **ngay dưới giá ở cả hai cỡ**, vì cuối cột là nơi thay đổi chiều cao (lượt còn lại, cuối danh mục, lỗi tải sản phẩm kế) và nút sẽ nhảy mỗi lần như vậy (đề xuất D-159).
- **`Button` hiện tại không phù hợp cho nút gửi request:** `loading` đặt thuộc tính `disabled`, làm người dùng bàn phím mất focus về `body` ngay khi bấm (cùng lý do D-112 đã loại `disabled` ở mũi tên). Cần một chế độ `busy` giữ `aria-disabled` + `aria-busy` + spinner mà vẫn focus được (design-system 7.13). Cũng áp dụng cho nút số lượng ở `/cart` và "Xác nhận đặt hàng" ở `/checkout`.
- Số trên header chỉ đổi khi response về (không cập nhật lạc quan), nên khoảng 100–500ms sau khi bấm mới thấy số tăng; nút "Đang thêm…" là phản hồi tức thời trong lúc chờ (≤ 100ms, US-07 §9).
- Mất consent, xóa ảnh hồ sơ giữa chừng làm cổng G1, G2 hiện và nút biến mất; giỏ và `CartLink` giữ nguyên (US-07 E10).
- Người mua chưa có ảnh, số đo, consent AI **không thể thêm giỏ** vì phòng thử đồ là nơi duy nhất có nút (D-147). Giao diện không giải thích điều này ở cổng G1, G2. Xem câu hỏi mở số 3 ở báo cáo.
