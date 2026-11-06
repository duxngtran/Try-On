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
| D-10 | Consent bắt buộc trước lần tải ảnh đầu tiên (lưu thời điểm). Sprint-03 thêm consent riêng cho việc gửi ảnh tới dịch vụ AI, có nút rút (D-93). Chưa có chức năng xóa tài khoản | Quyền riêng tư ở mức MVP; consent cũ không nêu đủ bên nhận và thời gian lưu | sprint-01, sửa ở sprint-03 |
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
| D-39 | Sau khi xóa hoặc thay ảnh, signed URL cũ có thể còn mở được trong thời gian ngắn do Supabase phục vụ từ cache dù file đã mất khỏi bucket. Chấp nhận cho MVP. Đo trên Supabase dev (2026-11-05, 6 lượt): 3 lượt còn mở khoảng 44 giây, 3 lượt bị từ chối ngay. Test API kiểm tra link phải bị từ chối trong tối đa 90 giây, không kiểm tra ngay lập tức | Chỉ người đã có link mới mở được; thời gian ngắn hơn nhiều so với TTL 15 phút; user đồng ý | sprint-01 |
| D-40 | Nguồn chuẩn của API test là `backend/tests/postman/` (collection + `npm run test:postman`), không phải Postman cloud; folder `Auth` trên cloud giữ nguyên, folder `Profile` trên cloud để trống, cần thì import thủ công | Postman MCP không chạy được collection và không gắn được file vào request form-data; user đồng ý | sprint-01 |
| D-41 | Không xóa được danh mục còn sản phẩm chưa xóa: trả 409 `CATEGORY_HAS_PRODUCTS` kèm số lượng; kiểm bằng hàm SQL có khóa dòng | Tránh sản phẩm mồ côi hoặc xóa dây chuyền ngoài ý muốn; user ủy quyền duyệt | sprint-02 |
| D-42 | Xóa mềm cả danh mục và sản phẩm (`deleted_at`), giữ file ảnh, không có chức năng khôi phục | An toàn cho giỏ hàng, đơn hàng, cache try-on; lỡ tay còn cứu được bằng SQL; user ủy quyền duyệt | sprint-02 |
| D-43 | Seed 3 danh mục (Áo thun, Váy, Quần Jeans) trong migration 003, chỉ chạy một lần; xóa rồi không tự xuất hiện lại | Đúng PB, không cần script riêng; user ủy quyền duyệt | sprint-02 |
| D-44 | Danh mục theo thời điểm tạo cũ → mới; sản phẩm mới nhất trước; `id` làm tiêu chí phụ | US-05 cần "sản phẩm đầu tiên" xác định được; không thêm cột; user ủy quyền duyệt | sprint-02 |
| D-45 | Chưa thêm loại trang phục (áo/quần/váy liền) cho danh mục. Xem lại khi chọn model ở Epic 3 | PB không yêu cầu, chưa chọn model; user ủy quyền duyệt | sprint-02 |
| D-46 | Ảnh sản phẩm ở bucket **public** `product-images`, `cacheControl` 7 ngày, chỉ backend ghi; DB chỉ lưu đường dẫn. Yêu cầu private ở D-03/D-14 vẫn giữ cho ảnh người dùng | Không phải dữ liệu cá nhân, CDN tốt, dịch vụ GenAI đọc được URL; user ủy quyền duyệt | sprint-02 |
| D-47 | Giá là số nguyên VND, 1.000 – 100.000.000; `199.5` là lỗi, không tự diễn giải | VND không có phần lẻ; tránh nhập nhầm giá; user ủy quyền duyệt | sprint-02 |
| D-48 | Ảnh flat lay: JPG/PNG/WEBP ≤ 10 MB, cạnh ngắn ≥ 512, cạnh dài ≤ 8000, tỉ lệ ≤ 3; đầu ra JPEG q90 4:4:4, 2048 px, nền trắng, sRGB, không metadata; không tự kiểm tra có đúng flat lay. Xem lại khi chọn model ở Epic 3 | Quần jeans dài, áo gần vuông; giữ chi tiết họa tiết; user ủy quyền duyệt | sprint-02 |
| D-49 | Thay ảnh: tăng `image_version`, xóa file cũ theo thứ tự upload → ghi DB → xóa cũ; đổi tên, giá, danh mục không tăng version | Giống D-24, D-25; khóa cache `userId + photoVersion + productId + imageVersion`; user ủy quyền duyệt | sprint-02 |
| D-50 | Thêm và sửa sản phẩm dùng một request multipart, ghi nguyên tử qua hàm SQL | Không có trạng thái lưu một phần; user ủy quyền duyệt | sprint-02 |
| D-51 | Rate limit 120 thêm/sửa / admin / giờ, đếm cả request bị từ chối; `DELETE` không tính | Bảo vệ CPU xử lý ảnh, theo cách đếm của D-31; user ủy quyền duyệt | sprint-02 |
| D-52 | Không có tồn kho, size, màu, mô tả. Epic 4 sẽ không chọn được size khi thêm vào giỏ nếu không đổi quyết định này | PB chỉ nêu tên, giá, loại, ảnh; user chốt (2026-11-05) | sprint-02 |
| D-53 | Sprint này chỉ có API admin; API cho người mua thuộc Epic 3 | Chỉ thiết kế thứ sprint cần; user ủy quyền duyệt | sprint-02 |
| D-54 | Tên danh mục 2–50 ký tự, chuẩn hóa NFC, không trùng khi bỏ qua hoa thường, tên đã xóa dùng lại được; tên sản phẩm 2–120 ký tự, được trùng | Tránh danh mục trùng; sản phẩm khác màu có thể cùng tên; user ủy quyền duyệt | sprint-02 |
| D-55 | Sửa cùng lúc: ghi sau đè ghi trước | Chỉ có 1 tài khoản admin (D-32); user ủy quyền duyệt | sprint-02 |
| D-56 | `AdminLayout` + `AdminNav` dùng chung cho `/admin/*`: sidebar từ 1024px, tab ngang dưới đó; provider Toast đặt ở layout | Thông báo "Đã thêm sản phẩm" phải sống qua chuyển trang; thêm mục dễ ở Epic 4; user cho chạy tiếp, chưa xem riêng | sprint-02 |
| D-57 | Form sản phẩm không có nút "Hủy tải" ảnh | Thêm/sửa là một request ghi nguyên tử (D-50); hủy giữa chừng không biết server đã ghi chưa, có thể tạo sản phẩm trùng; user cho chạy tiếp, chưa xem riêng | sprint-02 |
| D-58 | Trang Danh mục ẩn nút "Thêm danh mục" khi tải danh sách lỗi | Không biết danh sách hiện tại thì không cảnh báo trùng tên được; user cho chạy tiếp, chưa xem riêng | sprint-02 |
| D-59 | Thêm và đổi tên danh mục dùng `Modal`. Xóa có hai chế độ: xác nhận (0 sản phẩm) và chặn (≥ 1 sản phẩm, không gọi API xóa, có link "Xem sản phẩm"); 409 `CATEGORY_HAS_PRODUCTS` hiện cùng giao diện chặn | Tái sử dụng `Modal`, mobile thành bottom sheet; user cho chạy tiếp, chưa xem riêng | sprint-02 |
| D-60 | Chuyển `main.jsx` sang data router (`createBrowserRouter`) để dùng `useBlocker` cảnh báo rời form chưa lưu | `BrowserRouter` không chặn được click `AdminNav` hay nút Back; user cho chạy tiếp, chưa xem riêng | sprint-02 |
| D-61 | Danh sách sản phẩm chỉ lọc theo danh mục và phân trang (limit 20), trạng thái nằm trên URL; đổi lọc về trang 1; trang rỗng sau khi xóa thì lùi về trang cuối; link Sửa mang `state.from` | Giữ được bộ lọc khi quay lại; user cho chạy tiếp, chưa xem riêng | sprint-02 |
| D-62 | Trong US-03, mục "Sản phẩm" ở `AdminNav` và card `/admin` để "Sắp ra mắt"; số sản phẩm chưa có link; hộp thoại chặn xóa chưa có nút "Xem sản phẩm". T-55 của US-04 bật lại cả 3 chỗ | `/admin/products` chưa tồn tại; agent-coder chọn, user cho phép merge khi test đạt | sprint-02 |
| D-63 | `PATCH` danh mục lấy `productCount` bằng truy vấn đếm riêng, 2 query cho mỗi lần đổi tên | Đổi tên là thao tác hiếm; agent-coder chọn, user cho phép merge khi test đạt | sprint-02 |
| D-64 | FE cập nhật danh sách từ response của API ghi rồi tải lại ngầm; tải lại lỗi thì giữ danh sách cũ, hiện Alert "Chưa cập nhật được danh sách." kèm nút "Tải lại". Dòng bị xóa biến mất ngay, không có fade-out 200ms | Alert dùng chung cho cả tải lại sau 409/404; agent-coder chọn, user cho phép merge khi test đạt | sprint-02 |
| D-65 | `GET /api/admin/products` với `page` vượt tổng số trang trả `items: []` và `total` thật, không lỗi. Repository bắt PGRST103 (416 của PostgREST) rồi đếm riêng | Theo `design/api.md` mục 5.1; agent-coder chọn, user cho phép merge khi test đạt | sprint-02 |
| D-66 | Data router dùng một route splat `*` bọc `AuthProvider` + `AppRoutes`; các route vẫn khai báo bằng `<Routes>` bên trong | Giữ nguyên guard và thông báo US-01, US-02; test cũ pass không phải sửa; agent-coder chọn, user cho phép merge khi test đạt | sprint-02 |
| D-67 | Lưu thành công hoặc 404 thì tự điều hướng và bỏ qua cảnh báo rời trang. Chế độ thêm: danh mục chọn sẵn từ bộ lọc không tính là "có thay đổi" | Không cảnh báo sai khi không có gì để mất; agent-coder chọn, user cho phép merge khi test đạt | sprint-02 |
| D-68 | Ngưỡng ảnh sản phẩm: cạnh ngắn ≥ 512 (không bắt buộc 512 × 512), cạnh dài/cạnh ngắn ≤ 3 so sánh bằng số nguyên; ảnh hồ sơ giữ JPEG q85; message riêng cho sản phẩm, mã lỗi dùng chung | Làm rõ D-48, không đổi hành vi ảnh hồ sơ; agent-coder chọn, user cho phép merge khi test đạt | sprint-02 |
| D-69 | Dòng bị xóa ở danh sách sản phẩm bỏ ngay khỏi UI rồi tải lại ngầm; xóa xong tải lại cả danh mục để số đếm đúng | Nhất quán với D-64; agent-coder chọn, user cho phép merge khi test đạt | sprint-02 |
| D-70 | Giữ icon `Boxes` cho "Sản phẩm" ở `AdminNav` và card `/admin` (screens ghi `Shirt` cho card) | Nhất quán giữa nav và card; agent-coder chọn, user cho phép merge khi test đạt | sprint-02 |
| D-71 | Điều kiện sinh ảnh = `profileCompleted` + consent gửi ảnh hiệu lực, kiểm ở mỗi lần tạo job | D-09 chưa nói tới consent; user duyệt | sprint-03 |
| D-72 | Không tự chọn danh mục đầu tiên khi vào phòng | PB nói "khi tôi chọn"; tránh tốn lượt; user duyệt | sprint-03 |
| D-73 | Ẩn danh mục không có sản phẩm, vẫn có trạng thái rỗng nếu trống giữa chừng | Không dẫn người mua vào ngõ cụt; user duyệt | sprint-03 |
| D-74 | "Ngay" nghĩa là: ảnh cache ≤ 1 giây; ảnh chưa có phản hồi ≤ 200 ms kèm ảnh trải phẳng; nhắc ở 15 giây; báo lỗi ở 60 giây. Ngưỡng là ước lượng, chưa đo | PB mâu thuẫn với độ trễ GenAI; user duyệt | sprint-03 |
| D-75 | Job bất đồng bộ, mỗi khóa cache tối đa 1 job đang chạy | Tránh sinh trùng, không giữ request HTTP lâu; user duyệt | sprint-03 |
| D-76 | Tự thử lại 1 lần với lỗi tạm thời; không thử lại lỗi an toàn, tư thế, đầu vào; ghi nhớ kết quả bị chặn theo khóa | Không tốn tiền vào yêu cầu chắc chắn lỗi; user duyệt | sprint-03 |
| D-77 | Tính lượt khi sinh thành công, giữ chỗ lúc đang chạy | Công bằng, không vượt ngân sách khi song song; user duyệt | sprint-03 |
| D-78 | Bucket private riêng cho ảnh try-on, signed URL 15 phút, JPEG không metadata | Theo D-03, D-12; user duyệt | sprint-03 |
| D-79 | Thay/xóa ảnh hồ sơ hoặc rút consent: xóa thật mọi ảnh try-on, không sinh lại hàng loạt; kết quả về muộn bị bỏ | Ảnh cũ không dùng lại vì version chỉ tăng; kiểm soát chi phí; user duyệt | sprint-03 |
| D-80 | Thay ảnh hoặc xóa mềm sản phẩm: xóa ảnh try-on liên quan, giữ dòng và ảnh gốc | Tối thiểu dữ liệu nhạy cảm; user duyệt | sprint-03 |
| D-81 | Xóa ảnh try-on sau 90 ngày không được xem. Ngưỡng là ước lượng | Không giữ dữ liệu nhạy cảm vô thời hạn; user duyệt | sprint-03 |
| D-82 | Không gửi số đo, email, `userId` cho dịch vụ AI; bản tạm chỉ nằm trong bộ nhớ | Tối thiểu dữ liệu; user duyệt | sprint-03 |
| D-83 | Nhãn "Ảnh do AI tạo, chỉ để tham khảo, không thể hiện độ vừa vặn" | Tránh hiểu nhầm; model không nhận số đo; user duyệt | sprint-03 |
| D-84 | Có nút quay lại, không vòng danh sách | Rõ đầu và cuối danh sách; user duyệt | sprint-03 |
| D-85 | Generate trước đúng 1 sản phẩm, sau khi ảnh hiện tại sẵn sàng và dừng ≥ 1 giây; dừng generate trước khi còn ≤ 3 lượt. Ngưỡng là ước lượng | Cân bằng độ trễ và chi phí; user duyệt | sprint-03 |
| D-86 | Chờ dừng 400 ms mới tạo job; job đã gửi coi như không hủy được, kết quả vẫn lưu và tính lượt. Ngưỡng là ước lượng; chưa thấy API hủy của FASHN | Không tốn lượt khi vuốt nhanh; user duyệt | sprint-03 |
| D-87 | Sản phẩm bị xóa giữa chừng: báo và có nút chuyển tiếp, không tự chuyển, không tự sinh | Tránh tốn lượt ngoài ý muốn; user duyệt | sprint-03 |
| D-88 | Rate limit 30 yêu cầu tạo job/người/phút, tách khỏi đọc trạng thái. Ngưỡng là ước lượng | Chống spam, không chặn nhầm lúc theo dõi job; user duyệt | sprint-03 |
| D-89 | Đổi model thì xóa cache bằng lệnh, không đổi khóa D-49 | Giữ đúng khóa đã chốt; user duyệt | sprint-03 |
| D-90 | Tối đa 2 job/người mua, job hiển thị ưu tiên hơn generate trước | Kiểm soát chi phí, ưu tiên ảnh đang xem; user duyệt | sprint-03 |
| D-91 | Dùng FASHN Try-On v1.6 ($0.075/ảnh theo công bố) qua lớp adapter đổi được; chốt tạm cho tới khi pilot 10–20 ảnh. Giá và độ trễ chưa tự đo | Hỗ trợ flat lay, lỗi không trừ credit. Pilot gửi ảnh người thật nên cần user cho phép riêng; user duyệt theo khuyến nghị (Q1) | sprint-03 |
| D-92 | Giữ D-45 và D-52, dùng `category: auto`. Nếu nhận sai trên 10% mẫu pilot thì thêm trường tùy chọn ở sản phẩm | User duyệt theo khuyến nghị (Q2) | sprint-03 |
| D-93 | Consent riêng ở phòng thử đồ cho việc gửi ảnh tới dịch vụ AI, gồm tự khai đủ 18 tuổi và nút rút. Ảnh có consent cũ giữ nguyên nhưng không gửi đi tới khi đồng ý bản mới. Rút consent thì xóa ảnh try-on, giữ ảnh hồ sơ | Consent cũ thiếu bên nhận, xử lý ở nước ngoài, thời gian lưu, ảnh kết quả, tuổi; user duyệt theo khuyến nghị (Q3) | sprint-03 |
| D-94 | Giới hạn 20 ảnh/ngày, 100 ảnh/tháng mỗi người; ngân sách $50/tháng toàn hệ thống, cảnh báo ở 80%, dừng cứng ở 100%. Ảnh đã cache vẫn xem được khi hết lượt | Tối đa $7.50/người/tháng theo giá công bố; user duyệt theo khuyến nghị (Q4) | sprint-03 |
| D-95 | Giữ D-09 (số đo là điều kiện vào phòng) trong sprint này, xem lại ở Epic 4 dù model không dùng số đo | User duyệt theo khuyến nghị (Q5) | sprint-03 |
| D-96 | Giả định chưa ra mắt thật. Trước khi ra mắt phải có người chuyên môn pháp lý xem, gồm hồ sơ đánh giá tác động theo Luật 91/2025/QH15 Điều 20 (chưa đối chiếu văn bản gốc) | User chưa trả lời; chọn phương án không kích hoạt nghĩa vụ chuyển dữ liệu thật | sprint-03 |
| D-97 | D-90 nghĩa là tối đa 2 job đang gửi; tổng job đang hoạt động mỗi người tối đa 4, vượt thì 429 kèm thử lại sau 5 giây | Vừa giới hạn chi phí vừa cho hàng đợi ngắn; agent-ba đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-98 | Quá 120 giây sau khi gửi, chết giữa lúc gửi, `POST` hết giờ hoặc lưu lỗi: không tính lượt nhưng có tính ngân sách | Dừng cứng ngân sách không bị lọt, người mua không mất lượt oan; agent-ba đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-99 | Hàng đợi job nằm trên Postgres, worker chạy trong tiến trình Express, không thêm Redis | Đủ cho MVP một instance, không thêm hạ tầng; agent-ba đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-100 | Xóa file try-on qua hàng đợi, thử lại tới khi được (chặt hơn D-25) | Ảnh try-on là dữ liệu nhạy cảm, không được bỏ sót; agent-ba đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-101 | Hủy hiệu lực ảnh try-on bằng trigger DB | Chạy cùng transaction, không phải đổi `set_profile_photo` và `update_product`; agent-ba đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-102 | Giữ `PHOTO_CONSENT_VERSION = 1`, chỉ sửa modal | Tăng số này sẽ chặn upload của mọi người; agent-ba đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-103 | Ảnh người gửi base64, ảnh sản phẩm gửi URL public; dùng poll, không webhook; không dùng SDK; `jpeg`, `num_samples: 1` | Không để lộ URL ảnh người; không cần endpoint công khai; agent-ba đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-104 | Hủy job chưa gửi dựa trên lần poll cuối (quá 8 giây), không có API hủy. Ngưỡng là ước lượng | Hai tab không hủy lẫn nhau; agent-ba đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-105 | Giữ job 35 ngày; 240 lần đọc/phút; ảnh tạm 1536 px; bucket 5 MB. Các ngưỡng là ước lượng | Chưa có số đo thật, xem lại ở T-96; agent-ba đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-106 | Được merge US-05, US-06 với `TRYON_PROVIDER=fake`; đo p95 chuyển sang T-94, T-96 | p95 chỉ đo được khi có pilot, mà pilot cần user cho phép riêng (D-91); theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-107 | Vẫn tính lượt khi kết quả bị bỏ vì admin đổi sản phẩm lúc job đang chạy (US-05 R11) | Trường hợp hiếm, đã trả tiền cho nhà cung cấp; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-108 | Khi tăng `TRYON_CONSENT_VERSION`: giữ file try-on, `/result` trả 403 tới khi đồng ý lại | Không xóa ảnh của người chưa kịp xem điều khoản mới, cũng không hiển thị khi chưa có consent; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-109 | Chỉ giữ lần đồng ý gần nhất; `provider_job_id` mất sau 35 ngày. Xem lại trước khi ra mắt (D-96) | Giữ đơn giản khi chưa ra mắt; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-110 | `moderation_level: permissive`, quan sát lại trong pilot | Tài liệu FASHN chỉ nói tới trang phục, chưa rõ có lọc ảnh người không; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-111 | Tích ô consent AI không tự ghi nhận; chỉ ghi khi bấm "Đồng ý và tiếp tục" (khác `ConsentBlock` của US-02) | Đồng ý gửi ảnh ra ngoài phải là hành động rõ ràng; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-112 | Mũi tên ở đầu/cuối danh sách dùng `aria-disabled`, không dùng `disabled` (đã sửa US-06) | `disabled` làm người dùng bàn phím mất focus; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-113 | Đồng hồ 15/60 giây tính từ lúc bắt đầu chờ ở sản phẩm đó; bấm Thử lại thì tính lại từ 0 | Khớp cảm nhận của người mua; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-114 | Lỗi và trạng thái chờ hiện trong khung ảnh; nhãn AI nằm dưới ảnh dạng văn bản thật | Trình đọc màn hình đọc được, không che ảnh; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-115 | Sửa nhãn ô consent lưu ảnh ở Hồ sơ, bỏ cụm "gửi ảnh tới dịch vụ AI"; giữ `PHOTO_CONSENT_VERSION = 1` | Nhãn cũ mâu thuẫn D-93, nhất quán D-102; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-116 | Trang Hồ sơ có mục "Thử đồ bằng AI": trạng thái consent và nút rút. Chỉ rút được ở Hồ sơ | Đúng D-93; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-117 | URL `/try-on?category&product` dùng `replace`, nút Back rời phòng thay vì lùi từng sản phẩm | Lịch sử trình duyệt không bị đầy khi lướt; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-118 | Hết lượt (`remaining = 0`): FE không gọi `POST`, hiện thẳng trạng thái hết lượt và thông báo ở cấp phòng; backend vẫn tự kiểm | Không gửi request chắc chắn lỗi; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-119 | FE hiển thị câu chữ theo `error.code`, không hiển thị `error.message` của server | Nhất quán câu chữ; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-120 | Hiện số lượt còn lại khi ≤ 5, kèm câu "ảnh tạo sẵn cũng tính vào lượt" | Generate trước tính lượt nên phải nói rõ; agent-uiux đề xuất, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-121 | `/result` với `state: blocked` có thể mang `TRYON_BLOCKED` hoặc `TRYON_PHOTO_UNUSABLE` (đã sửa `design/api.md`) | Cả hai đều được ghi nhớ theo khóa (D-76); agent-uiux phát hiện, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-122 | Khung ảnh 3:4 với `object-contain`, dù model trả 2:3; hai bên có dải trống nhỏ | Đồng bộ với ảnh hồ sơ; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-123 | Chấp nhận tab khác có thể hiện ảnh thử đồ cũ tới lần gọi `/result` kế tiếp sau khi thay ảnh hồ sơ | Mỗi lần chuyển sản phẩm đều xác nhận lại; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-124 | Chấp nhận job chưa gửi có thể bị hủy khi tab ẩn làm chậm poll quá 8 giây; quay lại thấy đúng trạng thái và có nút Thử lại | Không tốn lượt; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-125 | Sau đăng nhập vẫn về Trang chủ, chưa đẩy vào `/try-on` | Giữ phạm vi; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-126 | Tên bên nhận ảnh nằm trong một hằng cấu hình; đổi nhà cung cấp bắt buộc tăng `TRYON_CONSENT_VERSION` | Consent phải nêu đúng bên nhận; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-127 | Lỗi mạng không rõ khi `POST /run` coi như timeout: không thử lại, có thể đã tốn tiền. Chỉ `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, connect-timeout mới coi là chắc chắn chưa tốn | Không trả tiền hai lần; agent-coder chọn, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-128 | `prefetch` khi tắt tính năng hoặc tạm dừng trả `200 skipped reason: disabled`, không tra DB | Generate trước phải im lặng, không hiện lỗi; agent-coder chọn, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-129 | `GET /jobs/:id` với job `succeeded` mà consent đã lỗi thời trả `discarded`, `image: null` | Nhất quán D-108; agent-coder chọn, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-130 | Lỗi `failed` có tên lạ từ FASHN coi là tạm thời, thử lại 1 lần | Tài liệu FASHN có thể thêm tên mới; tối đa tốn thêm 1 lần gọi; agent-coder chọn, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-131 | Trạng thái tạm dừng khi hết credit nằm trong bộ nhớ; khởi động lại server là thử lại ngay | Một instance (D-99); agent-coder chọn, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-132 | `npm run test:postman` chạy mỗi nhóm collection trên một server riêng để AC-17 có cấu hình `TRYON_DAILY_LIMIT=1` và ngân sách rất nhỏ; nhận tên collection làm tham số | Kiểm được giới hạn qua HTTP thật; agent-coder chọn, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-133 | Mục "Thử đồ" đặt giữa Trang chủ và Hồ sơ, hiện cả ở mobile; ở US-05 tạm dùng câu "Chọn danh mục để xem bạn mặc thử sản phẩm." tới khi có mũi tên ở T-85 | Không nói về tính năng chưa có; theo khuyến nghị, user ủy quyền duyệt cả sprint 3 | sprint-03 |
| D-134 | Trang Hồ sơ ghi rõ số đo chưa ảnh hưởng đến ảnh thử đồ và không gửi tới dịch vụ AI | Câu cũ mâu thuẫn D-82, D-95; main agent chốt, user ủy quyền duyệt cả sprint 3 | sprint-03 |
