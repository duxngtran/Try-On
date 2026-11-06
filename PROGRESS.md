# PROGRESS

## Tổng quan
| Sprint | Epic | Trạng thái | Bước hiện tại |
|---|---|---|---|
| sprint-01 | Epic 1: Thiết lập hồ sơ khách hàng (US-01, US-02) | Xong | US-01 và US-02 đã merge vào `main` |
| sprint-02 | Epic 2: Quản lý kho hàng (US-03, US-04) | Xong | US-03 và US-04 đã merge vào `main` |
| sprint-03 | Epic 3: Phòng thử đồ (US-05, US-06) | Xong mức A | US-05, US-06 đã merge, dùng adapter giả. Mức B (T-93 → T-97) chờ user. User ủy quyền duyệt cả sprint, trừ pilot FASHN |
| sprint-04 | Epic 4: Mua sắm & Giỏ hàng (US-07, US-08, US-09) | Đang làm | Bước 1–3 xong; đang làm bước 4 (UI/UX). User phê duyệt mọi quyết định của main agent, kể cả merge khi test đạt (2026-11-06) |

## Sprint 01 — chi tiết
- [x] Bước 1: User stories (`sprint-01/US-01.md`, `sprint-01/US-02.md`) — xong, user xác nhận giả định (D-04 → D-15) (2026-11-04)
- [x] Bước 2: Sprint backlog (`sprint-01/sprint-backlog.md`, 34 task) — xong, user xác nhận Q1–Q6 (D-17 → D-21, cập nhật D-06) (2026-11-04)
- [x] Bước 3: Thiết kế nghiệp vụ (`design/flows/` 11 luồng, `design/api.md`, `design/db/`) — xong, user xác nhận (D-22 → D-33) (2026-11-04)
- [x] Bước 4: UI/UX (`design/design-system.md` "Try-on Atelier v2", 6 file `sprint-01/screens/`) — xong, user xác nhận (D-34 → D-38) (2026-11-04)
- [x] Bước 5: Implement + test (unit + Postman) — 34/34 task xong. Setup xong (T-02 đạt qua `list_tables`); US-01 (T-10 → T-22) và US-02 (T-23 → T-34) đã merge; kết quả US-02 trước merge: test BE 181/181, FE 153/153, newman `System` 2 request/5 assertion, `Auth` 26/66, `Profile` 126/244, đều 0 fail; kiểm tra Playwright trên Chrome thật đạt ở 360, 768, 1280 px (2026-11-05)

## Sprint 02 — chi tiết
- [x] Bước 1: User stories (`sprint-02/US-03.md`, `sprint-02/US-04.md`) — xong (2026-11-05)
- [x] Bước 2: Sprint backlog (`sprint-02/sprint-backlog.md`, 26 task T-35 → T-60) — xong (2026-11-05)
- [x] Bước 3: Thiết kế nghiệp vụ (`sprint-02/design/`: 7 luồng, `api.md`, `db/`) — xong; SQL 003, 004 đã chạy thử trên PGlite, chưa áp dụng lên Supabase; D-41 → D-55 do user ủy quyền duyệt (2026-11-05)
- [x] Bước 4: UI/UX (4 file `sprint-02/screens/`, mục 7.11 trong `design/design-system.md`) — xong, không có mockup; D-56 → D-61 (2026-11-05)
- [x] Bước 5: Implement + test — 26/26 task xong (T-35 → T-60). User cho phép merge từng US khi test đạt (unit, lint, build, newman 0 fail) (2026-11-05)

## Sprint 03 — chi tiết
- [x] Bước 1: User stories (`sprint-03/US-05.md`, `sprint-03/US-06.md`) — xong, user chốt Q1–Q5 (D-71 → D-96) (2026-11-05)
- [x] Bước 2: Sprint backlog (`sprint-03/sprint-backlog.md`, 37 task T-61 → T-97) — xong (2026-11-06)
- [x] Bước 3: Thiết kế nghiệp vụ (`sprint-03/design/`: 11 luồng, `api.md`, `tryon-provider.md`, `db/`) — xong; SQL 005, 006 chưa áp dụng lên Supabase; D-97 → D-110 do user ủy quyền duyệt (2026-11-06)
- [x] Bước 4: UI/UX (5 file `sprint-03/screens/`, mục 7.12 trong `design/design-system.md`) — xong, không có mockup; D-111 → D-126 do user ủy quyền duyệt (2026-11-06)
- [x] Bước 5: Implement + test — mức A dùng adapter giả (T-61 → T-92). Backend US-05 (T-61 → T-75) xong: test BE 490/490, migration 005, 006 và bucket `tryon-images` đã áp dụng trên Supabase dev, `verify:tryon` 0 lỗi SQL, 0 deadlock theo agent-coder (main agent đã kiểm schema, quyền, dữ liệu dọn sạch, chưa chạy lại script); US-05 (T-61 → T-83) và US-06 (T-84 → T-92) xong và đã merge (2026-11-06). Mức B (T-93 → T-97: API key, pilot, ngân sách thật, pháp lý) chờ user cho phép riêng (D-91, D-96)

## Sprint 04 — chi tiết
- [x] Bước 1: User stories (`sprint-04/US-07.md`, `US-08.md`, `US-09.md`) — xong (2026-11-06)
- [x] Bước 2: Sprint backlog (`sprint-04/sprint-backlog.md`, 32 task T-98 → T-129) — xong (2026-11-06)
- [x] Bước 3: Thiết kế nghiệp vụ (`sprint-04/design/`: 5 luồng, `api.md`, `db/`) — xong; SQL 007, 008 chưa áp dụng lên Supabase; D-137 → D-154 (2026-11-06)
- [ ] Bước 4: UI/UX — đang làm
- [ ] Bước 5: Implement + test

## Merge log
- 2026-11-04: `chore/sprint-01-setup` → `main` (merge commit `3a8d178`). Setup T-01, T-03→T-06, T-08 + Prettier, .gitattributes, README. Test BE 20/20, FE 8/8, lint, format:check, build đều pass. T-07, T-09 còn chờ Supabase.
- 2026-11-05: `feature/US-01-auth` → `main` (merge commit `570a0ee`), user xác nhận. Trên `main`: test BE 78/78, FE 86/86, lint, build pass. Trước merge: newman `Auth` 26 request, 66 assertion, 0 fail (nâng rate limit cho server test); newman `System` 2 request, 5 assertion, 0 fail. Chưa kiểm thật: token hết hạn, hết khóa sau 15 phút, đăng ký đồng thời, rate limit 20/phút (chỉ có unit test hoặc chưa chạy).
- 2026-11-05: `feature/US-02-profile` → `main` (merge commit `aeae7eb`), user gọi `/merge`. Trên `main`: test BE 181/181, FE 153/153, lint, build pass. Trước merge: newman `System` 2 request/5 assertion, `Auth` 26/66, `Profile` 126/244, đều 0 fail (chưa chạy lại newman sau merge).
- 2026-11-05: `feature/US-03-categories` → `main` (merge commit `ed9fec3`), user cho phép merge khi test đạt. Trước merge: test BE 221/221, FE 186/186, lint, format:check, build pass; newman `System` 2/5, `Auth` 26/66, `Profile` 126/244, `Categories` 34/68 (request/assertion), đều 0 fail. Migration 003, 004 đã áp dụng trên Supabase dev. Chưa kiểm: AC-05, AC-06, AC-07 với sản phẩm thật và AC-08 (chuyển T-54, T-58 của US-04); trình duyệt thật (T-59).
- 2026-11-05: `feature/US-04-products` → `main` (merge commit `8860e9d`), user cho phép merge khi test đạt. Trước merge: test BE 331/331, FE 283/283, lint, format:check, build pass; newman `System` 2/5, `Auth` 26/66, `Profile` 111/244, `Categories` 34/68, `Products` 89/149 (request/assertion), đều 0 fail. Số request của `Profile` đổi theo số lần poll (D-39). Agent-coder báo `verify:products` (T-54) 60 lượt RPC song song 0 vi phạm, AC-08 đạt; T-59 đạt ở 360/768/1280 px (main agent chưa chạy lại hai kiểm tra này). Bucket public `product-images` đã tạo trên Supabase dev. Chưa kiểm: `whitespace-nowrap` của `AdminNav` trên trình duyệt (commit sau khi chụp T-59; lệnh chạy lại e2e bị bộ kiểm soát quyền chặn), p95, 429 đếm ngược trên trình duyệt, mobile thật/Safari.
- 2026-11-06: `feature/US-05-tryon-room` → `main` (merge commit `e8cefc3`), user ủy quyền merge. Trước merge (main agent tự chạy): test BE 505/505, FE 405/405, lint, format:check, build pass; newman `System` 2/5, `Auth` 26/66, `Profile` 111/244, `Categories` 34/68, `Products` 89/149, `Tryon` 216/221, `Tryon-quota` 29/26, `Tryon-budget` 16/21 (request/assertion), đều 0 fail, đều dùng adapter giả. Agent-coder báo T-81 đạt 120/120 kiểm tra trình duyệt ở 360/768/1280 px (main agent chưa chạy lại). Chưa kiểm: FASHN thật, độ trễ p95 (T-94, D-106), `tryon:pilot` chưa chạy lần nào, `prefers-reduced-motion`, trình đọc màn hình, Firefox/Safari, cross-fade từng khung hình. Câu chữ nhắc mũi tên, vuốt tạm đổi cho tới T-85.
- 2026-11-06: `feature/US-06-product-navigation` → `main` (merge commit `db3203c`), user ủy quyền merge. Trước merge (main agent tự chạy): test BE 506/506, FE 453/453, lint, format:check, build pass; newman `System` 2/5, `Auth` 26/66, `Profile` 110/244, `Categories` 34/68, `Products` 89/149, `Tryon` 283/284, `Tryon-quota` 32/30, `Tryon-budget` 16/21 (request/assertion), đều 0 fail, đều dùng adapter giả. Agent-coder báo T-91 đạt 116/116 kiểm tra trình duyệt ở 360/768/1280 px và số job đếm trên DB đúng (main agent chưa chạy lại). Chưa kiểm: FASHN thật, AC-12, AC-13, AC-16 trên trình duyệt thật (chỉ test FE), `prefers-reduced-motion`, trình đọc màn hình, tỉ lệ ảnh generate trước được xem.

## Blockers
- Mức B của sprint 3 (T-93 → T-97): cần user cấp API key FASHN và cho phép pilot với ảnh người thật (D-91); không chặn sprint 4

## Ghi chú Supabase
- `DATABASE_URL` dùng Session pooler cổng 5432 vì host direct chỉ có IPv6 mà máy dev không có IPv6. User quyết định không đổi các secret đã gửi trong chat (2026-11-05)

## Trước khi ra mắt thật
- Xem lại việc bắt buộc ảnh, số đo, consent AI để mua hàng (D-147), thời hạn giữ thông tin nhận hàng (D-152), đơn giả (D-154), cùng các việc pháp lý ở D-96

## Backlog kỹ thuật (để sau)
- Script dọn file ảnh mồ côi (log `ORPHAN_PHOTO`) — D-25
- UI US-01 chưa khớp `sprint-01/screens/`: skeleton trong header khi tải, hiệu ứng lắc ô mật khẩu và fade của Alert, sidebar desktop trang Admin
- UI US-02 chưa khớp `sprint-01/screens/profile.md`: banner tự thu gọn, cross-fade khi đổi ảnh, chia hai cột ở tablet, hàng đợi toast, lazy-load `/profile`, khóa nút khi 429 thiếu `retryAfterSeconds`
- Thay favicon placeholder (`data:,` trong `frontend/index.html`) bằng icon thật
- Lazy-load route: bundle FE 584 kB, Vite cảnh báo chunk lớn
- Dọn dữ liệu test Supabase dev: 33 sản phẩm xóa mềm và 33 file trong `product-images` do chạy test, tăng dần theo D-42
- Thêm 4 biến `PRODUCT_*` vào `backend/.env` của checkout gốc cho khớp `.env.example` (có default trong `env.js`, không bắt buộc)
- Chạy lại e2e admin ở 360 px để xác nhận `whitespace-nowrap` của `AdminNav`
- Chưa kiểm thật: Storage/DB lỗi giữa lúc tải ảnh (chỉ có mock), signed URL hết hạn sau 15 phút, token hết hạn, hết khóa sau 15 phút, đăng ký đồng thời, rate limit 20/phút; nút Back sau đăng xuất chỉ xác nhận không lộ nội dung riêng tư
- Stitch: xóa tay design system cũ `assets/10966836231677352902` trên stitch.withgoogle.com (font không có tiếng Việt)
- UI US-06 chưa khớp `sprint-03/screens/`: hiệu ứng chuyển sản phẩm 200 ms; thiếu mũi tên khi mở URL có sản phẩm đã xóa; hai nút "Danh mục khác" trùng khi sản phẩm cuối bị xóa; nhãn "Ảnh do AI tạo" hiện cả lúc khung còn là ảnh trải phẳng đang chờ tải
- Prefetch khi hết lượt trả 429 thay vì `skipped` như `sprint-03/design/api.md` (D-135)
- Dọn dữ liệu test Supabase dev: user `pm-*`, `tryon_jobs` do newman tích lũy

## Ghi chú công cụ
- Stitch MCP: `update_design_system` luôn lỗi `Request contains an invalid argument`; `generate_screen_from_text` timeout với màn Hồ sơ; `list_screens` trả rỗng. Nguồn chuẩn là file `.md`, không phải mockup Stitch.
- Postman: workspace "Try-on", collection "Try-on API" (`478c6b9e-13c1-42f1-ad2b-724790e10e37`), environment "local" (`992b1ad8-9e5c-4786-a982-42b9fc044eac`). Postman MCP không chạy được collection và không gắn được file vào request form-data; nguồn chuẩn là `backend/tests/postman/`, chạy bằng `npm run test:postman` (D-40).
