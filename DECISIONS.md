# DECISIONS

Ghi lại các quyết định nghiệp vụ & thuật toán. Khi một quyết định thay đổi, cập nhật mục đó thay vì thêm mục mâu thuẫn.

| # | Quyết định | Lý do | Sprint |
|---|---|---|---|
| D-01 | Auth bằng JWT do backend cấp, mật khẩu hash bcrypt; không dùng Supabase Auth | Thống nhất stack ban đầu | sprint-01 |
| D-02 | Frontend chỉ gọi backend; chỉ backend truy cập Supabase (service role key) | Bảo mật, một điểm kiểm soát | sprint-01 |
| D-03 | Ảnh toàn thân & chiều cao/cân nặng lưu trong bucket private | Dữ liệu cá nhân nhạy cảm | sprint-01 |
| D-04 | Không xác thực email; không có quên/đặt lại mật khẩu ở MVP | Giảm phạm vi MVP, chưa cần dịch vụ email | sprint-01 |
| D-05 | Chỉ 1 access token JWT (HS256) hạn 7 ngày, không refresh token; lưu `localStorage`, gửi `Authorization: Bearer`; logout chỉ xóa token phía client, không thu hồi phía server | Đơn giản cho MVP | sprint-01 |
| D-06 | Mật khẩu 8–72 ký tự ASCII in được (không dấu), ≥1 chữ cái + ≥1 chữ số, không trùng email; bcrypt cost ≥ 10; khóa 5 lần sai/email/15 phút (bộ đếm in-memory) + rate limit theo IP | bcrypt chỉ dùng 72 byte đầu — chữ có dấu chiếm 2–3 byte nên chỉ cho ASCII; chống brute-force | sprint-01 |
| D-07 | Có role `user`/`admin` ngay sprint 01; admin chỉ tạo bằng seed từ env, không tự đăng ký | Chuẩn bị cho Epic 2/4 | sprint-01 |
| D-08 | Đăng ký chỉ cần email + mật khẩu; không thu thập họ tên/SĐT (để Epic 4), không thu thập giới tính/size | Tối thiểu dữ liệu cá nhân | sprint-01 |
| D-09 | `profileCompleted` = có ảnh + chiều cao + cân nặng; là điều kiện vào Phòng thử đồ (US-05) | Try-on cần ảnh mẫu | sprint-01 |
| D-10 | Consent bắt buộc trước lần tải ảnh đầu tiên (lưu thời điểm); không có chức năng rút consent/xóa tài khoản — xóa ảnh là cách dừng sử dụng | Quyền riêng tư ở mức MVP | sprint-01 |
| D-11 | Ảnh: JPG/PNG/WEBP (không HEIC), ≤10 MB, ≥512×1024 px, cạnh dài ≤8000 px, ảnh dọc tỉ lệ cao/rộng 1,3–2,5; chỉ kiểm tra kỹ thuật, không tự động kiểm tra "chuẩn toàn thân" (xem lại ở Epic 3) | Phù hợp đầu vào model try-on (~768×1024) | sprint-01 |
| D-12 | Backend xử lý ảnh: kiểm tra magic bytes, xoay theo EXIF rồi xóa EXIF, resize cạnh dài 2048 px, lưu JPEG, tên ngẫu nhiên; 1 ảnh/user, ảnh cũ xóa vĩnh viễn khi thay; trả về qua signed URL 15 phút | Bảo mật + quyền riêng tư | sprint-01 |
| D-13 | Chiều cao số nguyên 100–250 cm; cân nặng 30–250 kg, tối đa 1 chữ số thập phân; chỉ đơn vị cm/kg | Khoảng người trưởng thành | sprint-01 |
| D-14 | Admin không xem được ảnh và số đo của user | Dữ liệu nhạy cảm | sprint-01 |
| D-15 | Lưu phiên bản/thời điểm cập nhật ảnh để Epic 3 vô hiệu hóa cache try-on khi ảnh đổi | Tránh hiển thị ảnh thử đồ cũ | sprint-01 |
| D-16 | Đăng ký thành công thì tự động đăng nhập (trả JWT ngay) | Giảm bước cho user | sprint-01 |
| D-17 | Setup chung của sprint làm trên branch `chore/sprint-01-setup`, merge vào `main` sau khi user xác nhận | Không commit thẳng lên `main` | sprint-01 |
| D-18 | Frontend dùng `axios` làm API client | Cần progress khi upload ảnh | sprint-01 |
| D-19 | Migration chạy bằng script Node (`pg` + `DATABASE_URL`) theo thứ tự file `migrations/NNN_*.sql` | Supabase MCP read-only; giữ quy ước tên file | sprint-01 |
| D-20 | Không làm setup song song bước 3/4 — giữ đúng thứ tự quy trình | Theo quy trình Scrum đã thống nhất | sprint-01 |
| D-21 | Validation: zod schema viết ở cả FE và BE, test cùng một bảng case; không tạo thư mục `shared/` | Tránh phức tạp cấu hình Vite/Node | sprint-01 |
| D-22 | Consent là endpoint riêng `POST /api/profile/photo-consent` (`{accepted:true}`, idempotent); lưu thời điểm + `photo_consent_version` (hằng số BE, hiện = 1) — đổi nội dung consent thì tăng version, user phải đồng ý lại | Ghi nhận ngay khi tích; kiểm consent trước khi nhận file; tách bằng chứng đồng ý khỏi ảnh | sprint-01 |
| D-23 | Tách bảng `users` / `profiles` (1-1, `ON DELETE CASCADE`); profile rỗng tạo bằng trigger cùng transaction với user | Query auth/admin không chạm dữ liệu nhạy cảm; supabase-js không có transaction | sprint-01 |
| D-24 | `photo_version` (int, +1 mỗi lần tải/thay/xóa ảnh) + `photo_updated_at` làm khóa cache try-on; `profile_completed` là cột generated trong DB (cụ thể hóa D-09, D-15) | Một nguồn sự thật | sprint-01 |
| D-25 | Hàm SQL `set_profile_photo` đổi/xóa ảnh atomically (khóa dòng, trả path cũ). Thứ tự: upload file mới → ghi DB (lỗi thì xóa file mới) → xóa file cũ (thử lại 1 lần, lỗi thì log `ORPHAN_PHOTO`, không fail request). Chưa có script dọn file mồ côi ở sprint 01 — đưa vào backlog | Không mất dấu file khi upload đồng thời | sprint-01 |
| D-26 | Bucket `profile-photos` tạo bằng script `backend/scripts/setup-storage.js` (Storage API): private, 10 MB, chỉ `image/jpeg`, path `<userId>/<uuid>.jpg`, không policy trên `storage.objects` | Theo khuyến nghị Supabase | sprint-01 |
| D-27 | Bật RLS không policy trên `users`, `profiles`, `schema_migrations`; revoke quyền bảng + EXECUTE function với `anon`/`authenticated`; grant tường minh cho `service_role` | Chặn truy cập qua REST/`/rpc` công khai | sprint-01 |
| D-28 | API hồ sơ chỉ cho role `user`; admin → 403 | Theo D-14 | sprint-01 |
| D-29 | Response lỗi validation có `error.details` (`[{field, message}]`); lỗi 429 có `retryAfterSeconds`; mã lỗi bổ sung `IMAGE_TOO_LARGE`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE` (body JSON ≤ 10 KB) | FE hiển thị lỗi theo trường / thời gian chờ | sprint-01 |
| D-30 | Bộ đếm khóa đăng nhập tính cả email không tồn tại; lỗi validation không tính; `DUMMY_HASH` tạo một lần khi khởi động | Không lộ email đã đăng ký | sprint-01 |
| D-31 | Rate limit upload ảnh 10 request/user/giờ, đếm mọi request kể cả bị từ chối | Chống lạm dụng CPU xử lý ảnh | sprint-01 |
| D-32 | Seed admin lấy env làm nguồn chuẩn: upsert theo email, mỗi lần chạy đặt lại role admin + mật khẩu theo env; nếu email trùng user thường thì nâng thành admin và log cảnh báo | Đơn giản, có thể chạy lại | sprint-01 |
| D-33 | Admin đã đăng nhập vào `/login` hoặc `/register` → chuyển về `/admin` | Bổ sung điều hướng US-01 §4.4 | sprint-01 |
| D-34 | BE luôn trả `error.details.retryAfterSeconds` cho mọi lỗi 429; nếu thiếu, FE khóa nút 10 giây ở form auth và hiện thông báo tĩnh ở upload ảnh | FE hiển thị đếm ngược nhất quán | sprint-01 |
| D-35 | Checklist tự kiểm tra ảnh (4 ô) chỉ để nhắc, không bắt buộc tích trước khi lưu ảnh | D-11 không kiểm tra tự động | sprint-01 |
| D-36 | Có trang 404; `/login` hiện thông báo qua `location.state.notice` (`session-expired` / `signed-out`); đăng ký lỗi 409 thì điền sẵn email ở `/login` qua `state.email` | UX rõ ràng, chi phí thấp | sprint-01 |
| D-37 | Ảnh minh họa đúng/sai khi chụp dùng silhouette SVG đơn giản (user có thể thay ảnh thật sau) | Chưa có asset | sprint-01 |
| D-38 | Admin vào `/profile` được chuyển về `/admin` (không hiện trang 403) | Theo flow guard, D-28 | sprint-01 |
