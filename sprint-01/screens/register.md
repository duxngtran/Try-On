# Screen Descriptions — Đăng ký

> US-01 §4.1, §5, §6, AC-01/02/03/04 · API: `POST /api/auth/register` · D-06, D-08, D-16 · Design system: `design/design-system.md`

## Đăng ký — `/register`

### Mục đích
Tạo tài khoản bằng email + mật khẩu; thành công thì tự đăng nhập và đưa tới `/profile` (onboarding).

### Quyền truy cập
Public, **GuestOnly** (đã đăng nhập: admin → `/admin`, user → `/`).

### Bố cục
- **Mobile (< 640px)**: một cột, form trực tiếp trên nền `canvas`, padding 16px, nút full-width cao 48px. Logo "Try-on" ở header tối giản.
- **Tablet (640–1023px)**: card `max-w-md` căn giữa (giống `/login`).
- **Desktop (≥ 1024px)**: hai cột như `/login` (trái: khối editorial với câu "Tạo hồ sơ một lần, thử đồ mọi lúc." — trang trí `aria-hidden`; phải: card form).

### Các thành phần chính
1. **H1** "Tạo tài khoản" + phụ đề "Chỉ cần email và mật khẩu. Bạn sẽ thêm ảnh và số đo ở bước sau."
2. **Lỗi chung đầu form** (Alert danger, `role="alert"`).
3. **Ô Email** — label "Email"; `autocomplete="email"`. Trim khoảng trắng 2 đầu khi blur (hiển thị lại giá trị đã trim). Validate on blur.
4. **Ô Mật khẩu** — label "Mật khẩu"; `autocomplete="new-password"`; nút hiện/ẩn; hint `small` "8–72 ký tự, gồm chữ cái và chữ số, không dấu."
   - **Checklist độ mạnh** (cập nhật khi gõ, `aria-live="polite"` chỉ đọc khi mục đổi trạng thái sau blur — không đọc từng ký tự): ① "Từ 8 đến 72 ký tự" ② "Có ít nhất 1 chữ cái" ③ "Có ít nhất 1 chữ số" ④ (chỉ hiện khi vi phạm) "Chỉ dùng chữ không dấu, số và ký hiệu". Mỗi dòng: icon `Circle` (chưa đạt, `ink-subtle`) → `CheckCircle2` (đạt, `success`) và chữ; khi blur mà chưa đạt: icon `XCircle` `danger`. Không dựa vào màu đơn thuần.
5. **Ô Nhập lại mật khẩu** — label "Nhập lại mật khẩu"; `autocomplete="new-password"`; nút hiện/ẩn riêng. Validate on blur + khi ô mật khẩu đổi (nếu ô này đã có chữ).
6. **Nút "Đăng ký"** (primary, `lg`, full-width mobile).
7. **Link** "Đã có tài khoản? **Đăng nhập**" → `/login`.
Không có họ tên, SĐT, giới tính, checkbox điều khoản tài khoản (consent ảnh nằm ở `/profile`, D-08/D-10).

### Trạng thái
| Trạng thái | Mô tả |
|---|---|
| Mặc định | Form trống; checklist ở trạng thái "chưa đạt" trung tính (xám) |
| Lỗi theo trường | Viền `danger` + lỗi dưới ô (bảng dưới); submit lỗi → focus ô lỗi đầu tiên, không gọi API |
| Loading | Nút "Đang tạo tài khoản…" + spinner, `aria-busy`, các ô `readonly`, chặn gửi trùng |
| Thành công | Chuyển ngay `/profile` (`replace`), không toast (trang Hồ sơ có banner onboarding) |
| Lỗi chung | Alert danger đầu form; giữ email; **xóa 2 ô mật khẩu** |
| 429 | Alert warning + đếm ngược nút (cùng cơ chế `login.md`) |

### Validation phía client (khớp US-01 §6, cùng bộ zod với BE — D-21)
| Trường | Điều kiện | Thông báo |
|---|---|---|
| Email | rỗng | "Vui lòng nhập email." |
| | sai định dạng | "Email không hợp lệ." |
| | > 254 ký tự | "Email quá dài." |
| Mật khẩu | độ dài ngoài 8–72 | "Mật khẩu phải từ 8 đến 72 ký tự." |
| | ký tự ngoài ASCII in được | "Mật khẩu chỉ gồm chữ không dấu, số và ký hiệu." |
| | thiếu chữ cái hoặc chữ số | "Mật khẩu phải có ít nhất 1 chữ cái và 1 chữ số." |
| | trùng email (sau chuẩn hóa) | "Mật khẩu không được trùng với email." |
| Nhập lại | rỗng / không khớp | "Mật khẩu nhập lại không khớp." |
Thứ tự hiển thị lỗi mật khẩu: một lỗi duy nhất mỗi lần, ưu tiên theo thứ tự bảng trên.

### Map mã lỗi API → hiển thị
| HTTP / mã | Vị trí | Thông báo | Hành vi |
|---|---|---|---|
| 400 `VALIDATION_ERROR` + `details[]` | Dưới ô theo `field` (`email`, `password`) | `details[].message` | Focus ô lỗi đầu tiên |
| 409 `EMAIL_ALREADY_EXISTS` | **Dưới ô Email** (lỗi trường, `role="alert"`) | "Email này đã được đăng ký. **Đăng nhập?**" (từ "Đăng nhập?" là link tới `/login`, giữ email qua `state.email` để điền sẵn — tùy chọn) | Focus ô Email; không xóa mật khẩu (chỉ xóa nếu user sửa email) |
| 429 `TOO_MANY_REQUESTS` | Alert warning đầu form | "Bạn thao tác quá nhanh, vui lòng thử lại sau." (+ đếm ngược nếu có `retryAfterSeconds`) | Khóa nút trong thời gian chờ |
| 500 / mất mạng | Alert danger | "Có lỗi xảy ra, vui lòng thử lại." / "Mất kết nối, vui lòng kiểm tra mạng và thử lại." | Giữ email, xóa mật khẩu |

### Hiệu ứng
Checklist đổi icon có transition `opacity/transform` 120ms; Alert như `/login`.

### Navigation
- Đến từ: header (guest) "Đăng ký", link ở `/login`, CTA trang giới thiệu (sau này).
- Đi tới: `/profile` (thành công, onboarding — D-16), `/login`.

### Accessibility
- Như `/login`; thêm: hint mật khẩu và checklist gắn `aria-describedby` của ô mật khẩu; trạng thái đạt/chưa đạt có chữ ẩn `sr-only` ("đã đạt"/"chưa đạt").
- Không chặn dán (paste) vào ô mật khẩu.

### Ghi chú
- Không gửi `confirmPassword` lên API; không gửi `role`.
- Lỗi email trùng chấp nhận lộ thông tin (đã chốt ở US-01 §8).
