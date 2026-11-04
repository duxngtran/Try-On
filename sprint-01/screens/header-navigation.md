# Screen Descriptions — Header, điều hướng & route guard

> US-01 §4.3, §4.4, AC-08, AC-09, AC-10, AC-11 · Flows: `post-login-navigation.md`, `session-restore.md`, `logout.md`, `auth-middleware.md` · D-05, D-14, D-33

Tài liệu này mô tả **layout chung** (header + vùng nội dung) và **các màn hệ thống** do guard sinh ra: màn chờ phiên, lỗi kết nối, 403, 404.

## Layout chung (AppLayout)

### Mục đích
Khung bao quanh mọi trang trừ `/login`, `/register` (hai trang này dùng header tối giản: chỉ logo giữa, xem screen tương ứng).

### Quyền truy cập
Public (nội dung header đổi theo trạng thái phiên).

### Các thành phần chính
1. **Skip link** "Bỏ qua điều hướng" (phần tử Tab đầu tiên, chỉ hiện khi focus, nhảy tới `main#main`).
2. **Header sticky** (56px mobile / 64px lg, nền `canvas`, viền dưới `line`, thêm shadow nhẹ khi cuộn > 0).
   - **Trái**: logo "Try-on" (Playfair 600) là link `/` (`aria-label="Try-on — Trang chủ"`). Admin: link tới `/admin`.
   - **Phải theo trạng thái** (bảng dưới).
3. **`main#main`** (`tabIndex=-1`): nội dung trang; sau mỗi chuyển route, focus chuyển vào `h1` hoặc `main` và cập nhật `document.title` ("Hồ sơ — Try-on").
4. **Footer** đơn giản (desktop và mobile): "© Try-on" + (sau này) liên kết điều khoản; không quan trọng ở sprint 01.

### Header theo trạng thái phiên
| Trạng thái | Mobile (< 640px) | Tablet/Desktop (≥ 640px) |
|---|---|---|
| **Đang khôi phục phiên** (`loading`) | Chỉ logo; bên phải skeleton tròn 32px | Logo + skeleton 2 mục nav |
| **Khách** (guest) | Nút "Đăng nhập" (ghost, chữ `small`, cao 44px) + "Đăng ký" (primary `sm`→ cao 44px mobile) | Giống mobile, kích thước nút `md`; mục đang ở (`/login` hoặc `/register`) có `aria-current="page"` |
| **User** (`role=user`) | Logo + **avatar button** (vòng tròn 44px, chữ cái đầu email; chấm `warning` 8px ở góc nếu `profileCompleted=false`, kèm `sr-only` "Hồ sơ chưa đầy đủ") mở **dropdown/sheet**: dòng email (cắt `…`, `small` `ink-muted`) · "Trang chủ" · "Hồ sơ" (kèm badge "Còn thiếu" nếu chưa đủ) · đường kẻ · "Đăng xuất" | Nav ngang giữa/phải: "Trang chủ", "Hồ sơ" (chấm cảnh báo nếu chưa đủ); ngoài cùng phải avatar menu (email + "Đăng xuất") |
| **Admin** | Logo + avatar menu: email · "Quản trị" · "Đăng xuất" (không có Hồ sơ/Trang chủ user) | Nav: "Quản trị"; avatar menu như trên. Badge `caption` "ADMIN" cạnh avatar |
| **Lỗi khôi phục phiên** | Header như guest tối giản (chỉ logo) vì nội dung hiển thị màn lỗi kết nối | như vậy |

Dropdown/avatar menu: `button aria-haspopup="menu" aria-expanded`; `role="menu"`/`menuitem`; Mũi tên ↑↓ di chuyển, Esc đóng và trả focus, click ngoài đóng; mobile hiển thị dạng bottom sheet với scrim; mỗi mục cao ≥ 48px. Animation 120ms fade+translateY 4px (tắt khi reduced-motion).

### Đăng xuất (AC-09)
- Bấm "Đăng xuất": **không** hỏi xác nhận, không gọi API (D-05). Xóa token + state user (và cache hồ sơ), chuyển `/login` bằng `replace` (Back không xem lại được trang cần đăng nhập), kèm `state.notice = "signed-out"` (Alert info "Bạn đã đăng xuất." tại `/login`). Focus về `h1` trang Đăng nhập.
- Đa tab: đăng xuất ở tab này, tab khác lắng nghe sự kiện `storage` (khóa token bị xóa) → cũng chuyển `/login`.

### Responsive
- Mobile: header gọn như trên, nav ẩn trong avatar menu.
- Tablet/Desktop: nav ngang hiển thị; container `max-w-6xl`, padding ngang 24/32px.

## Màn hệ thống do guard sinh ra

### 1. Màn chờ khôi phục phiên (`status = loading`) — mọi route
- Toàn trang `canvas`, giữa màn: logo "Try-on" (display) + spinner 24px + "Đang tải…" (`small`, `role="status"`). **Không** hiển thị nội dung trang hay form (tránh nháy form đăng nhập rồi chuyển).
- Chỉ hiển thị nếu có token trong `localStorage` (gọi `GET /api/auth/me`); không có token → `guest` ngay, không chờ.
- Nếu chờ > 300ms mới hiện (tránh nháy); animation fade-in 200ms.

### 2. Lỗi khôi phục phiên (`status = error`: mạng/500, **không** phải 401)
- Giữ token (không xóa). Màn lỗi: icon `WifiOff` 40px, H1 `title` "Không thể kết nối", mô tả "Vui lòng kiểm tra mạng và thử lại." + nút primary "Thử lại" (gọi lại `/me`, loading "Đang thử lại…") + link phụ "Đăng nhập lại" (xóa token, `/login`).
- 401 từ `/me` (`UNAUTHORIZED`/`TOKEN_EXPIRED`) → xóa token, chuyển `/login` với notice hết phiên **chỉ nếu** user đang ở route cần đăng nhập (route public không hiện notice).

### 3. 403 — "Bạn không có quyền truy cập." (user vào `/admin`)
- Trong AppLayout. Icon `ShieldAlert`, H1 "Bạn không có quyền truy cập.", mô tả "Trang này chỉ dành cho quản trị viên.", nút primary "Về trang chủ" (→ `/`). `document.title` "Không có quyền — Try-on".

### 4. 404 — route không tồn tại (bổ sung, ngoài flow; xem câu hỏi mở)
- Icon `SearchX`, H1 "Không tìm thấy trang", mô tả "Đường dẫn này không tồn tại hoặc đã được di chuyển.", nút "Về trang chủ" (guest → `/login`, user → `/`, admin → `/admin`).

### Bảng guard → hành vi hiển thị
| Route | Guest | User | Admin |
|---|---|---|---|
| `/login`, `/register` (GuestOnly) | Hiển thị | → `/` | → `/admin` (D-33) |
| `/` | → `/login` (`state.from="/"`) | Trang chủ | → `/admin` |
| `/profile` | → `/login` (`state.from="/profile"`) | Hồ sơ | → `/admin` |
| `/admin` | → `/login` (`state.from="/admin"`) | **403** | Admin placeholder |
| Khác | 404 | 404 | 404 |
Đích sau đăng nhập: xem `post-login-navigation.md` (`isSafeInternalPath`, kiểm "hợp vai").

### Navigation
- Đến từ: mọi trang.
- Đi tới: theo bảng trên.

### Accessibility
- `<header>` chứa `<nav aria-label="Điều hướng chính">`; mục hiện tại `aria-current="page"`.
- Avatar button có `aria-label="Tài khoản"`; chấm cảnh báo có text `sr-only`.
- Mỗi trang đặt `<title>` riêng; thông báo chuyển trang cho trình đọc màn hình bằng vùng `aria-live` ẩn ("Hồ sơ — Try-on") hoặc focus vào `h1`.
- Màn lỗi/403/404 có `h1` và focus tự vào `h1`.

### Ghi chú
- Màn chờ chỉ hiển thị toàn trang cho **lần tải đầu**; điều hướng nội bộ khi phiên đã biết không hiện lại.
- `401` ở bất kỳ API nào (trừ `INVALID_CREDENTIALS`) → API client xóa token và chuyển `/login` với `state.notice="session-expired"` và `state.from` = đường dẫn hiện tại (AC-08).
