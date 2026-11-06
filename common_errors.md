# Common errors

Lỗi đã gặp và cách sửa, nhóm theo loại. Thêm mục mới vào đúng nhóm; nếu lỗi lặp lại, cập nhật mục cũ.

## Shell / môi trường Windows
- **Heredoc dài tạo nhiều file trong 1 lệnh Bash** (Git Bash/Windows) → `unexpected EOF while looking for matching '`, không file nào được tạo. **Sửa:** dùng tool Write cho từng file. (sprint-01)
- **Git cảnh báo `LF will be replaced by CRLF`** — vô hại; chưa có `.gitattributes`. (sprint-01)
- **`Set-Location` trong PowerShell làm đổi thư mục cho các lệnh sau** → lệnh tiếp theo chạy nhầm thư mục, đường dẫn tương đối báo sai (ví dụ `.env exists: False`). **Sửa:** dùng đường dẫn tuyệt đối hoặc `npm --prefix`, `git -C`. (sprint-01)
- **`git merge -F -` lỗi `could not read file '-'`:** `git merge` không đọc message từ stdin. **Sửa:** dùng nhiều cờ `-m`. (sprint-01)
- **`python -` với heredoc trong Git Bash bị treo đến timeout.** **Sửa:** không pipe stdin vào python; ghi script ra file rồi chạy. (sprint-01)
- **`TaskStop` không giết tiến trình `node` con,** chạy lại script bị chồng chéo và để lại dữ liệu test. **Sửa:** kiểm `Get-CimInstance Win32_Process` khi dừng; script live phải tự dọn theo tiền tố ở đầu mỗi lần chạy. (sprint-03)
- **Heredoc Bash trong template literal làm mất backtick và backslash.** **Sửa:** dùng Edit hoặc Write thay vì `node -e` với chuỗi nhiều lớp escape. (sprint-03)
- **`format:check` báo lỗi vì `backend/.claude/settings.local.json` (file local).** **Sửa:** thêm `.claude` vào `.prettierignore`. (sprint-03)

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

- **Mock server trả danh sách tĩnh khi UI tải lại sau thao tác ghi:** lần tải lại ngầm ghi đè cập nhật cục bộ, test thấy dòng cũ. **Sửa:** mock giữ trạng thái, POST/PATCH/DELETE đổi danh sách mà GET trả. (sprint-02)
- **Test race luôn ra một kết quả nên không thử được nhánh còn lại:** tạo sản phẩm song song xóa danh mục ở mức service cho 30/30 xóa thắng vì xử lý ảnh chậm. **Sửa:** tải ảnh trước, chạy RPC song song với độ lệch ngẫu nhiên, kiểm cả hai nhánh đều xuất hiện. (sprint-02)
- **Ảnh chụp e2e cũ hơn commit sửa cuối:** T-59 chụp lúc 17:55, sửa nhãn tab lúc 18:01. **Sửa:** so thời gian ảnh với commit và chạy lại e2e sau khi sửa UI. (sprint-02)
- **`getByRole` báo nhiều phần tử khi cùng một link xuất hiện 2 lần** (`AdminNav` + link quay lại). **Sửa:** thu hẹp phạm vi tìm. jsdom báo "Not implemented: scrollTo": stub `window.scrollTo` trong `test/setup.js`. (sprint-02)

- **Playwright coi `aria-disabled="true"` là không bấm được,** `click()` treo 30 giây. **Sửa:** dùng `click({ force: true })` khi cố ý bấm nút khóa mềm. (sprint-03)
- **Hai đoạn trong cùng script Postman cùng khai báo `const s`** gây `SyntaxError` lúc chạy. **Sửa:** đổi tên hoặc bọc trong block. (sprint-03)
- **Test hook với fake timer:** effect đặt timer chỉ chạy sau khi React flush. **Sửa:** `advance(0)` trước rồi mới tiến đồng hồ. (sprint-03)
- **Lưới một cột thiếu `grid-cols-1`, con cuộn ngang làm rộng trang** khoảng 1040 px ở 360 px; chỉ lộ ở trình duyệt thật. **Sửa:** thêm `grid-cols-1`, kiểm tràn ngang bằng trình duyệt. (sprint-03)

- **Playwright `isDisabled()` trả `true` với `aria-disabled`;** phải kiểm `el.disabled` qua `evaluate`. `waitFor` visible không tính `opacity: 0`, nên ảnh đang mờ vẫn coi là hiện. (sprint-03)
- **Updater của `setState` chạy sau `finally`,** nên không được đọc ref cờ bên trong updater. (sprint-03)

- **Test FE chỉ đạt khi máy rảnh:** agent báo 493/493, chạy song song với việc khác thì 4–11 test fail. Gồm: so khớp đúng danh sách request ngay sau khi trang hiện (`GET /cart` chưa kịp gửi), chụp `calls.length` trước khi request tải xong, `toHaveFocus` ngay sau `findBy`, và kiểm "0 POST job" trong khi phòng tự POST (D-136). **Sửa:** dùng `waitFor`, đợi dấu hiệu đã tải xong rồi mới đo; chạy nhiều lượt song song trước khi merge. (sprint-04)
- **Cú bấm đầu bị bỏ qua:** ref cập nhật trong `useEffect`, nút đã hiện nhưng handler đọc state cũ. **Sửa:** cập nhật ref trong `useLayoutEffect` (D-168). (sprint-04)
- **Lọc output newman qua pipe rồi đọc exit code:** chỉ thấy vài collection cuối, exit code là của pipeline. **Sửa:** ghi toàn bộ ra file, lấy `$?` của chính lệnh, đọc đủ dòng `assertions`. (sprint-04)
- **Báo cáo chỉ nêu lượt e2e cuối cùng:** 139/139 che việc các lượt trước fail chập chờn. **Sửa:** đọc log mọi lượt; tra DB để xác nhận 404 thuộc sản phẩm vừa bị xóa trong kịch bản, không nới bộ lọc mù. (sprint-04)

## Backend / API
- **429 chỉ có `retryAfterSeconds` trong body, thiếu header `Retry-After`.** **Sửa:** đặt header ở error handler chung. (sprint-01)
- **`page` vượt tổng số dòng làm PostgREST trả 416 (PGRST103) và API thành 500;** repository giả không bắt được, chỉ Postman trên DB thật lộ ra. **Sửa:** bắt PGRST103 rồi đếm riêng; kiểm biên "page vượt quá" trên DB thật. (sprint-02)

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

## Quyền / phiên chạy song song
- **Bash trong worktree từ chối lệnh phức tạp** (`node -e` dài, heredoc kèm chạy file): "too complex to verify it stays inside the worktree". **Sửa:** dùng Edit/Write cho từng file, mỗi lệnh Bash đơn giản. (sprint-02)
- **Phiên nền chạy `git merge` bị bộ kiểm soát quyền từ chối ("Merge Without Review")** dù user đã đồng ý trong chat. **Sửa:** không nhờ phiên khác merge thay; báo user và để user gọi trực tiếp `/merge`. (sprint-01)

## UI / font
- **Font không có glyph tiếng Việt** (Bodoni Moda). **Sửa:** chỉ chọn font có subset `vietnamese` (đang dùng Playfair Display + Manrope). (sprint-01)
