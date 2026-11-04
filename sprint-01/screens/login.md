# Screen Descriptions — Đăng nhập

> US-01 §4.2, §5, AC-05/06/07/08 · API: `POST /api/auth/login` · Design system: `design/design-system.md` · Stitch tham khảo: screen `9f36f0e62d9246aead1ed6fd0ddde98a` (bỏ "Quên mật khẩu" và đăng nhập Google/Apple — ngoài phạm vi)

## Đăng nhập — `/login`

### Mục đích
Cho khách và admin đăng nhập bằng email + mật khẩu; là đích chuyển hướng khi chưa đăng nhập, hết phiên hoặc đăng xuất.

### Quyền truy cập
Public, **GuestOnly**: đã đăng nhập thì chuyển đi (admin → `/admin`, user → `/`, D-33). Khi trạng thái phiên đang `loading` hiển thị màn chờ toàn trang (xem `header-navigation.md`), chưa render form.

### Bố cục
- **Mobile (< 640px)**: một cột, padding ngang 16px, không card (form nằm thẳng trên nền `canvas`). Từ trên xuống: header tối giản (logo "Try-on" giữa, không menu) → H1 → thông báo → form → link đăng ký. Nút "Đăng nhập" full-width cao 48px.
- **Tablet (640–1023px)**: form nằm trong card `max-w-md` (448px) căn giữa ngang, cách header 48px, nền `surface`, viền `line`, radius `lg`, padding 32px.
- **Desktop (≥ 1024px)**: hai cột. Trái (50%): ảnh editorial/khối nền `surface-muted` với câu slogan serif "Thử đồ trên chính bạn." (trang trí, `aria-hidden`, ẩn dưới lg). Phải: card form như tablet, căn giữa dọc. Header chung của trang (guest) hiển thị ở trên.

### Các thành phần chính
1. **Tiêu đề (H1)** "Chào mừng trở lại" (`display`, Playfair) + phụ đề `body` `ink-muted`: "Đăng nhập để vào phòng thử đồ của bạn."
2. **Thông báo ngữ cảnh** (Alert, `role="status"`) — hiển thị theo `location.state.notice`:
   - `session-expired` (do handler 401, AC-08): Alert warning "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."
   - `signed-out` (sau đăng xuất, tùy chọn): Alert info "Bạn đã đăng xuất."
   - Tự biến mất khi bắt đầu gõ? Không — giữ đến khi gửi form.
3. **Lỗi chung đầu form** (Alert danger `role="alert"`, đặt ngay trên ô Email, có nút đóng): dùng cho lỗi không gắn được vào ô (xem bảng lỗi).
4. **Ô Email** — label "Email"; `type=email`, `autocomplete="email"`, `autofocus` trên desktop (không autofocus mobile để tránh bật bàn phím che bố cục). Validate on blur.
5. **Ô Mật khẩu** — label "Mật khẩu"; `autocomplete="current-password"`; nút hiện/ẩn (44x44). Validate on blur (không rỗng, ≤ 72 ký tự). Không hiện checklist độ mạnh ở màn này.
6. **Nút "Đăng nhập"** (primary, `lg`, full-width mobile). Enter trong form cũng gửi.
7. **Link** "Chưa có tài khoản? **Đăng ký**" → `/register` (mang theo `state.from` nếu có).
Không có "Quên mật khẩu" (D-04), không có "Ghi nhớ đăng nhập" (token luôn lưu 7 ngày).

### Trạng thái
| Trạng thái | Mô tả |
|---|---|
| Mặc định | Form trống, nút enabled (không khóa nút khi chưa nhập; để validate khi bấm) |
| Lỗi theo trường (client, on blur/submit) | Viền `danger` + lỗi dưới ô: Email rỗng "Vui lòng nhập email."; sai định dạng "Email không hợp lệ."; > 254 ký tự "Email quá dài."; mật khẩu rỗng "Vui lòng nhập mật khẩu." Submit lỗi → focus ô lỗi đầu tiên, không gọi API |
| Loading | Nút thành loading ("Đang đăng nhập…", spinner, `aria-busy`), mọi ô `readonly`, link đăng ký vẫn bấm được; chặn gửi trùng. Nếu > 8 giây chưa phản hồi: giữ nguyên, không đổi (bcrypt chậm vẫn bình thường) |
| Thành công | Điều hướng ngay theo `post-login-navigation` (không toast; trang đích tự cho thấy trạng thái) |
| Lỗi chung | Alert danger đầu form, giữ email đã nhập, **xóa ô mật khẩu** và focus vào ô mật khẩu (trừ 429) |
| 429 đếm ngược | Xem mục dưới |
| Disabled | Nút "Đăng nhập" disabled trong lúc đếm ngược 429 |

### Map mã lỗi API → hiển thị
| HTTP / mã | Vị trí | Thông báo tiếng Việt | Hành vi |
|---|---|---|---|
| 400 `VALIDATION_ERROR` + `details[]` | Dưới từng ô theo `field` (`email`, `password`); field lạ → lỗi chung | Dùng `details[].message` (đã tiếng Việt) | Focus ô lỗi đầu tiên |
| 401 `INVALID_CREDENTIALS` | Lỗi chung (Alert danger) | "Email hoặc mật khẩu không đúng." | Không tô đỏ riêng ô nào (không lộ ô sai); xóa mật khẩu, focus mật khẩu. **Không** coi là hết phiên, không redirect |
| 429 `TOO_MANY_ATTEMPTS` | Alert warning thay lỗi chung | "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau X phút." (X = `ceil(retryAfterSeconds/60)`) | Đếm ngược (mục dưới) |
| 429 `TOO_MANY_REQUESTS` | Alert warning | "Bạn thao tác quá nhanh, vui lòng thử lại sau." (+ " Còn mm:ss." nếu có `retryAfterSeconds`) | Đếm ngược nếu có số giây, nếu không khóa nút 10 giây |
| 500 `INTERNAL_ERROR` / không có response (mạng) | Alert danger | "Có lỗi xảy ra, vui lòng thử lại." (mất mạng: "Mất kết nối, vui lòng kiểm tra mạng và thử lại.") | Giữ email, xóa mật khẩu |
| Mã không biết | Alert danger | Dùng `error.message` nếu có, ngược lại "Có lỗi xảy ra, vui lòng thử lại." | — |

### Đếm ngược 429 (`retryAfterSeconds`)
- Alert warning (icon `Clock`) nội dung: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau **12 phút**." kèm dòng phụ `small`: "Có thể đăng nhập lại sau **11:42**." cập nhật mỗi giây (`mm:ss`).
- Nút primary disabled, nhãn "Thử lại sau 11:42" (`tabular-nums` để không nhảy chiều rộng).
- Hết giờ: Alert đổi thành info "Bạn có thể thử đăng nhập lại.", nút trở lại enabled "Đăng nhập", focus **không** tự động chuyển.
- Đếm theo mốc thời gian tuyệt đối (`Date.now()` + `retryAfterSeconds`) để chính xác khi tab ngủ/không bị lệch; đồng hồ lưu trong state trang (không cần lưu qua reload; reload thì thử lại và server trả 429 lần nữa).
- A11y: vùng đếm ngược `aria-hidden` cho phần giây; trình đọc màn hình chỉ nghe thông báo đầu ("… thử lại sau 12 phút") và khi hết giờ ("Bạn có thể thử đăng nhập lại") qua `role="status"` riêng.

### Hiệu ứng
Alert xuất hiện fade + trượt xuống 8px/200ms; lỗi trường fade 120ms; lắc ngang nhẹ ô mật khẩu khi sai thông tin (translateX ±4px, 200ms; bỏ khi reduced-motion).

### Navigation
- Đến từ: link "Đăng nhập" ở header (guest), redirect của route guard (kèm `state.from`), handler 401 toàn cục (kèm `state.notice = "session-expired"` + `state.from`), đăng xuất, link ở màn Đăng ký / lỗi E2.
- Đi tới: theo `post-login-navigation.md` (từ `state.from` hợp lệ & hợp vai → chuyển tới đó `replace`; admin → `/admin`; user chưa đủ hồ sơ → `/profile`; ngược lại `/`); `/register`.

### Accessibility
- `<form noValidate>`, mọi ô có `<label for>`; lỗi trường `aria-describedby`; lỗi chung `role="alert"`; sau submit lỗi focus quản lý như trên.
- Enter để gửi; thứ tự Tab: Email → Mật khẩu → (nút mắt) → Đăng nhập → link Đăng ký.
- Trình quản lý mật khẩu hoạt động (đúng `autocomplete`, `name="email"`/`name="password"`).

### Ghi chú
- Không bao giờ hiển thị khác nhau giữa email lạ và sai mật khẩu (AC-06).
- Không đặt `state.from` hiển thị trên UI; chỉ dùng để quay lại.
