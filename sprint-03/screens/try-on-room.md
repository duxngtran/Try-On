# Screen Descriptions — Phòng thử đồ

> US-05 (§4–§6, AC-01 → AC-10), US-06 (§4–§5, AC-01 → AC-18) · `GET /api/try-on/state`, `/categories`, `/categories/:id/products`, `/products/:id/result`, `POST /products/:id/jobs`, `GET /jobs/:id` · D-71 → D-90, D-93 → D-95, D-97 · Flows: `design/flows/tryon-*.md` · Câu chữ và bảng lỗi → trạng thái: [`try-on-states.md`](try-on-states.md) · Consent: [`try-on-consent.md`](try-on-consent.md)

Không tạo token mới. Component mới ghép từ token sẵn có, mô tả ở `design/design-system.md` mục 7.12.

## Phòng thử đồ — `/try-on`

### Mục đích
Người mua chọn một danh mục rồi xem ảnh **chính mình** mặc từng sản phẩm. Bấm mũi tên hoặc vuốt để sang sản phẩm kế tiếp. Màn hình quyết định theo `GET /try-on/state`: thiếu hồ sơ, thiếu consent, hay vào phòng.

### Quyền truy cập
Đã đăng nhập, role `user`. Guest → `/login` (về lại `/try-on` sau đăng nhập). Admin → chuyển về `/admin`, không hiện trang 403 (như D-38, US-05 E4). `document.title`: "Phòng thử đồ — Try-on".

### URL
`/try-on` · `/try-on?category=<uuid>` · `/try-on?category=<uuid>&product=<uuid>` (US-06 R8). Chỉ chứa id, **không có URL ảnh**. Đổi danh mục hoặc sản phẩm dùng `navigate(..., { replace: true })`, nên nút Back của trình duyệt rời phòng thay vì lùi từng sản phẩm (đề xuất D-117). Đổi query không kích hoạt `RouteFocus` (chỉ chạy khi đổi pathname).

Khi mở bằng URL: `category` hợp lệ thì tải ngay `GET /categories/:id/products?at=<product>` (hoặc trang đầu nếu không có `product`). Đây là **ngoại lệ có chủ đích** của D-72: danh mục nằm trên URL do người mua tự mở, không phải tự chọn hộ.

### Quyết định màn hình theo `GET /try-on/state`

| Thứ tự | Điều kiện | Hiển thị | Chi tiết |
|---|---|---|---|
| 0 | Đang gọi `/state` lần đầu | Khung chờ (skeleton) | Mục "Trạng thái tải" |
| 0b | `/state` lỗi mạng, 500 | Error state + **Thử lại** | Mục "Trạng thái tải" |
| 1 | `profile.completed = false` | **Cổng hồ sơ** (G1) | Mục "Cổng hồ sơ" |
| 2 | `consent.accepted = false` | **Cổng consent** (G2) | `try-on-consent.md` |
| 3 | Đủ điều kiện, `GET /categories` rỗng | **Cửa hàng trống** (G3) | Mục "Cửa hàng trống" |
| 4 | Đủ điều kiện, có danh mục | **Phòng thử đồ** (bố cục chính) | Các mục dưới |

Mọi cổng thay phần nội dung bên dưới `h1`, không điều hướng đi nơi khác (trừ nút trong cổng). `h1` "Phòng thử đồ" luôn hiện.

### Bố cục tổng (phòng thử đồ, G4)

1. `h1` "Phòng thử đồ" (`display`, mobile `title`) + dòng phụ `small` `ink-muted` "Chọn danh mục, rồi bấm mũi tên hoặc vuốt để thử sản phẩm tiếp theo." (mobile: ẩn dòng phụ).
2. **Dải thông báo phòng** (Alert nội tuyến, chỉ khi cần): tính năng tạm dừng, hết lượt (mục "Dải thông báo phòng").
3. **Chọn danh mục** (CategoryChips).
4. **Sân khấu** (TryOnStage): khung ảnh 3:4 + mũi tên + nhãn AI + thông tin sản phẩm.
5. **Vùng chừa chỗ Epic 4** (chỉ ghi chú, mục "Ghi chú").

### Các thành phần chính

#### 1. Chọn danh mục (CategoryChips)
- **Mô tả:** nhóm nút có `role="group"` `aria-labelledby` trỏ tới nhãn `small` 600 "Danh mục" (visually hidden ở mobile, hiện ở desktop). Mỗi danh mục là `<button>` (chip): `min-h-11` (44px), padding ngang 16px, chữ `small` 600, viền `line-strong`, nền `surface`, radius `full`. Chip chọn: nền `ink`, chữ `ink-inverse`, kèm icon `Check` 16px (không chỉ dựa vào màu) và `aria-pressed="true"`. Tên danh mục tối đa 1 dòng, cắt `…`, `title` đầy đủ khi bị cắt. Số sản phẩm (`productCount`) **không** hiện trên chip để giữ gọn, có trong `aria-label` ("Áo thun, 12 sản phẩm").
- **Dữ liệu:** `GET /try-on/categories` (đã lọc danh mục rỗng, D-73), giữ nguyên thứ tự server (cũ → mới, D-44).
- **Không tự chọn** danh mục nào khi vào phòng (D-72). Chưa chọn: không chip nào `aria-pressed`.
- **Tương tác:** chọn chip = đặt `category` trên URL, tải `GET /categories/:id/products`, hiện sản phẩm đầu tiên. Chọn lại chip đang chọn: quay về sản phẩm đầu (không gọi lại nếu đã ở đó). Đổi danh mục lúc đang chờ: sân khấu chuyển ngay sang danh mục mới, ngừng poll job cũ, không báo lỗi (US-05 §5.4). Bàn phím: Tab giữa các chip, Enter/Space chọn. **Không** dùng roving tabindex hay phím mũi tên giữa các chip, để `←` `→` luôn dành cho chuyển sản phẩm.
- **Trạng thái:** default / hover (nền `surface-muted`) / focus-visible (vòng focus chuẩn) / selected / disabled (không dùng: chip luôn bấm được; chỉ `aria-busy` trong lúc tải sản phẩm đầu).
- **Bố cục:** mobile và tablet nhỏ: một hàng cuộn ngang (`overflow-x-auto`, `scroll-snap`, ẩn thanh cuộn, mép phải có dải mờ `canvas` để gợi còn chip), chip chọn được `scrollIntoView({ inline: 'center' })`. Desktop (≥ lg): cột bên phải, chip xuống dòng (`flex-wrap`, gap 8px).
- **Hiệu ứng:** đổi nền 120ms. Không có animation khác.

#### 2. Sân khấu (TryOnStage)
Gồm: khung ảnh, hai mũi tên, nhãn AI, khối thông tin, vùng trạng thái (overlay).

**2a. Khung ảnh**
- `<figure>` tỉ lệ cố định **3:4** (`aspect-[3/4]`), radius `xl`, nền `surface-muted`, ảnh `object-contain`, không cắt, không méo. Kích thước khung **không đổi** khi đổi giữa ảnh trải phẳng, ảnh thử đồ và các trạng thái (US-06 §9). Chiều rộng: mobile `min(100%, 60dvh × 3/4)` để khung + chip + mũi tên vừa màn 360×640 không cần cuộn; tối đa 420px.
- Ảnh try-on của model là 864 × 1296 (2:3), hẹp hơn khung 3:4 một chút: hai dải trống nhỏ hai bên `surface-muted` là bình thường (xem câu hỏi mở số 1). Ảnh trải phẳng sản phẩm có tỉ lệ bất kỳ, cũng `object-contain`.
- **Bốn nội dung của khung** (xem bảng ở `try-on-states.md`):
  - *Chưa chọn danh mục* (S0): silhouette SVG người đứng thẳng (nét `line-strong` trên `surface-muted`, như D-37) + tiêu đề `heading` "Chọn một danh mục" + `small` "Bạn sẽ thấy mình mặc thử sản phẩm ở đây." `alt`/`role="img"` không cần (trang trí, `aria-hidden`).
  - *Ảnh trải phẳng* của sản phẩm (`TryOnProduct.image.url`), có nhãn góc trên trái "ẢNH SẢN PHẨM" (`caption`, nền `surface`, viền `line`, radius `sm`) để người mua không nhầm đó là ảnh của mình. `alt`: "Ảnh sản phẩm <tên>, trải phẳng".
  - *Ảnh thử đồ* (`TryOnImage.url`): không có nhãn góc. `alt`: "Ảnh bạn mặc <tên sản phẩm>, do AI tạo".
  - *Ảnh lỗi tải* (`onError` của ảnh sản phẩm): icon `ImageOff` 24px giữa khung, `alt` giữ nguyên (như ảnh sản phẩm ở admin).
- **Chuyển trải phẳng → thử đồ:** cross-fade 300ms (`opacity`), ảnh mới phải `decode()` xong mới bắt đầu, nên không có khoảnh khắc trống. Reduced motion: đổi tức thì.
- **Chuyển sản phẩm:** ảnh cũ mờ ra, ảnh mới hiện vào 200ms kèm trượt 12px theo hướng di chuyển (sang phải: ảnh mới vào từ phải). Reduced motion: đổi tức thì, không trượt.
- **Vuốt** (chỉ `pointerType` là `touch` hoặc `pen`): vùng khung dùng `touch-action: pan-y` để cuộn dọc vẫn hoạt động. Chỉ tính là vuốt khi quãng ngang ≥ 50 px **và** lớn hơn quãng dọc (US-06 §6, AC-18). Vuốt sang trái = sản phẩm kế tiếp, sang phải = quay lại. Vuốt khi không có sản phẩm theo hướng đó (đầu/cuối): ảnh nảy 16px rồi về chỗ trong 160ms, không gọi API; reduced motion: không nảy, chỉ đọc thông báo đầu/cuối cho trình đọc màn hình. Chuột không kéo để chuyển (tránh xung đột kéo ảnh).
- **Tải trước:** ảnh try-on của sản phẩm liền trước và liền sau, nếu **đã có** (qua `GET /result`), được nạp bằng `new Image()` để chuyển mượt (US-06 R10). Không bao giờ `POST /jobs` để tải trước ảnh hiển thị. Signed URL chỉ ở bộ nhớ trang, không ghi `localStorage`, `sessionStorage`, log.

**2b. Mũi tên**
- Hai nút icon tròn (`rounded-full`, nền `surface`, viền `line-strong`, `shadow-card`), **48 × 48px** (vùng chạm ≥ 44px), icon `ChevronLeft` / `ChevronRight` 24px. `aria-label` "Sản phẩm trước" / "Sản phẩm tiếp theo", `aria-keyshortcuts="ArrowLeft"` / `"ArrowRight"`.
- **Vị trí:** desktop (≥ lg): hai bên khung, canh giữa theo chiều dọc, cách khung 16px, nằm ngoài ảnh. Mobile/tablet: hàng điều khiển ngay dưới khung, hai nút ở hai đầu hàng, giữa là vị trí "3 / 12" (không đè lên ảnh, không che nội dung ảnh). Thứ tự DOM: danh mục → khung ảnh → Trước → Sau → thông tin; thứ tự Tab theo đó.
- **Vô hiệu hóa (D-84):** đầu danh sách: nút Trước; cuối danh sách: nút Sau; danh mục 1 sản phẩm: cả hai. Dùng **`aria-disabled="true"` kèm kiểu vô hiệu** (nền `disabled-bg`, chữ `disabled-ink`), chặn click, **không** dùng thuộc tính `disabled`. Lý do: khi người dùng bàn phím bấm nút Sau tới sản phẩm cuối, nút mất khả năng focus nếu là `disabled` và focus rơi về `body`. Đây là điều chỉnh so với US-06 §9 (đề xuất D-112). `Button` đã có `softDisabled` cho đúng mục đích này, nhưng cần biến thể icon tròn.
- **Đang tải trang kế (E8 tiền đề):** khi cần `GET /products?after=` mới có sản phẩm kế, nút Sau hiện spinner 20px thay icon, `aria-busy="true"`, vẫn bấm được nhưng bỏ qua bấm lặp; chuyển ngay khi dữ liệu về. Danh sách tự tải trước trang kế khi người mua còn cách cuối ≤ 3 sản phẩm, nên hiếm khi gặp.
- **Phím tắt:** `←` `→` chuyển sản phẩm. Bỏ qua khi: phím có `Alt`/`Ctrl`/`Meta`/`Shift` (đặc biệt `Alt+←` là Back của trình duyệt); mục tiêu sự kiện là `input`, `textarea`, `select`, `[contenteditable]`; đang mở hộp thoại; chưa ở bố cục G4. Giữ phím: cho phép lặp, vẫn chịu chờ 400 ms ở mục "Điều hướng". Desktop có thể có gợi ý `caption` dưới khung "Phím ← → để chuyển sản phẩm", chỉ hiện khi `@media (hover: hover)`.
- **Hiệu ứng:** hover nâng `shadow-pop`; active scale 0.96; đổi trạng thái 120ms.

**2c. Nhãn AI (D-83)**
- Dòng chữ **luôn hiển thị**, dưới khung ảnh, chỉ khi **đang hiện ảnh thử đồ** (không hiện với ảnh trải phẳng): icon `Sparkles` 16px (`aria-hidden`) + "Ảnh do AI tạo, chỉ để tham khảo, không thể hiện độ vừa vặn" (`small`, `ink-muted`). Là văn bản thật nằm cạnh ảnh (`<figcaption>`), không đè lên ảnh, không chỉ nằm trong `alt`. Tối đa 2 dòng ở 360px. Biến mất cùng ảnh thử đồ (kể cả khi ảnh bị gỡ vì E9).

**2d. Khối thông tin sản phẩm**
- Dưới khung (mobile: giữa hai mũi tên và dưới hàng điều khiển; desktop: cột phải). Gồm: tên (`h2`, `title` mobile `heading`, tối đa 2 dòng, cắt `…`, `title` đầy đủ), tên danh mục (`small`, `ink-muted`), giá (`heading`, `199.000 ₫`, định dạng `vi-VN`), vị trí "3 / 12" (`small`, `aria-hidden`; kèm `sr-only` "Sản phẩm 3 trên 12").
- Hiện **ngay** khi chuyển sản phẩm, không chờ API ảnh (US-06 §4.1.2), kể cả khi ảnh lỗi hoặc bị chặn (US-05 §6).
- "3 / 12" là vị trí tham khảo, cập nhật khi tải lại danh sách (US-06 R2). Nếu `total` thay đổi lúc đang xem, chỉ đổi số, không đổi sản phẩm đang xem (E7).
- Nội dung văn bản thuần (React tự escape).

**2e. Dòng lượt còn lại**
- Khi `quota.remaining ≤ 5` (và > 0): `Alert` `info` nhỏ (hoặc dòng `small` có icon `Info`) trong cột thông tin: "Bạn còn N lượt tạo ảnh hôm nay." (đổi "tháng này" nếu giới hạn tháng thấp hơn: `monthlyLimit − monthlyUsed < dailyLimit − dailyUsed`) và "Ảnh tạo sẵn cho sản phẩm kế tiếp cũng được tính vào lượt." Không `aria-live` (tránh đọc lặp); cập nhật khi `/state` được làm mới.
- Khi `remaining = 0`: xem mục "Dải thông báo phòng".
- `/state` được làm mới khi: vào phòng, sau mỗi lần ảnh sinh xong, sau lỗi 429 `TRYON_QUOTA_EXCEEDED`, khi tab trở lại hiển thị.

#### 3. Điều hướng (hành vi)
| Thao tác | Kết quả |
|---|---|
| Mũi tên Sau, vuốt trái, `→` | Sang sản phẩm kế tiếp theo con trỏ (D-44, US-06 R2). Ngay trong ≤ 200 ms đổi tên, giá, vị trí, ảnh trải phẳng và URL. Không khóa nút. |
| Mũi tên Trước, vuốt phải, `←` | Quay lại. Ảnh đã có hiện ngay từ bộ nhớ trang, không cần thông báo, không tốn lượt (D-84). |
| Chuyển liên tiếp | Mỗi lần chuyển hủy mọi timer và ngừng poll của sản phẩm trước. **Chỉ khi dừng ở một sản phẩm 400 ms** mới `POST /jobs` (D-86, AC-05). `GET /result` chạy ngay lúc chuyển tới. Trong 400 ms đó vẫn hiện ảnh trải phẳng và trạng thái chờ. |
| Kết quả về muộn của sản phẩm khác | Bỏ khỏi giao diện (khóa so sánh `productId` + `image.version`), không đổi ảnh đang hiển thị (US-06 R7, AC-06). |
| Quay lại sản phẩm có job đang chạy | Gắn lại vào job đó, không tạo job mới (US-06 R5). Đồng hồ 15/60 giây tính lại từ lúc quay lại. |
| Cuối danh sách | Nút Sau `aria-disabled`; trong khối thông tin hiện `Alert` `info` "Bạn đã xem hết danh mục này" + nút secondary **Danh mục khác** (icon `LayoutGrid`): cuộn lên và chuyển focus tới chip đang chọn. Không vòng lại. |
| Đầu danh sách | Nút Trước `aria-disabled`. Vuốt phải: nảy, không gọi API. Không có thông báo chữ (đầu danh sách là điểm xuất phát tự nhiên). |
| Danh mục 1 sản phẩm | Cả hai nút `aria-disabled`; hiện cả "Bạn đã xem hết danh mục này". |
| Tải lại trang | Về đúng sản phẩm theo URL (`?at=`), gắn vào job đang chạy (US-06 AC-17). |
| Sản phẩm thêm mới khi đang xem | Không nhảy; chỉ hiện sau khi chọn lại danh mục (E7). |

Thông báo cho trình đọc màn hình (vùng `aria-live="polite"` duy nhất, `sr-only`, mục "Trình đọc màn hình") được **gộp theo 400 ms** cùng nhịp tạo job: lướt nhanh qua 5 sản phẩm chỉ đọc sản phẩm cuối.

### Responsive
- **Mobile (< 640px, thiết kế từ 360px):** một cột, gutter 16px. Thứ tự: `h1` → (dải thông báo) → chip danh mục (một hàng cuộn ngang, cao 44px) → khung ảnh (rộng theo `min(100%, 60dvh × 3/4)`, căn giữa) → nhãn AI → hàng điều khiển `[‹] 3 / 12 [›]` (mũi tên 48px, cách đáy khung 12px) → tên, danh mục, giá → thông báo cuối danh sách / lượt còn lại. Không có thanh cố định đáy (để chừa chỗ cho nút "Thêm vào giỏ" ở Epic 4 mà không phải thiết kế lại). Chip, nút đều cao ≥ 44px. Khoảng cách giữa hai vùng chạm ≥ 8px.
- **Tablet (640–1023px):** một cột căn giữa, khung ảnh `max-w-[420px]`, chip có thể xuống dòng nếu ít danh mục (ngược lại vẫn cuộn ngang). Từ 768px (md): hai cột. Trái: khung ảnh + hàng điều khiển. Phải: `h1` phụ, chip (xuống dòng), thông tin sản phẩm, thông báo.
- **Desktop (≥ 1024px):** `max-w-6xl`, lưới 12 cột, gap 32px. Trái (6 cột, căn giữa): mũi tên tròn hai bên khung (khung rộng tối đa 480px). Phải (6 cột): chip xuống dòng, tên, giá, vị trí, lượt còn lại, thông báo, vùng chừa chỗ giỏ hàng. Chiều cao khung theo `min(70dvh, 640px)` để không tràn màn 768px cao.
- Màn ngang điện thoại (chiều cao < 500px): khung ảnh co theo chiều cao (`max-h-[75dvh]`), thông tin sang bên phải khung (bố cục hai cột như tablet).

### Navigation
- Đến màn hình này từ: Header (liên kết "Thử đồ", xem `entry-points.md`), Trang chủ (card Phòng thử đồ), Hồ sơ (banner hoàn tất, nút "Vào phòng thử đồ"), URL trực tiếp, đăng nhập lại.
- Từ màn hình này đến: Hồ sơ `/profile` (cổng hồ sơ G1, lỗi `TRYON_PHOTO_UNUSABLE`, rút consent), Trang chủ `/` (cửa hàng trống, "Để sau" ở cổng consent), `/login` (401 do API client xử lý chung), `/admin` (admin), `/try-on` (đổi danh mục/sản phẩm).

### Trạng thái tải (phòng)
- **Đang tải `/state` lần đầu:** `h1` thật + skeleton: hàng 3 chip giả (cao 44px, rộng 80/96/72px) + khung `aspect-[3/4]` `surface-muted` shimmer + 3 dòng thông tin giả. Cả khối `aria-busy="true"`, `role="status"` ẩn "Đang tải phòng thử đồ". Không hiện cổng nào trước khi biết kết quả (tránh nháy).
- **`/state` lỗi:** Error state (design system 7.8): icon `WifiOff` "Không thể tải phòng thử đồ. Vui lòng kiểm tra mạng và thử lại." + nút **Thử lại** (loading "Đang thử lại…"). 401/`TOKEN_EXPIRED` do API client xử lý (về `/login`).
- **Đang tải sản phẩm đầu của danh mục:** chip đã chọn hiện, khung ảnh skeleton shimmer 3:4 (không có ảnh trải phẳng vì chưa biết sản phẩm), khối thông tin 3 dòng skeleton; hết chờ thì thay bằng sản phẩm thật. Mục tiêu thông tin sản phẩm ≤ 1 giây (D-74). Lỗi tải: Alert `danger` trong vùng sân khấu "Không tải được sản phẩm. Vui lòng thử lại." + **Thử lại**, chip vẫn dùng được.

### Cổng hồ sơ (G1) — `profile.completed = false` (US-05 E2, AC-01)
- **Mô tả:** card `max-w-xl` căn giữa dưới `h1`: icon `UserRound` 40px `ink-subtle`, `h2` "Hoàn thiện hồ sơ để bắt đầu thử đồ", đoạn `body` "Chúng tôi cần ảnh toàn thân của bạn để tạo ảnh bạn mặc thử sản phẩm.", danh sách phần thiếu từ `profile.missing` (mỗi dòng icon `Circle` + chữ, không chỉ màu):
  - `photo` → "Ảnh toàn thân" (link tới `/profile#photo`).
  - `measurements` → "Chiều cao và cân nặng" (link tới `/profile#measurements`), kèm `small` `ink-muted`: "Số đo chưa ảnh hưởng đến ảnh thử đồ và không được gửi tới dịch vụ AI. Hiện cần nhập để hoàn thiện hồ sơ." (D-95, R10).
- Nút primary "Đến Hồ sơ" → `/profile` (neo tới phần thiếu đầu tiên). Không có nút khác.
- **Khi tới từ lỗi giữa chừng** (409 `PROFILE_INCOMPLETE` lúc đang lướt, E2/E9): cùng card, thêm `Alert` `warning` `role="alert"` đầu card "Hồ sơ của bạn vừa thay đổi, phần ảnh thử đồ đã được gỡ khỏi màn hình." (nếu `missing` chứa `photo`) hoặc "Hồ sơ của bạn chưa đầy đủ." (chỉ thiếu số đo). Focus chuyển vào `h2` của card (`tabIndex=-1`).
- Không có chip, không có sân khấu, không có lệnh gọi `/categories` khi chưa đủ hồ sơ.

### Cổng consent (G2)
Xem [`try-on-consent.md`](try-on-consent.md). Chỉ hiện khi hồ sơ đủ và `consent.accepted = false`.

### Cửa hàng trống (G3) — E5
Empty state: icon `Shirt` 40px, `h2` "Cửa hàng chưa có sản phẩm để thử.", `small` "Vui lòng quay lại sau.", nút secondary "Về trang chủ". Không chip, không sân khấu, không sinh ảnh.

### Danh mục trống giữa chừng — E6, E7, US-06 E5
| Tình huống | Hiển thị |
|---|---|
| Danh mục đang xem trả `items: []`, `total: 0` (E6) | Sân khấu thay bằng empty state: icon `Shirt`, "Danh mục này chưa có sản phẩm." + `small` "Hãy chọn danh mục khác."; chip vẫn hiện; làm mới ngầm `/categories` (danh mục trống sẽ biến mất, chip đã chọn bị bỏ chọn, URL bỏ `category`, `product`). Không sinh ảnh |
| `GET /products` trả 404 `NOT_FOUND` (E7, US-06 E5) | `Alert` `warning` `role="alert"` trên sân khấu "Danh mục không còn tồn tại." + tải lại danh mục. Sau khi tải xong, chip cập nhật; nếu không còn danh mục nào → G3 |
| `/categories` làm mới trả rỗng | G3 |

### Sản phẩm bị xóa giữa chừng — E8, US-06 E3, E4 (D-87)
Xem hàng "Sản phẩm đã xóa" ở `try-on-states.md`. Tóm tắt: khung hiện icon `PackageX` thay ảnh, `Alert` "Sản phẩm này không còn bán." + nút **Xem sản phẩm tiếp theo** (gọi `?at=<id đã xóa>` để lấy sản phẩm kế tiếp theo con trỏ). **Không tự chuyển, không tự sinh ảnh.** Mũi tên vẫn dùng được.

### Dải thông báo phòng
| Điều kiện | Thông báo | Biến thể |
|---|---|---|
| `generation.available = false` (hết ngân sách, tắt, dịch vụ dừng) | "Tính năng tạo ảnh đang tạm dừng. Bạn vẫn xem được các ảnh đã tạo." Không nêu lý do, không số tiền | `warning`, `role="status"` |
| `quota.remaining = 0` và `held = 0` | "Bạn đã dùng hết lượt tạo ảnh. Lượt mới có sau 00:00 ngày 07/11. Các ảnh đã tạo vẫn xem được." Mốc lấy từ `monthlyResetsAt` nếu `monthlyUsed ≥ monthlyLimit`, ngược lại `dailyResetsAt`; hiển thị theo giờ Việt Nam (`Asia/Ho_Chi_Minh`) | `warning`, `role="status"` |
| `quota.remaining = 0` và `held > 0` | Không hiện (lượt cuối đang giữ cho ảnh đang tạo, kết quả có thể đổi) | — |
Hai thông báo có thể cùng hiện, `generation` đứng trên. Không đóng được. Khi người mua vẫn chọn sản phẩm chưa có ảnh, phần hiển thị ở khung do trạng thái cụ thể (`try-on-states.md`, S10 → S11) quyết định.

### Trình đọc màn hình và focus
- Một `h1`; `h2` cho tên sản phẩm và cho từng cổng. Sân khấu là `<section aria-labelledby>` của `h2` tên sản phẩm.
- **Một vùng `aria-live="polite" aria-atomic="true"`, `sr-only`, luôn tồn tại**, nhận các thông báo: "Sản phẩm 3 trên 12: Áo thun trắng, 199.000 đồng" (sau 400 ms dừng), "Đang tạo ảnh bạn mặc Áo thun trắng" (một lần khi bắt đầu chờ), "Vẫn đang tạo, có thể lâu hơn một chút" (mốc 15 giây), "Ảnh bạn mặc Áo thun trắng đã sẵn sàng", "Đây là sản phẩm cuối của danh mục". Các khối lỗi tự có `role="alert"` và **không** lặp lại qua vùng live.
- Đổi danh mục: thông báo "Danh mục Áo thun, 12 sản phẩm".
- Focus: không tự ý di chuyển focus khi chuyển sản phẩm hay khi ảnh sinh xong (người dùng bàn phím giữ nguyên vị trí ở nút mũi tên). Ngoại lệ do **hành động của người dùng**: bấm **Thử lại** hoặc **Kiểm tra lại** → focus vào khối trạng thái chờ mới (`tabIndex=-1`) vì nút vừa bấm biến mất; bấm **Danh mục khác** → focus chip đang chọn; bấm **Xem sản phẩm tiếp theo** → focus nút Sau (nếu còn dùng được) hoặc `h2` tên sản phẩm mới. Khi cổng G1/G2 xuất hiện giữa chừng: focus vào `h2` của cổng.
- Ảnh có `alt` như mục 2a; icon trang trí `aria-hidden`; nút icon có `aria-label`.

### Motion và `prefers-reduced-motion`
| Hiệu ứng | Bình thường | Reduced motion |
|---|---|---|
| Chuyển sản phẩm | Cross-fade + trượt 12px, 200ms | Đổi tức thì |
| Trải phẳng → thử đồ | Cross-fade 300ms | Đổi tức thì |
| Vuốt ở biên | Nảy 16px 160ms | Không nảy |
| Skeleton, sweep chờ trên khung | Shimmer 1,5s | Tắt shimmer, giữ khối tĩnh |
| Spinner | Quay 0,8s | Thay bằng chữ tĩnh "Đang tạo…" (không xoay) |
| Cuộn chip vào giữa | `scroll-behavior: smooth` | `auto` |
Chỉ animate `transform` và `opacity`. Không có tiến trình phần trăm giả (US-05 §4).

### Ghi chú
- **Chừa chỗ giỏ hàng (Epic 4), chỉ ghi chú:** US-07 sẽ đặt nút "Thêm vào giỏ" trên màn này, áp dụng cho sản phẩm đang xem và **phải dùng được khi ảnh đang chờ, bị lỗi hay bị chặn** (US-05 §13). Sprint này không vẽ nút; chỉ giữ chỗ trong bố cục: mobile ngay dưới khối giá; desktop cuối cột phải. Không đặt thanh cố định đáy ở sprint này.
- Hiệu ứng "lượt tạo ảnh" chỉ hiện ≤ 5 lượt (US-05 §10). Không hiển thị số tiền, ngân sách, tên model.
- Không gọi `GET /products` hay `/result` khi tab ẩn cho việc tải trước; poll job của sản phẩm đang xem vẫn tiếp tục.
- Ảnh try-on chứa thân thể người dùng: không cho `<img draggable>` (đặt `draggable="false"`), không có nút tải xuống, chia sẻ (ngoài phạm vi sprint).
- Frontend **không** hiển thị `error.message` của server. Chuỗi hiển thị luôn lấy theo `error.code` từ [`try-on-states.md`](try-on-states.md) (đề xuất D-119).
