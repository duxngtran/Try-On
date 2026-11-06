# Screen Descriptions — Đặt hàng

> US-08 §4.3, §5 (E4 → E13), §6, §7 (R1, R5, R7, R9, R10), AC-02, AC-06, AC-11 → AC-13, AC-16, AC-17 · `GET /api/cart`, `POST /api/orders` · D-137 → D-139, D-142 → D-146, D-153 · Flow: `design/flows/order-place.md` · Bảng mã lỗi → giao diện: [`error-map.md`](error-map.md)

Không tạo token mới. Component mới: `TextAreaField`, `CheckoutSummary` (dùng `OrderSummaryCard`), `CheckoutDraft` (không phải giao diện, là chỗ giữ dữ liệu form trong bộ nhớ).

## Đặt hàng — `/checkout`

### Mục đích
Người mua nhập ba thông tin nhận hàng và xác nhận **đúng giỏ mình vừa xem**. Đơn chỉ là yêu cầu mua được ghi lại: **chưa thanh toán trực tuyến**, không có trạng thái, không hủy, không sửa (D-138). Giao diện không được ngụ ý đã thanh toán, đang xử lý, đã giao, thu tiền khi nhận hàng hay có thể hủy (D-153).

### Quyền truy cập
Đã đăng nhập, role `user`. Guest → `/login`. Admin → `/admin`. Mở khi giỏ rỗng → `/cart` (`replace`, E13). Mở khi `hasUnavailable` → `/cart` (`replace`, kèm `state.notice`, xem `cart.md`).

### Luồng vào
1. Mở trang: luôn `GET /cart` mới (không dùng bản của `/cart`), hiện skeleton đến khi có.
2. Có hàng, không ngừng bán: giữ `fingerprint` làm "giỏ người mua đã xem"; **sinh `idempotencyKey` một lần** (bằng `crypto.getRandomValues`, không dùng `randomUUID`, flow mục 4) nếu `CheckoutDraft` chưa có.
3. Người mua nhập, bấm **Xác nhận đặt hàng** → `POST /orders` → chuyển tới `/orders/:id` (`replace`).

### Bố cục tổng
1. Link "← Quay lại giỏ hàng" (`small`, `accent-strong`, cao vùng chạm 44px) → `/cart`.
2. `h1` "Đặt hàng".
3. **Dải thông báo trang** (chỉ khi cần): `CART_CHANGED`, lỗi 500, mất kết nối, 429, `VALIDATION_ERROR` không gắn được ô (xem bảng).
4. **Tóm tắt giỏ** (`CheckoutSummary`).
5. **Form "Thông tin nhận hàng"** (`<form noValidate>`, `<fieldset>` với `<legend>`): 3 ô.
6. **Khối lưu ý thanh toán** (Alert `info`, tĩnh) và **nút Xác nhận đặt hàng**.

Mobile: 4 → 5 → 6 một cột. Desktop ≥ lg: hai cột; form bên trái (7/12), tóm tắt `sticky top-20` bên phải (5/12); khối lưu ý và nút nằm ở cuối cột trái.

### Các thành phần chính

#### 1. Tóm tắt giỏ (`CheckoutSummary`)
- **Mô tả:** card (viền `line`, radius `lg`, padding 16/24) với `h2` "Đơn hàng của bạn" (`heading`) và `small` `ink-muted` "{lineCount} sản phẩm, {itemCount} món". Mỗi dòng (chỉ đọc): ảnh 56px · tên (tối đa 2 dòng) · "{số lượng} × {đơn giá}" · thành tiền (`tabular-nums`, căn phải). Cuối: hàng "Tổng tiền" (`heading` 700) với `totalVnd` của API. Dòng `small` `ink-muted`: "Chưa thanh toán trực tuyến." Không có nút sửa số lượng ở đây; "Sửa giỏ hàng" là link `small` về `/cart`.
- **Mobile:** mặc định **thu gọn**: chỉ thấy tiêu đề, "{n} sản phẩm" và **tổng tiền**, kèm nút mở `aria-expanded` "Xem chi tiết" (icon `ChevronDown`, 44px). Mở ra thì thấy danh sách dòng. Thu gọn giữ trang ngắn để người mua tới form nhanh, nhưng tổng tiền luôn thấy. Desktop: luôn mở.
- **Khi `CART_CHANGED`:** tự **mở** (mobile) và đánh dấu dòng thay đổi (xem mục 4).
- **Nguồn dữ liệu:** chỉ từ `GET /cart` gần nhất của trang này; không tự tính số nào.

#### 2. Ba ô nhận hàng (`TextField`, `TextAreaField`)
Cấu trúc ô theo design-system 7.2: `<label>` luôn hiện, ô, hint, lỗi cạnh ô. Mỗi ô ghi chữ "(bắt buộc)" trong nhãn (không chỉ dấu `*`). Ô cao 48px mobile / 44px lg. Dữ liệu chỉ ở `CheckoutDraft` (bộ nhớ), **không ghi `localStorage`, `sessionStorage`** (R9, AC-17).

| Ô | `type`, thuộc tính | Hint | Chuẩn hóa khi rời ô (blur) | Lỗi (theo bảng validation US-08 §6, cùng bảng zod FE/BE) |
|---|---|---|---|---|
| **Họ tên người nhận (bắt buộc)** | `type="text"`, `autocomplete="name"`, `autocapitalize="words"`, `spellcheck="false"` | — | NFC, gom khoảng trắng, trim; hiển thị lại giá trị đã chuẩn hóa | "Vui lòng nhập họ tên người nhận (2–100 ký tự)." |
| **Số điện thoại (bắt buộc)** | `type="tel"`, `inputmode="tel"`, `autocomplete="tel"`, `spellcheck="false"` | "Số di động Việt Nam, ví dụ 0912 345 678. Cửa hàng sẽ liên hệ qua số này, hãy kiểm tra kỹ." | Bỏ khoảng trắng, `.`, `-`, `(`, `)`; `+84`/`84` đầu thành `0`; hiển thị `0912345678` nếu hợp lệ | "Số điện thoại không hợp lệ." |
| **Địa chỉ nhận hàng (bắt buộc)** | `<textarea rows="3">` (`TextAreaField`, cùng khung ô: viền `line-strong`, radius `md`, `body` 16px, `resize-y` tối thiểu 3 dòng), `autocomplete="street-address"`, `enterkeyhint="done"` | "Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố." | NFC, gom khoảng trắng và xuống dòng, trim | "Vui lòng nhập địa chỉ đầy đủ (10–300 ký tự)." |

- **Không có bộ đếm ký tự**, không có `maxlength` cứng (người dán chuỗi dài vẫn thấy lỗi rõ thay vì bị cắt im lặng); lỗi hiện khi blur hoặc khi gửi.
- **Trạng thái ô:** default / hover (viền `ink-muted`) / focus (viền `ink` + vòng focus) / error (viền 2px `danger`, `aria-invalid="true"`, lỗi có icon `AlertCircle` + chữ, gắn `aria-describedby` cùng hint) / readonly khi đang gửi (nền `surface-muted`; **không** `disabled`, để giữ giá trị và focus).
- **Lỗi on-blur:** vùng `aria-live="polite"` của ô (đã có ở `TextField`). **Lỗi sau khi gửi:** focus ô sai **đầu tiên** (E9) và danh sách tóm tắt ngắn không cần thiết (chỉ ba ô).
- **Lỗi từ server (`VALIDATION_ERROR`, `details: [{ field, message }]`):** ánh xạ `recipient.name` → ô họ tên, `recipient.phone` → số điện thoại, `recipient.address` → địa chỉ; chữ hiển thị là chữ của bảng trên (theo `field`), **không** dùng `message` của server. Focus ô đầu tiên có lỗi.

#### 3. Khối lưu ý (Alert `info`, `role="group"`, tĩnh, không đóng được)
Đặt ngay trên nút xác nhận, luôn hiện, `icon Info`:
- Dòng đậm `small` 700: **"Chưa thanh toán trực tuyến."**
- Dòng thường: "Cửa hàng sẽ liên hệ theo số điện thoại bạn cung cấp."
- Dòng `ink-muted`: "Họ tên, số điện thoại và địa chỉ chỉ được lưu trong đơn hàng này, không lưu vào hồ sơ của bạn."

**Cấm** trong toàn bộ trang và các thông báo: "thanh toán khi nhận hàng", "COD", "đặt hàng thành công", "đang xử lý", "đang giao", "bạn có thể hủy đơn", "xác nhận size" (D-138, D-153; "xác nhận size" là cam kết nghiệp vụ chưa ai chốt, Q4). Thành phần này không hứa thời gian liên hệ.

#### 4. Nút "Xác nhận đặt hàng" và `CART_CHANGED`
- **Nút:** primary, `lg`, rộng 100% mobile; ≥ md: `w-full max-w-sm` (căn trái). Nhãn "Xác nhận đặt hàng". Phía trên, dòng "Tổng tiền: 848.000 ₫" (`heading`, `tabular-nums`) nhắc lại số sẽ ghi, lấy từ `totalVnd`.
- **Trạng thái:**

| Trạng thái | Hiển thị |
|---|---|
| Default | Bấm được |
| Hover / focus-visible / active | Như `Button` primary |
| **Đang gửi** | Spinner 16px + "Đang gửi đơn…"; `aria-busy="true"` và `aria-disabled="true"` (không `disabled`, giữ focus); ba ô thành `readonly`; link "Quay lại giỏ hàng" vẫn dùng được; bấm lần nữa bị bỏ qua |
| 429 | Nút `aria-disabled`, chữ "Thử lại sau {N}" (xem bảng lỗi), mở lại khi hết giờ |
| Không rõ kết quả (mất kết nối, hết giờ) | Nhãn đổi thành "Thử lại" (xem bảng lỗi), **dùng cùng `idempotencyKey`** |

- **`CART_CHANGED` (E6, AC-06):** ở lại form, **giữ dữ liệu đã nhập**, tải lại `GET /cart` và lấy `fingerprint` mới, **không tự gửi lại** (D-144). Hiển thị:
  - `Alert` `warning`, `role="alert"`, đầu trang (dưới `h1`): tiêu đề "Giỏ hàng vừa thay đổi", nội dung "Vui lòng kiểm tra lại rồi xác nhận." Dòng tiếp: "Tổng tiền: {tổng cũ} → {tổng mới}" khi hai tổng khác nhau (cả hai là `totalVnd` do API trả; tổng cũ là của lần tải trước đó, chỉ để so sánh, không tính toán).
  - Tóm tắt tự mở, các dòng khác bản trước (khác số lượng, đơn giá, tên, hoặc mới/mất) có huy hiệu `accent-soft` "Đã thay đổi" kèm icon `RefreshCw` (so sánh hai bản `GET /cart` ở FE chỉ để đánh dấu, không tính tiền). Dòng bị mất khỏi giỏ không còn trong danh sách, nên liệt kê ngắn trong Alert: "Đã bỏ khỏi giỏ: {tên}" (`small`).
  - Focus chuyển vào Alert (`tabIndex=-1`) vì đây là kết quả của hành động người dùng và nội dung bên trên đã đổi; người đọc màn hình nghe `role="alert"`.
  - Nút giữ nhãn "Xác nhận đặt hàng", bấm lại là **xác nhận mới** với `fingerprint` mới (AC-06). Alert đóng khi người mua bấm xác nhận lại.
  - Nếu sau khi tải lại: giỏ **rỗng** → trạng thái `CART_EMPTY` (bảng dưới); có **dòng ngừng bán** → chuyển `/cart` (`replace`, kèm Alert tĩnh của giỏ).

#### 5. Trạng thái lỗi và đặc biệt (thay hoặc thêm vào trang)

| Mã / tình huống | Hiển thị | Giữ dữ liệu form? |
|---|---|---|
| `VALIDATION_ERROR` có `field` thuộc `recipient.*` | Lỗi dưới ô tương ứng, focus ô đầu tiên (E9) | Có |
| `VALIDATION_ERROR` khác (`idempotencyKey`, `cartFingerprint`: lỗi lập trình) | `Alert` `danger`, `role="alert"`: "Chưa đặt được hàng. Vui lòng tải lại trang và thử lại." + nút **Tải lại trang** | Không (tải lại mất dữ liệu, ghi rõ) |
| `CART_EMPTY` (E4, AC-12) | **Thay toàn bộ form** bằng khối `Alert` `info`, `role="alert"`: "Giỏ hàng đang trống. Nếu bạn vừa đặt hàng, hãy xem ở Đơn của tôi." + nút primary **Xem Đơn của tôi** (`/orders`) + link "Về giỏ hàng" (`/cart`). Focus vào khối | Bỏ (không còn ý nghĩa) |
| `CART_HAS_UNAVAILABLE` (E5) | Chuyển `/cart` (`navigate`, không `replace`, để Back về `/checkout`), `state.notice` bật Alert tĩnh của giỏ | **Có**, giữ trong `CheckoutDraft` (cùng `idempotencyKey`); quay lại `/checkout` thì điền sẵn |
| `CART_CHANGED` | Như mục 4 | Có |
| 429 `TOO_MANY_REQUESTS` (E10) | `Alert` `warning`, `role="status"`: "Bạn thao tác quá nhanh, thử lại sau {khoảng} nữa." Đếm ngược theo `details.retryAfterSeconds`, hiển thị mỗi giây nhưng đọc cho trình đọc màn hình **chỉ lúc bắt đầu và lúc kết thúc**. Khoảng: dưới 90 giây hiển thị "{N} giây", từ 90 giây trở lên "{M} phút" làm tròn lên (giới hạn 20 đơn/giờ nên có thể tới 60 phút). Nút aria-disabled tới hết giờ | Có |
| `INTERNAL_ERROR` 500 (E11) | `Alert` `danger`, `role="alert"`: "Chưa đặt được hàng. Vui lòng thử lại." Giỏ không đổi. Nút dùng lại ngay, **cùng khóa** | Có |
| Không có response, hết giờ (E7) | `Alert` `warning`, `role="alert"`: "Chưa rõ đơn đã được ghi hay chưa. Bấm Thử lại để kiểm tra, sẽ không tạo thêm đơn thứ hai." Nút đổi nhãn "Thử lại"; thêm link `small` "Xem Đơn của tôi" (mở trong cùng tab; mất dữ liệu form, nên chỉ là lối thoát, không phải lối chính). Thử lại dùng **cùng `idempotencyKey`** (AC-11): nhận 201 hoặc 200 đều chuyển tới `/orders/:id` | Có |
| Đã có đơn cùng khóa (E8, 200) | Chuyển tới `/orders/:id` như 201, không báo gì thêm | — |
| Hết phiên 401/`TOKEN_EXPIRED` (E12) | API client về `/login`; dữ liệu form **mất** (không lưu xuống trình duyệt); giỏ còn ở server | Không |
| `GET /cart` lỗi khi vào trang | Error state: "Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại." + **Thử lại**; không hiện form, không hiện tổng | — |
| Admin gọi API (403) | Không có giao diện (guard đã chuyển `/admin`) | — |

- **Khi gửi thành công (201 hoặc 200):** `navigate('/orders/:id', { replace: true, state: { placed: true } })`; xóa `CheckoutDraft`; `CartProvider` làm mới `GET /cart` (header về 0, không tự đặt về 0). Nút Back của trình duyệt **không** quay lại form.

### Không làm mới ngầm
Ở `/checkout` **không** tự `GET /cart` lại (khi tab hiển thị lại, định kỳ, hay sau thao tác nơi khác). Lý do: nếu tóm tắt và `fingerprint` đổi mà người mua không hay, họ sẽ xác nhận một giỏ họ chưa xem, đúng điều D-144 muốn tránh. `fingerprint` chỉ đổi trong hai trường hợp có chủ đích: khi mở trang, và khi nhận `CART_CHANGED` (đề xuất D-158).

### `CheckoutDraft` (dữ liệu form trong bộ nhớ)
- Giữ ba giá trị, `idempotencyKey`, `fingerprint` ở một provider **bên trong `AuthProvider`**, sống khi người mua rời `/checkout` sang `/cart` rồi quay lại (E5: "giữ trong bộ nhớ").
- **Xóa** khi: đặt hàng thành công, đăng xuất, nhận 401, hoặc tải lại trang. Không ghi `localStorage`/`sessionStorage`, không đưa vào URL, không log (R9, AC-17).
- Khi quay lại `/checkout`: điền sẵn ba ô, nhưng **luôn** `GET /cart` mới và thay `fingerprint` (người mua đã rời trang nên xem lại tóm tắt là hợp lý; không có nguy cơ xác nhận giỏ chưa xem vì trang chỉ gửi sau khi người mua thấy tóm tắt mới).
- Hệ quả: dữ liệu cá nhân nằm trong bộ nhớ trang tới khi đóng tab hoặc đăng xuất. Đây là đánh đổi để giữ `CART_HAS_UNAVAILABLE` thân thiện; ghi vào đề xuất D-157.

### Focus và bàn phím
- Vào trang: `RouteFocus` đưa focus vào `h1`. Tab: Quay lại giỏ hàng → (nút mở tóm tắt trên mobile) → Họ tên → Số điện thoại → Địa chỉ → Xác nhận đặt hàng. Enter trong ô họ tên, số điện thoại gửi form (như mọi form), trong `textarea` thì xuống dòng (Enter không gửi).
- Gửi lỗi validation: focus ô đầu tiên sai. `CART_CHANGED`: focus Alert. `CART_EMPTY`: focus khối thông báo. Lỗi 500, mất kết nối: giữ focus ở nút (không `disabled`), thông báo qua `role="alert"`.
- Mở/đóng tóm tắt (mobile): focus ở nút bật tắt, `aria-controls` tới vùng danh sách.

### Trình đọc màn hình
- `h1` "Đặt hàng"; `h2` "Đơn hàng của bạn"; `<legend>` "Thông tin nhận hàng" cho nhóm ô.
- Mỗi ô: label, "(bắt buộc)", hint, lỗi (`aria-describedby`, `aria-invalid`).
- Khối lưu ý là `role="group"` có tên "Lưu ý về thanh toán"; nút xác nhận `aria-describedby` trỏ tới khối này để người nghe biết "Chưa thanh toán trực tuyến" ngay khi tới nút.
- Tổng tiền đổi (sau `CART_CHANGED`): đọc qua Alert; không dùng vùng live riêng thứ hai.

### Responsive
- **Mobile 360px:** một cột, gutter 16px. Thứ tự: Quay lại giỏ hàng → `h1` → (Alert) → tóm tắt thu gọn (tổng tiền) → fieldset 3 ô full-width, khoảng cách ô 20px → khối lưu ý → "Tổng tiền" → nút 100% rộng, cao 48px. Bàn phím ảo che nút: khi focus vào ô, `scrollIntoView({ block: 'center' })` cho ô; không có thanh cố định đáy.
- **Tablet 640–1023px:** một cột `max-w-xl` căn giữa; tóm tắt mở sẵn (không thu gọn từ md).
- **Desktop ≥ 1024px:** hai cột (xem Bố cục); ô họ tên và số điện thoại có thể ghép hai cột con (`grid-cols-2`, gap 16px) trong cột trái; địa chỉ rộng cả hàng.

### Motion và `prefers-reduced-motion`
Mở/đóng tóm tắt mobile: chiều cao đổi 200ms (`grid-rows` hoặc `max-height`; chỉ dùng khi không reduced motion; **reduced motion: đổi tức thì**). Spinner nút: thay bằng chữ tĩnh "Đang gửi đơn…". Không có hiệu ứng khác.

### Navigation
- Đến từ: `/cart` (Đặt hàng), `/cart` sau khi bỏ dòng ngừng bán (Back/Đặt hàng).
- Đi tới: `/orders/:id` (thành công), `/cart` (Quay lại, `CART_HAS_UNAVAILABLE`, giỏ rỗng khi mở), `/orders` (`CART_EMPTY`), `/login` (401).

### Ghi chú
- **Giá hiển thị** luôn từ `GET /cart` gần nhất của trang này; giao diện **không gửi** giá, tổng, tên (api.md mục 1).
- **Số điện thoại hẹp có chủ đích:** chỉ di động Việt Nam (`^0[35789][0-9]{8}$`). Người ở nước ngoài, dùng máy bàn không đặt được. Câu lỗi "Số điện thoại không hợp lệ." không giải thích; hint nêu "Số di động Việt Nam" để người mua hiểu vì sao.
- **Không sửa được sau khi đặt:** nếu người mua gõ nhầm số điện thoại, hiện **không có** cách sửa hay hủy, và cửa hàng không liên hệ được (D-138). Giảm thiểu: hint "hãy kiểm tra kỹ", chuẩn hóa hiển thị `0912345678` khi blur để lỗi gõ nhầm dễ thấy. Xem câu hỏi mở số 4 ở báo cáo.
- Đặt hàng không phụ thuộc hồ sơ, consent, lượt (D-146): người mua đã rút consent vẫn vào được `/checkout`.
