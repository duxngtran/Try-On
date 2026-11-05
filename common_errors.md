# Common errors

Lỗi đã gặp và cách sửa, nhóm theo loại. Thêm mục mới vào đúng nhóm; nếu lỗi lặp lại, cập nhật mục cũ.

## Shell / môi trường Windows
- **Heredoc dài tạo nhiều file trong 1 lệnh Bash** (Git Bash/Windows) → `unexpected EOF while looking for matching '`, không file nào được tạo. **Sửa:** dùng tool Write cho từng file. (sprint-01)
- **Git cảnh báo `LF will be replaced by CRLF`** — vô hại; chưa có `.gitattributes`. (sprint-01)
- **`Set-Location` trong PowerShell làm đổi thư mục cho các lệnh sau** → lệnh tiếp theo chạy nhầm thư mục, đường dẫn tương đối báo sai (ví dụ `.env exists: False`). **Sửa:** dùng đường dẫn tuyệt đối hoặc `npm --prefix`, `git -C`. (sprint-01)
- **`git merge -F -` lỗi `could not read file '-'`:** `git merge` không đọc message từ stdin. **Sửa:** dùng nhiều cờ `-m`. (sprint-01)
- **`python -` với heredoc trong Git Bash bị treo đến timeout.** **Sửa:** không pipe stdin vào python; ghi script ra file rồi chạy. (sprint-01)

## Test (Vitest / Testing Library / Supertest)
- **Render của test trước còn trong DOM** (ví dụ 2 thẻ `h1`): Vitest không bật `globals` nên `@testing-library/react` không tự cleanup. **Sửa:** `afterEach(cleanup)` trong `frontend/src/test/setup.js`. (sprint-01)
- **Test CORS sai giả định:** package `cors` với `origin` là chuỗi luôn trả `Access-Control-Allow-Origin` = origin cấu hình, kể cả request từ origin lạ (trình duyệt mới là bên chặn). **Sửa:** test so sánh header với origin cấu hình, không kỳ vọng `undefined`. (sprint-01)

- **`useAuth` throw khi test render ngoài `AuthProvider`.** Throw là hành vi đúng. **Sửa:** render test trong provider (`frontend/src/test/renderApp.jsx`), không nới lỏng hook. (sprint-01)

- **Mock trả dữ liệu "sạch" hơn DB thật nên unit test không bắt được lỗi:** Postgres trả `timestamptz` dạng `...893014+00:00`, contract cần `...893Z`. **Sửa:** chuẩn hóa bằng `new Date(value).toISOString()`, thêm test với chuỗi kiểu Postgres. (sprint-01)
- **Fixture WEBP động có các khung giống hệt nhau bị encoder gộp thành ảnh tĩnh,** nên test không kiểm được gì. **Sửa:** dùng các khung khác màu, truyền `loop`/`delay` cho `.webp()`. (sprint-01)
- **Script kiểm tra thật bị 429 ngoài dự kiến:** rate limit upload đếm cả request bị từ chối (D-31). **Sửa:** tính đủ mọi request, dùng user mới nếu vượt 10/giờ. (sprint-01)

- **`setTimeout` với delay lớn hơn 2^31−1 ms chạy ngay lập tức,** làm tải lại liên tục khi tính delay từ `expiresAt` xa. **Sửa:** chặn trần delay. (sprint-01)

- **Test "file đã xóa" fail ngẫu nhiên (nhận 200 dù bucket đã 0 file):** Supabase vẫn phục vụ signed URL cũ khoảng 44 giây ở một số lần xóa (D-39). **Sửa:** poll tối đa 90 giây rồi mới assert 4xx. Đo nhiều lượt trước khi kết luận: 1 lượt không đủ để thấy lỗi ngẫu nhiên. (sprint-01)
- **Lọc output test chỉ còn tên assertion rồi suy đoán mã trạng thái.** **Sửa:** đọc dòng `expected ... to be ...` trước khi kết luận. (sprint-01)
- **`npx playwright install chromium` treo trên máy này.** **Sửa:** đặt `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, dùng Chrome đã cài qua `channel: 'chrome'`. (sprint-01)

## Backend / API
- **429 chỉ có `retryAfterSeconds` trong body, thiếu header `Retry-After`.** **Sửa:** đặt header ở error handler chung. (sprint-01)

## Supabase / kết nối DB
- **`getaddrinfo ENOTFOUND db.<ref>.supabase.co`:** host direct chỉ có IPv6, máy không có IPv6. **Sửa:** dùng Session pooler `aws-0-<region>.pooler.supabase.com:5432`, user `postgres.<ref>`; không dùng cổng 6543 cho migrate. (sprint-01)

## Frontend / điều hướng
- **Handler 401 và route guard cùng gọi `navigate`** → ghi đè `location.state`, mất thông báo hết phiên. **Sửa:** provider chỉ xóa phiên và đặt `notice`, để guard điều hướng. (sprint-01)

## Lint (ESLint)
- **`no-unused-vars` khi destructure để bỏ field** (`const { X: _omit, ...rest } = obj`). **Sửa:** copy object rồi `delete copy.X`. `eslint-disable` thừa cũng bị báo warning. (sprint-01)

## MCP / công cụ thiết kế (Stitch)
- **`update_design_system` luôn lỗi `Request contains an invalid argument`.** **Sửa:** tạo design system mới (`create_design_system`) thay vì sửa; xóa bản cũ thủ công trên stitch.withgoogle.com. (sprint-01)
- **`generate_screen_from_text` timeout với màn phức tạp; `list_screens` trả rỗng** kể cả sau khi sinh thành công. **Sửa:** không phụ thuộc mockup Stitch — file `.md` trong `sprint-xx/screens/` là nguồn chuẩn. (sprint-01)
- **Stitch tự thêm tính năng ngoài phạm vi** (Quên mật khẩu, đăng nhập Google/Apple). **Sửa:** đối chiếu với DECISIONS.md, ghi chú bỏ. (sprint-01)

## UI / font
- **Font không có glyph tiếng Việt** (Bodoni Moda). **Sửa:** chỉ chọn font có subset `vietnamese` (đang dùng Playfair Display + Manrope). (sprint-01)
