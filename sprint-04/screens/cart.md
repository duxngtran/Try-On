# Screen Descriptions — Giỏ hàng

> US-08 §4.1, §4.2, §5 (E1 → E3, E15, E16), §7 (R1 → R4), AC-01 → AC-03, AC-05, AC-08 · `GET /api/cart`, `PATCH`, `DELETE /api/cart/items/:productId` · D-42, D-47, D-119, D-142, D-143 · Flow: `design/flows/cart-view.md` · Bảng mã lỗi → giao diện: [`error-map.md`](error-map.md)

Không tạo token mới. Component mới: `CartLine`, `QuantityStepper`, `OrderSummaryCard` (design-system 7.13).

## Giỏ hàng — `/cart`

### Mục đích
Người mua xem từng sản phẩm đã thêm, đổi số lượng, bỏ sản phẩm, xem tổng tiền và đi tiếp tới đặt hàng. Giao diện **chỉ hiển thị** số tiền backend trả (`priceVnd`, `lineTotalVnd`, `totalVnd`), không tự tính, kể cả lúc chờ response (US-08 R1).

### Quyền truy cập
Đã đăng nhập, role `user`. Guest → `/login` (về lại `/cart`). Admin → chuyển về `/admin` (US-08 E16). Không phụ thuộc hồ sơ, consent, lượt, ngân sách (D-146).

### Bố cục tổng
1. `h1` "Giỏ hàng" (`display`, mobile `title`) + `small` `ink-muted` "3 món" (`itemCount`; ẩn khi chưa có dữ liệu).
2. **Dải thông báo trang** (Alert nội tuyến, chỉ khi cần): sản phẩm ngừng bán, kết quả của thao tác vừa rồi, lỗi mạng, giới hạn (mục "Thông báo trang").
3. **Danh sách dòng** (`CartLine` trong `<ul>`), một card chung (viền `line`, radius `lg`, dòng cách nhau `divide-line`).
4. **Tóm tắt** (`OrderSummaryCard`): tổng tiền, nút Đặt hàng, link Tiếp tục thử đồ.
5. Vùng `aria-live` ẩn (`sr-only`, `role="status"`, `aria-atomic`) của trang: đọc kết quả mỗi thao tác (mục "Trình đọc màn hình").

### Các thành phần chính

#### 1. Dòng sản phẩm (`CartLine`)
- **Nội dung dòng còn bán:** ảnh trải phẳng (khung vuông, `object-contain` trên `surface-muted`, `ProductThumb`: 72px mobile, 96px ≥ md, `alt` = tên) · tên (`body` 600, tối đa 2 dòng, `title` đầy đủ) · danh mục (`small` `ink-muted`) · **đơn giá** `199.000 ₫` (`small`, `tabular-nums`, kèm "/ món" cho trình đọc: `sr-only`) · `QuantityStepper` · **thành tiền** `398.000 ₫` (`body` 600, `tabular-nums`, căn phải) · nút **Bỏ**.
- **Giá đã đổi** (`priceChangedFrom` khác `null`, R3): dưới đơn giá, huy hiệu `warning-soft` có icon `Info` 16px và chữ "Giá đã đổi từ 100.000 ₫" (`small`). Báo cả tăng lẫn giảm, nên chữ trung tính, không dùng màu đỏ/xanh để biểu thị tăng giảm. Trình đọc màn hình: "Giá đã đổi từ 100.000 đồng, hiện là 150.000 đồng". Huy hiệu **không** đóng được; mất khi người mua bấm thêm lại ở phòng thử đồ hoặc bỏ dòng (server quyết định, FE chỉ hiển thị).
- **Dòng ngừng bán** (`available: false`, D-143, R4): ảnh mờ 60% (vẫn hiện, D-42); tên bình thường; huy hiệu `warning-soft` icon `PackageX` "Không còn bán"; **không có đơn giá, không thành tiền** (thay bằng `small` `ink-muted` "Không tính vào tổng tiền."); số lượng chỉ là chữ "Số lượng: 2" (**không có stepper**); nút **Bỏ khỏi giỏ** hiện đầy đủ chữ ở mọi cỡ, variant `secondary` (đây là việc người mua phải làm tiếp). Viền trái 4px `warning` cho dòng.
- **Nút Bỏ:** mobile: icon `Trash2` 20px trong ô 44×44 ở góc trên phải dòng; ≥ md: icon + chữ "Bỏ" ở cột cuối (ghost, chữ `danger`). `aria-label` luôn là "Bỏ {tên} khỏi giỏ". Không có hộp thoại xác nhận (thêm lại dễ, US-08 §4.2). Bấm: dòng `aria-busy`, nút aria-disabled; xong thì dòng biến mất theo response; focus chuyển (mục "Focus").
- **Trạng thái dòng:**

| Trạng thái | Hiển thị |
|---|---|
| Default | Như trên |
| Đang cập nhật (PATCH, DELETE của dòng đó) | Dòng `aria-busy="true"`; thành tiền, số lượng mờ 60%; stepper và nút Bỏ `aria-disabled` (vẫn focus được, chặn click). Dòng khác vẫn dùng được. Không tự tính lại tổng |
| Lỗi của dòng (409 `CART_QUANTITY_LIMIT`) | Dòng chữ lỗi `small` `danger` có icon `AlertCircle` ngay dưới stepper: "Mỗi sản phẩm chỉ đặt tối đa {maxQuantity} món." (`role="alert"`, gắn `aria-describedby` cho nút `+`). Số lượng giữ nguyên. Mất khi bấm lại hoặc bỏ dòng |
| Ảnh lỗi tải | `ImageOff` 24px trong khung, `alt` giữ nguyên (như admin), phần còn lại bình thường |
| Hover (≥ lg) | Nền `surface-muted` nhẹ cho cả dòng |

- **Hiệu ứng:** bỏ dòng: **không** animation (danh sách đổi theo response, tránh layout nhảy trong lúc cần đọc tổng tiền). Cập nhật số lượng: thành tiền và số đổi tức thì khi response về. Reduced motion: không khác.

#### 2. Điều chỉnh số lượng (`QuantityStepper`)
- **Cấu trúc:** `role="group"` `aria-label="Số lượng {tên}"`; nút `−` (icon `Minus`) · số (`body` 600, `tabular-nums`, rộng ≥ 40px, căn giữa, **không phải ô nhập**) · nút `+` (icon `Plus`). Mỗi nút **44 × 44px**, viền `line-strong`, radius `md`, nền `surface`. Giữa các phần tử không để khoảng trống: một khối ghép 128px.
- **Không có ô nhập số:** giới hạn thấp (10), nhập tay thêm trường hợp 0, âm, số lẻ, chuỗi (US-08 §6) mà không có lợi ích; stepper chỉ gửi số hợp lệ.
- **Tương tác:** `−` gửi `PATCH { quantity: n − 1 }`, `+` gửi `n + 1` (số **tuyệt đối** từ giá trị server đang hiển thị, US-08 AC-03). Giữ phím hay bấm liên tiếp: lần bấm trong lúc request chạy bị bỏ qua (khóa theo từng dòng), nên hết request này mới tới request sau; mỗi vòng ≤ 500ms p95.
- **`−` ở số lượng 1:** `aria-disabled="true"` kèm kiểu `disabled-bg`; người mua dùng **Bỏ** để xóa (không cho giảm tới 0: 400). Vẫn focus được.
- **`+` ở mức tối đa:** chỉ biết `maxQuantity` sau một lần 409 (hoặc từ `limits` nếu đề xuất D-155 được chốt). Từ đó `+` của dòng ở mức tối đa là `aria-disabled` với `aria-describedby` trỏ tới dòng chữ "Đã đạt tối đa {maxQuantity} món." Trước đó `+` bấm được và có thể nhận 409.
- **Trạng thái nút:** default / hover (nền `surface-muted`) / focus-visible / active (`scale-[0.96]`) / aria-disabled / busy (số được thay bằng spinner 16px + `sr-only` "Đang cập nhật").
- **Không dùng thuộc tính `disabled`** khi đang chờ hoặc ở biên: người dùng bàn phím giữ được focus (cùng lý do D-112).

#### 3. Tóm tắt (`OrderSummaryCard`) và nút Đặt hàng
- **Nội dung:** `h2` "Tổng tiền" ở trên (`heading`); số tiền dùng `font-display` 600 `text-title` `tabular-nums` (ví dụ "848.000 ₫"), là `totalVnd` của backend. Dòng `small` `ink-muted`: "Chưa thanh toán trực tuyến." Khi `hasUnavailable`: thêm "Chưa tính sản phẩm không còn bán." Không có dòng "phí vận chuyển", "giảm giá", "thuế" (ngoài phạm vi, D-138; tránh ngụ ý có).
- **Nút "Đặt hàng"** (primary, `lg`, rộng 100% card): `<a>` tới `/checkout` khi dùng được. Khi **không** dùng được (`hasUnavailable`, hoặc đang có thao tác giỏ chưa xong): render `<button>` `aria-disabled="true"` kiểu `disabled-bg`, **không phải link**, `aria-describedby` trỏ tới dòng lý do ngay dưới nút:
  - `hasUnavailable`: "Hãy bỏ sản phẩm không còn bán khỏi giỏ để đặt hàng." (`small`, icon `Info`, **luôn hiện** khi nút tắt, không chỉ khi hover.)
  - Đang có thao tác giỏ chạy (stepper, bỏ): nút tạm aria-disabled, không cần câu giải thích (ngắn, tự hết), để người mua không đặt với giỏ đang đổi. Trình đọc màn hình đã nghe "Đang cập nhật" từ dòng.
- **Link "Tiếp tục thử đồ"** (secondary, `lg`, cùng chiều rộng với nút Đặt hàng) → `/try-on`.
- **Cập nhật tổng:** đổi số ngay khi response về, không hiệu ứng đếm số. Mỗi lần đổi thông báo qua vùng live của trang (không đặt `aria-live` trên chính số tiền, tránh đọc lặp).

#### 4. Giỏ trống
`itemCount = 0` (và chưa có thao tác nào đang chờ): thay danh sách và tóm tắt bằng Empty state (design-system 7.8) căn giữa, padding dọc 48px: icon `ShoppingBag` 40px `ink-subtle`, `h2` "Giỏ hàng của bạn đang trống", `small` "Thử đồ rồi thêm sản phẩm bạn thích vào đây.", nút primary **Vào phòng thử đồ** → `/try-on`, link văn bản "Xem đơn của tôi" → `/orders` (cho người mua vừa đặt ở tab khác, hoặc mất response ở `/checkout`, US-08 E13, E4). `h1` "Giỏ hàng" vẫn hiện. **Không có** nút Đặt hàng.

### Thông báo trang
Alert nội tuyến ngay dưới `h1`, tối đa hai cái, thay nhau khi có thông báo mới. Chữ theo `error.code`/tình huống (D-119):

| Tình huống | Biến thể, role | Chữ |
|---|---|---|
| Có dòng ngừng bán (tĩnh, theo `hasUnavailable`) | `warning`, `role="status"` | "Có {n} sản phẩm không còn bán. Hãy bỏ chúng khỏi giỏ để đặt hàng." (`n` = số dòng `available: false`) |
| Đến từ `/checkout` vì `CART_HAS_UNAVAILABLE`, `CART_CHANGED` làm giỏ có dòng ngừng bán (`state.notice`) | như trên | Dùng chính Alert tĩnh ở dòng trên; không thêm Alert thứ hai |
| Giỏ vừa đổi ở `/checkout` và còn nguyên đặt được | không chuyển về `/cart` (ở lại `/checkout`) | — |
| PATCH `NOT_FOUND` và sau khi tải lại dòng **không còn** (E1) | `info`, `role="status"`, đóng được | "Sản phẩm này không còn trong giỏ." |
| PATCH `NOT_FOUND` và sau khi tải lại dòng **vẫn còn, ngừng bán** (E2) | `warning`, `role="status"`, đóng được | "{tên} vừa ngừng bán." (dòng chuyển sang "Không còn bán") |
| 429 `TOO_MANY_REQUESTS` | `warning`, `role="status"` | "Bạn thao tác quá nhanh, thử lại sau {N} giây." Stepper, Bỏ, Đặt hàng `aria-disabled` đến hết giờ; Alert tự đóng |
| Thao tác lỗi mạng, 500 (PATCH, DELETE) | `danger`, `role="alert"`, đóng được | "Chưa cập nhật được giỏ hàng. Vui lòng thử lại." Giỏ hiển thị lại theo dữ liệu server cũ (không đổi). Số trên màn hình không bao giờ lệch khỏi response gần nhất |
| `GET /cart` tải lại ngầm lỗi (sau E1, E2) | `warning`, đóng được | "Không cập nhật được giỏ hàng. Thử lại" kèm nút |

### Trạng thái màn hình

| Trạng thái | Hiển thị |
|---|---|
| Đang tải lần đầu | `h1` thật + skeleton: 3 dòng giả (khung ảnh vuông, 2 thanh chữ, ô stepper 128 × 44, thanh giá) + khối tóm tắt giả; `aria-busy="true"`; `role="status"` ẩn "Đang tải giỏ hàng". **Không** hiện tổng cũ hay badge |
| Có dữ liệu | Như trên |
| Giỏ trống | Mục 4 |
| Lỗi tải (E15) | Error state (design-system 7.8) trong vùng danh sách, thay cả danh sách và tóm tắt: icon `WifiOff` + "Không thể tải giỏ hàng. Vui lòng kiểm tra mạng và thử lại." + nút **Thử lại** (loading "Đang thử lại…"). **Không hiện tổng tiền cũ**, không hiện nút Đặt hàng |
| Đang làm mới ngầm (tab hiển thị lại) | Không đổi giao diện; nếu dữ liệu đổi, cập nhật tại chỗ và thông báo qua vùng live "Giỏ hàng đã được cập nhật" |
| 401 / `TOKEN_EXPIRED` | API client về `/login`, giỏ còn ở server |

### Responsive
- **Mobile 360px:** một cột, gutter 16px. Mỗi dòng (card chung, padding 16px): hàng 1 = ảnh 72px · khối chữ (tên tối đa 2 dòng, danh mục, đơn giá, huy hiệu) · nút Bỏ (ô 44px, góc phải trên); hàng 2 (full width) = `QuantityStepper` bên trái, thành tiền căn phải (128px + ~110px vừa trong 296px); hàng 3 chỉ có khi giá đổi hoặc có lỗi dòng. Tóm tắt nằm **sau** danh sách (không cố định đáy, giống phòng thử đồ). Nút Đặt hàng rộng 100%, cao 48px. Dòng ngừng bán: nút "Bỏ khỏi giỏ" rộng 100% ở hàng 3.
- **Tablet 640–1023px:** một cột `max-w-3xl` căn giữa, tóm tắt dưới danh sách. Từ md: dòng thành lưới `[ảnh 96px] [chữ 1fr] [stepper 128px] [thành tiền 120px] [Bỏ ~80px]`, không có hàng tiêu đề cột (chỉ 5 phần tử, nhãn đã nằm trong `aria-label`).
- **Desktop ≥ 1024px:** hai cột trong `max-w-6xl`: danh sách bên trái (8/12), `OrderSummaryCard` bên phải (4/12, `sticky top-20`, card riêng nền `surface`, viền `line`, radius `lg`, padding 24px).
- Màn ngang điện thoại: như tablet.

### Focus và bàn phím
- Tab theo thứ tự: từng dòng (`−`, `+`, Bỏ), rồi nút Đặt hàng, rồi Tiếp tục thử đồ. Enter/Space kích hoạt nút; không có phím tắt riêng.
- **Sau khi bấm Bỏ:** dòng biến mất nên focus phải về nơi hợp lý: nút **Bỏ** (hoặc `−`/`+` đầu tiên) của dòng **kế tiếp**; nếu đó là dòng cuối thì dòng **trước đó**; nếu không còn dòng nào thì `h2` "Giỏ hàng của bạn đang trống" (`tabIndex=-1`). Không để focus rơi về `body`.
- **Sau khi bấm `−`/`+`:** focus giữ nguyên trên chính nút (không `disabled`).
- Thao tác có kết quả lỗi: focus không bị kéo đi; thông báo qua `role="alert"` của Alert/dòng lỗi.
- Bấm **Thử lại** ở Error state: nút biến mất khi tải thành công, focus vào `h1` (`tabIndex=-1`).

### Trình đọc màn hình
- Một `h1`; `h2` "Tổng tiền" (hoặc "Giỏ hàng của bạn đang trống"). Danh sách dòng là `<ul>`; mỗi `<li>` là một khối có tên là tên sản phẩm.
- **Vùng live của trang** (`role="status"`, `aria-atomic`), nội dung mỗi lần đổi:
  - Sau PATCH: "{tên}: số lượng 3. Tổng tiền 848.000 đồng."
  - Sau DELETE: "Đã bỏ {tên} khỏi giỏ. Tổng tiền 450.000 đồng." (hoặc "Giỏ hàng đang trống.")
  - Sau làm mới ngầm có đổi: "Giỏ hàng đã được cập nhật. Tổng tiền …"
  Không đọc lặp khối lỗi đã có `role="alert"`.
- Nút có `aria-label` chứa tên sản phẩm ("Tăng số lượng {tên}", "Giảm số lượng {tên}", "Bỏ {tên} khỏi giỏ"), vì nhiều dòng có cùng chữ "−", "+", "Bỏ".
- Tiền đọc dạng "199.000 đồng" (`sr-only` cạnh `199.000 ₫`, hoặc `aria-label`).
- Icon trang trí `aria-hidden`. Không truyền thông tin chỉ bằng màu: ngừng bán có icon + chữ; giá đổi có icon + chữ.

### Motion và `prefers-reduced-motion`
Chỉ có: skeleton shimmer 1,5s (tắt khi reduced motion, giữ khối tĩnh), spinner (thay bằng chữ tĩnh "Đang cập nhật" khi reduced motion), đổi nền hover 120ms. Không có animation thêm/bỏ dòng, không đếm số.

### Navigation
- Đến màn hình này từ: `CartLink`, menu tài khoản, "Xem giỏ hàng" ở phòng thử đồ, `/checkout` (Quay lại giỏ hàng; về `/cart` khi giỏ rỗng hoặc có dòng ngừng bán), URL trực tiếp.
- Từ màn hình này đến: `/checkout` (Đặt hàng), `/try-on` (Tiếp tục thử đồ, giỏ trống), `/orders` (giỏ trống), `/login` (401).

### Ghi chú
- **Số trên header và tổng tiền có thể không khớp** khi có dòng ngừng bán: `itemCount` tính cả dòng đó, `totalVnd` thì không (api.md 7.1). Dòng chữ "Chưa tính sản phẩm không còn bán." và Alert tĩnh giải thích điều này.
- **Hai tab:** không đồng bộ thời gian thực. Tab cũ đúng lại ở response kế tiếp, hoặc khi tab hiển thị lại (làm mới ngầm). Khi cập nhật số lượng ở tab cũ, số tuyệt đối ghi đè tab kia (api.md 4.3); `fingerprint` bắt được ở lúc đặt hàng.
- **Giá đã đổi và nút Đặt hàng:** giá đổi không chặn đặt hàng; người mua thấy rõ ở dòng và ở trang `/checkout`.
- Giỏ tối đa 30 dòng nên không phân trang, không ảo hóa danh sách.
- Không có "lưu để mua sau", "mã giảm giá", "chọn size, màu" (D-52, ngoài phạm vi).
- Frontend **không** hiển thị `error.message` của server; luôn theo `error.code` (D-119).
