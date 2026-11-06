# Design System — Try-on "Atelier"

> Tạo ở Sprint 01 (agent-uiux). Phong cách: **fashion editorial, tối giản, mobile-first**. Nền kem ấm, chữ đen mực, serif cho tiêu đề, nhiều khoảng trắng, khung ảnh 3:4. Chỉ dùng **light mode** ở MVP (dark mode không nằm trong phạm vi; token đặt theo ngữ nghĩa để thêm sau).

## 0. Nguồn Stitch

| Mục | Giá trị |
|---|---|
| Stitch project | `projects/4499115407225778923` (tên "Try-on") |
| Design system **đang dùng** | `assets/15541956557944040887` — "Try-on Atelier v2" (headline Playfair Display, body/label Manrope, roundness 8, seed `#1A1A1A`, variant NEUTRAL) |
| Design system bản cũ (bỏ) | `assets/10966836231677352902` — "Try-on Atelier" (headline Bodoni Moda; **không có glyph tiếng Việt** nên thay bằng Playfair). `update_design_system` báo `Request contains an invalid argument` nên phải tạo bản v2 thay vì sửa; có thể xóa bản cũ trên stitch.withgoogle.com |
| Screen tham khảo | Đăng nhập (mobile): `9f36f0e62d9246aead1ed6fd0ddde98a` |

Lưu ý: Stitch tự thêm vào mockup đăng nhập "Quên mật khẩu?" và "Google/Apple" — **ngoài phạm vi MVP (D-04, US-01 §3)**, KHÔNG làm. Stitch chỉ dùng để chốt phong cách; nguồn chuẩn là các file `sprint-xx/screens/*.md` + file này.

## 1. Màu (token ngữ nghĩa)

Tên Tailwind = `--color-<tên>` trong `@theme` (mục 9). Tỷ lệ tương phản tính trên nền `canvas` `#FAF8F5` (trừ khi ghi khác).

| Token | Hex | Dùng cho | Tương phản |
|---|---|---|---|
| `canvas` | `#FAF8F5` | Nền trang | — |
| `surface` | `#FFFFFF` | Card, input, modal | — |
| `surface-muted` | `#F2EEE8` | Nền phụ, skeleton, vùng dropzone | — |
| `line` | `#E3DDD4` | Viền trang trí (card, divider) | — (trang trí) |
| `line-strong` | `#8C857B` | Viền input/checkbox (thành phần UI cần ≥3:1) | 3,5:1 |
| `ink` | `#1A1A1A` | Chữ chính, nút primary | 16:1 |
| `ink-muted` | `#5C564E` | Chữ phụ, hint, label phụ | 7:1 |
| `ink-subtle` | `#6F685F` | Placeholder, chú thích | 5,0:1 |
| `ink-inverse` | `#FFFFFF` | Chữ trên nút đen | 17:1 trên `ink` |
| `accent` | `#8A6F5A` | Điểm nhấn trang trí, icon, viền focus phụ, thanh progress | 4,6:1 (dùng được cho chữ ≥ 14px đậm / icon) |
| `accent-strong` | `#6F5642` | Chữ link/nhấn mạnh cỡ thường | 6,6:1 |
| `accent-soft` | `#F1E9E1` | Nền banner thông tin / chip | — |
| `danger` | `#B4443C` | Lỗi: chữ lỗi, viền input lỗi, icon | 5,3:1 |
| `danger-soft` | `#FBEDEB` | Nền alert lỗi | `danger` trên nền này 4,7:1 |
| `success` | `#2F6B4F` | Thành công, checklist đạt | 6,0:1 |
| `success-soft` | `#EAF3EE` | Nền alert/toast thành công | 5,4:1 |
| `warning` | `#8A5A00` | Cảnh báo (vd. 429 đếm ngược) | 5,6:1 |
| `warning-soft` | `#FFF4DB` | Nền alert cảnh báo | 5,0:1 |
| `disabled-bg` / `disabled-ink` | `#ECE7E0` / `#8C857B` | Nút/ô vô hiệu (được miễn tỉ lệ WCAG) | — |
| `scrim` | `rgb(26 26 26 / 0.5)` | Lớp phủ modal | — |

Quy tắc: màu **đỏ chỉ cho lỗi**; mọi trạng thái lỗi/thành công luôn kèm icon + chữ (không chỉ dùng màu). Nút primary luôn đen (`ink`), không dùng `accent` làm nền nút.

## 2. Typography

| Vai trò | Font | Ghi chú |
|---|---|---|
| Display / tiêu đề (`font-display`) | **Playfair Display** 500/600/700 (có subset `vietnamese`) | Chỉ cho logo, H1, H2 |
| Body / UI (`font-sans`) | **Manrope** 400/500/600/700 (có subset `vietnamese`) | Mọi chữ còn lại |

Tải bằng `@fontsource-variable/manrope` + `@fontsource/playfair-display` (import subset `latin`, `latin-ext`, `vietnamese`) hoặc Google Fonts với `subset=latin,latin-ext,vietnamese`; `font-display: swap`. Fallback: `ui-serif, Georgia` / `ui-sans-serif, system-ui`.

| Token (`text-*`) | Mobile | ≥ md (768px) | Weight | Line-height | Dùng cho |
|---|---|---|---|---|---|
| `display` | 32/40 | 44/52 | Playfair 600 | 1,25 | H1 trang (tracking `-0.01em`) |
| `title` | 24/32 | 28/36 | Playfair 600 | 1,3 | H2 section |
| `heading` | 18/26 | 18/26 | Manrope 700 | 1,45 | H3, tiêu đề card |
| `body` | 16/24 | 16/24 | Manrope 400 | 1,5 | Nội dung, input (16px để iOS không zoom) |
| `small` | 14/20 | 14/20 | Manrope 500 | 1,45 | Label, hint, lỗi, nút phụ |
| `caption` | 12/16 | 12/16 | Manrope 600, uppercase `tracking-wider` | 1,35 | Eyebrow, badge (chỉ chữ ≥ 12px, không dùng cho lỗi) |

Tối đa 3–4 cỡ chữ trên một màn. Không cỡ chữ < 12px.

## 3. Spacing, lưới, radius, shadow

- **Thang spacing**: lưới 4px (Tailwind mặc định `--spacing: 0.25rem`): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Gutter trang: **16px** (mobile), **24px** (md), **32px** (lg).
- **Container**: `max-w-6xl` (1152px) cho trang thường; trang form (đăng nhập/đăng ký) `max-w-md` (448px); trang Hồ sơ `max-w-5xl`.
- **Radius**: `sm` 4px (badge, checkbox), `md` 8px (input, nút, card nhỏ — mặc định), `lg` 12px (card, modal), `xl` 16px (khung ảnh lớn), `full` (avatar, chip, progress).
- **Shadow** (nhẹ, ấm): `card` `0 1px 2px rgb(26 26 26/.06), 0 4px 12px rgb(26 26 26/.04)`; `pop` (dropdown/toast) `0 8px 24px rgb(26 26 26/.12)`; `modal` `0 16px 48px rgb(26 26 26/.18)`. Card thường dùng viền `line` + shadow `card` hoặc chỉ viền.
- **Z-index**: header 30, dropdown 40, modal/scrim 50, toast 60.

## 4. Breakpoints (Tailwind v4 mặc định, giữ nguyên)

| Tên | Min width | Ý nghĩa |
|---|---|---|
| (mặc định) | 0 | Mobile (thiết kế từ 360px) |
| `sm` | 640px | Mobile lớn / tablet dọc |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Desktop rộng |

Tài liệu screens dùng 3 mốc: Mobile < 640, Tablet 640–1023, Desktop ≥ 1024. Viết CSS mobile-first (không `max-*:`).

## 5. Icon & ảnh

- Thư viện: **lucide-react**, stroke 1.5px, kích thước 16 / 20 / 24px; màu theo `currentColor`. Icon thuần trang trí có `aria-hidden="true"`; icon đứng một mình (nút icon) bắt buộc `aria-label`.
- Ảnh người dùng/thử đồ: tỉ lệ **3:4** (`aspect-[3/4]`), `object-contain` trên nền `surface-muted` (không cắt, không méo) khi xem ảnh đã tải; `object-cover` chỉ cho thumbnail.
- Ảnh luôn có `alt` mô tả ("Ảnh toàn thân của bạn").

## 6. Motion

- Thời lượng: 120ms (hover/focus), 200ms (mở/đóng, toast), 300ms (chuyển cảnh). Easing `ease-out` vào, `ease-in` ra. Chỉ animate `transform`/`opacity`.
- Skeleton: shimmer 1,5s lặp. Spinner: quay 0,8s.
- **Bắt buộc** tôn trọng `prefers-reduced-motion`: tắt shimmer/slide/scale (dùng `motion-reduce:` hoặc media query toàn cục), giữ spinner dưới dạng chữ "Đang tải..." tĩnh nếu cần.

## 7. Component cơ bản

Mỗi component dưới đây là nguồn chuẩn cho agent-coder; đặt tại `frontend/src/components/`.

### 7.1 Button
- Biến thể: `primary` (nền `ink`, chữ `ink-inverse`), `secondary` (nền `surface`, viền `line-strong`, chữ `ink`), `ghost` (không nền, chữ `ink`, gạch chân khi hover), `danger` (nền `danger`, chữ trắng — chỉ cho hành động hủy bỏ như xóa ảnh), `link` (chữ `accent-strong`, gạch chân).
- Kích thước: `md` cao **44px** (mặc định, padding ngang 20px), `lg` cao 48px (CTA full-width trên form). `sm` cao 36px chỉ dùng trên desktop (không dùng cho thao tác chính trên mobile). Radius `md`, chữ `small` 600 (hoặc `body` 600 ở `lg`).
- Trạng thái: hover (primary → `#333`; secondary → nền `surface-muted`), focus-visible (vòng focus mục 8), active (scale 0.98), **disabled** (`disabled-bg`/`disabled-ink`, `cursor-not-allowed`, thuộc tính `disabled`), **loading** (spinner 16px thay icon trái + giữ nguyên chiều rộng, nhãn đổi "Đang…", `aria-busy="true"`, vẫn `disabled` để chặn gửi trùng).
- Nút full-width trên mobile cho CTA chính của form.

### 7.2 Input & Form field
- Cấu trúc `FormField`: `<label>` (small 600, luôn hiển thị, không dùng placeholder thay label) → input → hint (small, `ink-muted`) → lỗi (small, `danger`, icon `AlertCircle` 16px đứng trước).
- Input: cao 48px (mobile) / 44px (lg), nền `surface`, viền 1px `line-strong`, radius `md`, padding 12px 16px, chữ `body` 16px, placeholder `ink-subtle`. Đơn vị (cm/kg) là phần "adornment" bên phải trong ô (nền `surface-muted`, chữ `ink-muted`, không chiếm vùng nhập).
- Trạng thái: hover (viền `ink-muted`), focus (viền `ink` 1px + vòng focus), **error** (viền 2px `danger`, `aria-invalid="true"`, lỗi gắn bằng `aria-describedby`), disabled, readonly.
- Ô mật khẩu: nút hiện/ẩn (icon `Eye`/`EyeOff`, vùng chạm 44x44, `aria-label="Hiện mật khẩu"` / `"Ẩn mật khẩu"`, `aria-pressed`).
- **Lỗi theo trường**: hiện ngay dưới ô, ở dạng `<p id="{field}-error" role="alert"?>` — chỉ dùng `role="alert"` khi lỗi xuất hiện sau thao tác gửi; lỗi on-blur dùng `aria-live="polite"`. Khi submit lỗi: focus chuyển tới ô lỗi đầu tiên.
- `type`/`inputmode`/`autocomplete`: email → `type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"`; mật khẩu → `autocomplete="new-password"` (đăng ký) / `"current-password"` (đăng nhập); chiều cao → `inputmode="numeric"`; cân nặng → `inputmode="decimal"`.

### 7.3 Checkbox
- Hộp 24x24 (vùng chạm cả hàng ≥ 44px: bọc trong `<label>`), viền `line-strong`, radius `sm`; checked nền `ink` + dấu tick trắng. Nhãn `body` bên phải, có thể nhiều dòng. Lỗi: viền `danger` + lỗi bên dưới. Dùng `<input type="checkbox">` thật (ẩn bằng `sr-only` + hộp tùy biến, `peer`), focus-visible hiện vòng focus quanh hộp.

### 7.4 Alert (nội tuyến) & Toast
- **Alert**: khối `radius md`, viền trái 4px, nền `*-soft`, icon + tiêu đề (tùy chọn) + nội dung, nút đóng tùy chọn. Biến thể `danger` (icon `AlertCircle`), `success` (`CheckCircle2`), `warning` (`Clock`/`AlertTriangle`), `info` (`Info`, nền `accent-soft`). Lỗi chung đầu form: `role="alert"`, đặt ngay trên nút gửi hoặc đầu form (theo từng màn).
- **Toast**: góc dưới giữa (mobile, cách đáy 16px + safe-area) / góc trên phải (≥ md); rộng tối đa 360px; nền `ink`, chữ trắng (thành công có icon `Check` màu `#8FD3B0`); tự tắt 4s (lỗi: 6s, có nút đóng); `role="status"` `aria-live="polite"` (lỗi `role="alert"`); hover/focus tạm dừng đếm giờ; chồng tối đa 3. Animation trượt-lên + fade 200ms (tắt khi reduced-motion).

### 7.5 Upload dropzone & Progress bar
- **Dropzone** (ảnh toàn thân): khung `aspect-[3/4]`, `max-w-xs` trên mobile (≤ 320px), nền `surface-muted`, viền 2px nét đứt `line-strong`, radius `xl`; giữa: icon `ImagePlus` 32px, dòng "Chọn ảnh toàn thân" (heading) + "JPG, PNG, WEBP · tối đa 10 MB" (small). Là `<button>` (mở file picker) bọc `<input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp">`; desktop có thêm kéo-thả (hover khi kéo: viền `ink`, nền `accent-soft`). Disabled (chưa consent): nền nhạt, viền nhạt, kèm chú thích vì sao khóa.
- **Preview**: ảnh `object-contain` trong cùng khung 3:4, nút phụ "Chọn ảnh khác" + nút primary "Lưu ảnh".
- **Progress bar**: đường cao 8px, nền `line`, fill `accent` (radius full), `role="progressbar" aria-valuemin=0 aria-valuemax=100 aria-valuenow aria-label="Tiến trình tải ảnh"`, kèm chữ phần trăm "Đang tải lên… 64%" (small). Khi 100% mà chưa có response: chuyển sang "Đang xử lý ảnh…" (bar indeterminate shimmer).

### 7.6 Card
- Nền `surface`, viền 1px `line`, radius `lg`, padding 16 (mobile) / 24 (≥ md), shadow `card` tùy chọn. Tiêu đề card dùng `heading`; card section của Hồ sơ có số thứ tự nhỏ (`caption`) làm eyebrow. Card có thể tương tác (hover: viền `line-strong`, nâng shadow).

### 7.7 Header / Navigation
- Header cố định trên (sticky), cao 56px (mobile) / 64px (lg), nền `canvas` + viền dưới `line` (shadow nhẹ khi đã cuộn), z 30. Trái: logo chữ "Try-on" (Playfair 600, 22px, là link `/`). Phải: theo trạng thái đăng nhập (xem `sprint-01/screens/header-navigation.md`). Skip link "Bỏ qua điều hướng" là phần tử đầu tiên. Menu mobile dạng dropdown/sheet từ avatar (không hamburger khi chỉ có ≤ 3 mục).
- Nav link: chữ `small` 600, active có gạch chân 2px `ink` (đồng thời `aria-current="page"`).

### 7.8 Loading, Skeleton, Empty, Error state
- **Spinner**: vòng 16/24/40px, `accent` trên `line`; luôn kèm chữ ẩn "Đang tải" (`sr-only`) hoặc `aria-label`.
- **Skeleton**: khối `surface-muted` radius như phần tử thật, shimmer gradient (tắt khi reduced-motion); giữ đúng kích thước để không nhảy layout (khung ảnh 3:4, ô input cao 48px).
- **Màn chờ toàn trang** (khôi phục phiên): logo "Try-on" giữa màn + spinner 24px + "Đang tải…", `role="status"`.
- **Empty state**: icon 40px `ink-subtle` + tiêu đề `heading` + mô tả `small` + CTA (nếu có), căn giữa, padding dọc 48px.
- **Error state** (lỗi tải/kết nối): icon `WifiOff`/`AlertCircle` + "Không thể kết nối. Vui lòng kiểm tra mạng và thử lại." + nút "Thử lại".

### 7.9 Modal (xác nhận)
- Dùng `<dialog>`/role `dialog` `aria-modal="true"`, `aria-labelledby`, `aria-describedby`; nền `surface`, radius `lg`, shadow `modal`, padding 24, rộng tối đa 400px (mobile: bottom sheet, bo góc trên 16px, dính đáy). Scrim `scrim`. Focus vào nút an toàn (Hủy) khi mở, **trap focus**, Esc đóng (trừ lúc đang loading), trả focus về nút gọi. Hai nút: Hủy (secondary) + hành động (danger/primary); khi loading cả hai disabled.

### 7.10 Các mẫu nhỏ khác
- **Checklist hướng dẫn**: danh sách `ul` mỗi dòng icon (`Check` `success` cho "nên", `X` `danger` cho "không nên") + chữ; không dựa vào màu đơn thuần (icon khác hình).
- **Badge trạng thái**: chip `caption`, nền `*-soft`, có icon (vd. "Đã đầy đủ" success, "Còn thiếu" warning).
- **Link**: `accent-strong`, gạch chân, hover `ink`.

### 7.11 Thành phần cho trang quản trị (thêm ở Sprint 02)

> Không thêm token màu/font/radius/shadow mới; chỉ ghép từ token sẵn có. Chi tiết dùng ở `sprint-02/screens/`.

- **AdminNav**: ≥ lg là sidebar `w-56` (mục: Tổng quan, Danh mục, Sản phẩm, Đơn hàng [disabled, badge "SẮP RA MẮT"]); < lg là thanh tab ngang dưới header (`overflow-x-auto`, mỗi mục cao 44px, không có "Đơn hàng"). Mục hiện tại: `aria-current="page"` + gạch chân 2px `ink` (tab) / nền `surface-muted` + chữ 600 (sidebar). Nhận diện theo tiền tố route (`/admin/products/new` vẫn sáng "Sản phẩm").
- **Select** (`<select>` gốc): cùng khung với Input (cao 48px mobile / 44px lg, viền `line-strong`, radius `md`, chữ `body`), icon `ChevronDown` 20px bên phải (`aria-hidden`, `pointer-events-none`), trạng thái hover/focus/error/disabled như 7.2. Dùng `<select>` gốc để có picker native trên mobile.
- **Ô giá (MoneyField)**: là Input 7.2 với adornment phải "₫", `inputmode="numeric"`, `autocomplete="off"`, hiển thị `199.000` khi blur.
- **Danh sách dữ liệu (DataList)**: `<ul>` các dòng trong một card (viền `line`, radius `lg`, dòng cách nhau `divide-line`). < md: mỗi dòng là khối dọc; ≥ md: dòng là lưới cột kèm hàng tiêu đề cột (`caption`, `ink-muted`, `aria-hidden`). Dòng vừa thêm/sửa được tô nền `accent-soft` 2 giây rồi mờ dần (opacity, tắt khi reduced-motion; không dùng màu làm thông tin duy nhất vì đã có toast).
- **Ảnh sản phẩm (flat lay)**: khung **1:1** (`aspect-square`), `object-contain` trên `surface-muted`, radius `lg` (khung lớn) / `md` (thumbnail 56–64px). Khác khung 3:4 của ảnh người dùng vì flat lay có tỉ lệ từ 1:3 đến 3:1 và không được cắt. Ảnh lỗi tải: nền `surface-muted` + icon `ImageOff` 24px, `alt` giữ nguyên.
- **Phân trang**: `<nav aria-label="Phân trang">` gồm nút secondary "Trước" / "Sau" (cao 44px, có icon `ChevronLeft`/`ChevronRight`), giữa là "Trang 2 / 5" (`small`, `aria-live="polite"`). Nút disabled ở trang đầu/cuối.
- **Dropzone dạng nút chọn ảnh vuông** (biến thể 7.5 cho ảnh sản phẩm): cùng cấu trúc, khung 1:1 thay vì 3:4, `max-w-xs`.
- **Toast** (7.4) dùng ở cả trang quản trị: đặt provider ở cấp layout dùng chung thay vì riêng trang Hồ sơ.

### 7.12 Thành phần cho Phòng thử đồ (thêm ở Sprint 03)

> Không thêm hay đổi token màu/font/radius/shadow; chỉ ghép từ token sẵn có. Chi tiết dùng ở `sprint-03/screens/`.

- **Chip danh mục**: nút `min-h-11`, padding ngang 16px, radius `full`, chữ `small` 600, viền `line-strong`, nền `surface`. Chọn: nền `ink`, chữ `ink-inverse`, kèm icon `Check` 16px và `aria-pressed="true"` (không chỉ dựa vào màu). Nhóm chip cuộn ngang ở mobile (có dải mờ `canvas` ở mép), xuống dòng ở lg.
- **Nút mũi tên (icon tròn)**: 48 × 48px, `rounded-full`, nền `surface`, viền `line-strong`, `shadow-card`, icon `ChevronLeft`/`ChevronRight` 24px. Trạng thái vô hiệu dùng `aria-disabled="true"` + kiểu `disabled-bg`/`disabled-ink`, **không** dùng thuộc tính `disabled`, để người dùng bàn phím không mất focus khi tới đầu/cuối danh sách.
- **Khung ảnh thử đồ (stage frame)**: tỉ lệ **3:4** cố định, radius `xl`, nền `surface-muted`, ảnh `object-contain`. Kích thước khung không đổi giữa ảnh trải phẳng, ảnh thử đồ, skeleton và lỗi. Nhãn góc "ẢNH SẢN PHẨM" (`caption`, nền `surface`, viền `line`, radius `sm`) phân biệt ảnh trải phẳng với ảnh của người dùng.
- **Lớp phủ trạng thái (StageOverlay)**: thẻ trong khung, sát đáy, cách mép 12px, nền `surface`, viền `line`, radius `lg`, `shadow-card`; kiểu *chờ* (Spinner + một dòng `small`) và kiểu *thông báo* (icon + nội dung + tối đa 2 nút). Màu theo biến thể Alert (`danger`/`warning`/`info`), luôn kèm icon và chữ.
- **Nhãn AI**: dòng `small` `ink-muted` có icon `Sparkles`, đặt dưới khung ảnh thử đồ, là văn bản thật (không chỉ nằm trong `alt`).
- **Cross-fade ảnh**: 300ms `opacity` (trải phẳng → thử đồ); chuyển sản phẩm 200ms `opacity` + `translateX` 12px. Reduced motion: đổi tức thì.
- **Thẻ consent**: card `max-w-xl`, danh sách "điều cần biết" mỗi dòng icon 20px `accent` + tiêu đề `small` 700 + nội dung `small`; luôn hiển thị đầy đủ, không thu gọn.

### 7.13 Thành phần cho Giỏ hàng và Đơn hàng (thêm ở Sprint 04)

> Không thêm hay đổi token màu/font/radius/shadow; chỉ ghép từ token sẵn có. Chi tiết dùng ở `sprint-04/screens/`. Mục này **bổ sung** 7.4 và 7.11 (mô tả AdminNav ở 7.11 có mục "Đơn hàng" disabled là của Sprint 02; từ Sprint 04 mục này là link bình thường, xem `sprint-04/screens/entry-points.md`).

- **Nút đang gửi (chế độ `busy`) của `Button`**: nút gửi request (Thêm vào giỏ, Xác nhận đặt hàng, `−`/`+`, Bỏ) dùng `aria-disabled="true"` + `aria-busy="true"` + spinner, **không** dùng thuộc tính `disabled`, để người dùng bàn phím không mất focus về `body` (cùng lý do mũi tên ở 7.12). `loading` hiện có (đặt `disabled`) giữ nguyên cho các nơi không cần giữ focus. Chặn click bằng cách bỏ `onClick`, giữ nguyên chiều rộng nút.
- **Liên kết giỏ hàng (`CartLink`)**: link 44 × 44px, icon `ShoppingBag` 24px, badge số 20px (nền `ink`, chữ `ink-inverse`, `caption` 700) ở góc trên phải; `99+` từ 100. Chấm `warning` 8px góc dưới phải khi giỏ có dòng ngừng bán. Tên truy cập "Giỏ hàng, 3 món". Không hiện badge khi số là 0 hoặc chưa biết.
- **Toast không tương tác (`CartNotice`)**: biến thể của toast 7.4: `pointer-events: none`, không nút đóng, không link; thành công 4s, lỗi 6s (`role="alert"`); thông báo mới thay cái cũ. Dùng khi toast không được cản chạm hay vuốt bên dưới.
- **Bộ chọn số lượng (`QuantityStepper`)**: nhóm `role="group"` gồm nút `−`, số, nút `+`; mỗi nút 44 × 44px, viền `line-strong`, radius `md`, tổng rộng ~128px; số `body` 600 `tabular-nums`, không phải ô nhập. Nút khóa dùng `aria-disabled` (kiểu `disabled-bg`/`disabled-ink`); khi đang cập nhật, số được thay bằng spinner 16px.
- **Dòng giỏ (`CartLine`)**: dòng trong `DataList` có ảnh vuông (72px mobile / 96px ≥ md, `object-contain` trên `surface-muted`), tên, đơn giá, `QuantityStepper`, thành tiền, nút Bỏ. Huy hiệu "Giá đã đổi từ X" và "Không còn bán": chip `small` nền `warning-soft`, chữ `warning`, kèm icon (`Info`, `PackageX`). Dòng ngừng bán: ảnh mờ 60%, viền trái 4px `warning`, không giá, không stepper.
- **Thẻ tóm tắt (`OrderSummaryCard`)**: card `surface`, viền `line`, radius `lg`, padding 16/24; `h2` `heading`; tổng tiền `font-display` 600 `text-title` `tabular-nums`; dòng phụ `small` `ink-muted`. Từ lg: `sticky top-20`.
- **Ô nhập nhiều dòng (`TextAreaField`)**: cùng khung và trạng thái với Input 7.2 (viền `line-strong`, radius `md`, `body` 16px, padding 12px 16px, lỗi viền 2px `danger` + `aria-describedby`), tối thiểu 3 dòng, `resize-y`.
- **Khối lưu ý thanh toán**: `Alert` `info` tĩnh, không đóng được, dòng đầu in đậm "Chưa thanh toán trực tuyến.". Quy tắc chữ: không dùng "thành công", "đã thanh toán", "thanh toán khi nhận hàng", "đang xử lý", "đang giao", "hủy đơn" ở bất cứ đâu trong luồng mua hàng; dùng "Đã ghi nhận đơn hàng".
- **Dòng đơn (`OrderRow`, `AdminOrderRow`)**: `<a>` cả dòng trong `DataList`, số đơn `body` 700 `tabular-nums`, thời gian `<time>` theo `Asia/Ho_Chi_Minh`, icon `ChevronRight` 20px. Mobile: khối hai-ba hàng; ≥ md: lưới cột có hàng tiêu đề `caption` (`aria-hidden`).
- **Tab ngang quản trị 4 mục**: dưới sm ẩn icon trong tab và để `overflow-x-auto` kèm dải mờ mép phải; mục đang chọn được `scrollIntoView` khi vào trang.

## 8. Accessibility (tối thiểu WCAG 2.1 AA)

1. **Tương phản**: chữ thường ≥ 4,5:1, chữ lớn (≥ 24px hoặc ≥ 18,66px đậm) và thành phần UI (viền input, icon quan trọng) ≥ 3:1 — dùng đúng các token ở mục 1 (đã tính sẵn).
2. **Focus**: mọi phần tử tương tác có `:focus-visible` rõ: `outline: 2px solid ink; outline-offset: 2px` + (trên nền tối/nút đen) `box-shadow: 0 0 0 4px canvas` để vẫn thấy. Tailwind: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`. Không `outline: none` nếu không thay thế.
3. **Lỗi form**: `aria-invalid="true"` trên ô lỗi; thông báo lỗi có `id` và gắn `aria-describedby` (kèm hint nếu có); lỗi sau submit → focus ô lỗi đầu tiên; lỗi chung → `role="alert"` (đọc ngay); lỗi on-blur → vùng `aria-live="polite"`. Lỗi luôn kèm icon + chữ.
4. **Label** luôn hiển thị; trường bắt buộc ghi rõ bằng chữ ("Bắt buộc") hoặc `aria-required`, không chỉ dấu `*`.
5. **Vùng chạm** ≥ 44x44px (nút, checkbox hàng, nút hiện/ẩn mật khẩu); khoảng cách giữa 2 vùng chạm ≥ 8px.
6. **Bàn phím**: toàn bộ luồng dùng được bằng Tab/Enter/Space/Esc; thứ tự Tab theo thứ tự thị giác; Enter gửi form; skip link; modal trap focus.
7. **Semantic HTML**: `header`, `nav aria-label`, `main id="main"`, một `h1`/trang, `button` cho hành động, `a` cho điều hướng, `ul` cho danh sách.
8. **Trạng thái động**: loading `aria-busy`, tiến trình `role="progressbar"`, thông báo thành công `role="status"`; đếm ngược 429 cập nhật hiển thị mỗi giây nhưng chỉ **thông báo cho trình đọc màn hình** khi bắt đầu và khi kết thúc (tránh đọc từng giây).
9. **Không chỉ dùng màu** để truyền thông tin; **không tự động** chuyển trang/đổi focus trừ khi có hành động người dùng (trừ chuyển hướng sau đăng nhập).
10. **Motion**: `prefers-reduced-motion` (mục 6). **Zoom**: bố cục không vỡ ở 200% và chữ co giãn theo `rem`; `<meta viewport>` không chặn zoom.
11. Ngôn ngữ trang `<html lang="vi">`.

## 9. Ánh xạ sang Tailwind CSS v4

Đã tra Context7 (`/tailwindlabs/tailwindcss.com`): Tailwind v4 cấu hình **trong CSS** bằng `@theme`; không cần `tailwind.config.js`. Cài: `npm i tailwindcss @tailwindcss/vite`, thêm `tailwindcss()` vào `plugins` của `vite.config`, và `@import "tailwindcss";` ở CSS gốc. Biến trong `@theme` sinh utility theo namespace (`--color-*` → `bg-*`/`text-*`, `--font-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--breakpoint-*`, `--ease-*`, `--animate-*`). Để tái định nghĩa toàn bộ palette mặc định dùng `--color-*: initial;` trước khi khai báo màu mới.

`frontend/src/index.css` (đề xuất cho agent-coder):

```css
@import "tailwindcss";

@theme {
  /* Xóa palette mặc định để chỉ dùng token của dự án */
  --color-*: initial;

  --color-canvas: #faf8f5;
  --color-surface: #ffffff;
  --color-surface-muted: #f2eee8;
  --color-line: #e3ddd4;
  --color-line-strong: #8c857b;
  --color-ink: #1a1a1a;
  --color-ink-muted: #5c564e;
  --color-ink-subtle: #6f685f;
  --color-ink-inverse: #ffffff;
  --color-accent: #8a6f5a;
  --color-accent-strong: #6f5642;
  --color-accent-soft: #f1e9e1;
  --color-danger: #b4443c;
  --color-danger-soft: #fbedeb;
  --color-success: #2f6b4f;
  --color-success-soft: #eaf3ee;
  --color-warning: #8a5a00;
  --color-warning-soft: #fff4db;
  --color-disabled-bg: #ece7e0;
  --color-disabled-ink: #8c857b;
  --color-scrim: rgb(26 26 26 / 0.5);
  --color-white: #ffffff;
  --color-transparent: transparent;
  --color-current: currentColor;

  --font-display: "Playfair Display", ui-serif, Georgia, serif;
  --font-sans: "Manrope Variable", "Manrope", ui-sans-serif, system-ui, sans-serif;

  --text-display: 2rem;           --text-display--line-height: 2.5rem;
  --text-title: 1.5rem;           --text-title--line-height: 2rem;
  --text-heading: 1.125rem;       --text-heading--line-height: 1.625rem;
  --text-body: 1rem;              --text-body--line-height: 1.5rem;
  --text-small: 0.875rem;         --text-small--line-height: 1.25rem;
  --text-caption: 0.75rem;        --text-caption--line-height: 1rem;

  --radius-sm: 0.25rem;  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;  --radius-xl: 1rem;

  --shadow-card: 0 1px 2px rgb(26 26 26 / 0.06), 0 4px 12px rgb(26 26 26 / 0.04);
  --shadow-pop: 0 8px 24px rgb(26 26 26 / 0.12);
  --shadow-modal: 0 16px 48px rgb(26 26 26 / 0.18);

  --ease-out-soft: cubic-bezier(0.2, 0, 0, 1);
  --animate-shimmer: shimmer 1.5s linear infinite;
  @keyframes shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
  --animate-toast-in: toast-in 200ms var(--ease-out-soft);
  @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
}

/* Cỡ chữ display/title lớn hơn từ md (utility thường dùng: text-display md:text-[2.75rem]) */
html { background: var(--color-canvas); color: var(--color-ink); font-family: var(--font-sans); }
:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

Ghi chú cho agent-coder:
- Breakpoints, spacing (`--spacing: 0.25rem`) giữ mặc định v4, không khai báo lại.
- Khai báo `--color-*: initial` sẽ làm mất `bg-white`, `bg-black`...; vì vậy đã thêm `white`/`transparent`/`current` ở trên. Nếu muốn giữ palette mặc định để thử nghiệm, bỏ dòng `initial`.
- `@keyframes` trong `@theme` được Tailwind v4 hỗ trợ; nếu gặp lỗi build, chuyển `@keyframes` ra ngoài `@theme` (giữ biến `--animate-*` trong `@theme`).
- Dark mode: chưa dùng; sau này thêm bằng `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` và đặt lại biến màu dưới `[data-theme=dark]`.
- Chỉ dùng utility theo token (`bg-canvas`, `text-ink-muted`, `border-line`, `rounded-md`, `shadow-card`); không hardcode hex.
