# PROGRESS

## Tổng quan
| Sprint | Epic | Trạng thái | Bước hiện tại |
|---|---|---|---|
| sprint-01 | Epic 1: Thiết lập hồ sơ khách hàng (US-01, US-02) | Xong | US-01 và US-02 đã merge vào `main` |
| sprint-02 | Epic 2: Quản lý kho hàng (US-03, US-04) | Đang làm | Bước 1–3 (user cho phép chạy liền, không dừng giữa các bước) |
| sprint-03 | Epic 3: Phòng thử đồ (US-05, US-06) | Chưa bắt đầu | — |
| sprint-04 | Epic 4: Mua sắm & Giỏ hàng (US-07, US-08, US-09) | Chưa bắt đầu | — |

## Sprint 01 — chi tiết
- [x] Bước 1: User stories (`sprint-01/US-01.md`, `sprint-01/US-02.md`) — xong, user xác nhận giả định (D-04 → D-15) (2026-11-04)
- [x] Bước 2: Sprint backlog (`sprint-01/sprint-backlog.md`, 34 task) — xong, user xác nhận Q1–Q6 (D-17 → D-21, cập nhật D-06) (2026-11-04)
- [x] Bước 3: Thiết kế nghiệp vụ (`design/flows/` 11 luồng, `design/api.md`, `design/db/`) — xong, user xác nhận (D-22 → D-33) (2026-11-04)
- [x] Bước 4: UI/UX (`design/design-system.md` "Try-on Atelier v2", 6 file `sprint-01/screens/`) — xong, user xác nhận (D-34 → D-38) (2026-11-04)
- [x] Bước 5: Implement + test (unit + Postman) — 34/34 task xong. Setup xong (T-02 đạt qua `list_tables`); US-01 (T-10 → T-22) và US-02 (T-23 → T-34) đã merge; kết quả US-02 trước merge: test BE 181/181, FE 153/153, newman `System` 2 request/5 assertion, `Auth` 26/66, `Profile` 126/244, đều 0 fail; kiểm tra Playwright trên Chrome thật đạt ở 360, 768, 1280 px (2026-11-05)

## Merge log
- 2026-11-04: `chore/sprint-01-setup` → `main` (merge commit `3a8d178`). Setup T-01, T-03→T-06, T-08 + Prettier, .gitattributes, README. Test BE 20/20, FE 8/8, lint, format:check, build đều pass. T-07, T-09 còn chờ Supabase.
- 2026-11-05: `feature/US-01-auth` → `main` (merge commit `570a0ee`), user xác nhận. Trên `main`: test BE 78/78, FE 86/86, lint, build pass. Trước merge: newman `Auth` 26 request, 66 assertion, 0 fail (nâng rate limit cho server test); newman `System` 2 request, 5 assertion, 0 fail. Chưa kiểm thật: token hết hạn, hết khóa sau 15 phút, đăng ký đồng thời, rate limit 20/phút (chỉ có unit test hoặc chưa chạy).
- 2026-11-05: `feature/US-02-profile` → `main` (merge commit `aeae7eb`), user gọi `/merge`. Trên `main`: test BE 181/181, FE 153/153, lint, build pass. Trước merge: newman `System` 2 request/5 assertion, `Auth` 26/66, `Profile` 126/244, đều 0 fail (chưa chạy lại newman sau merge).

## Blockers
- Chưa có

## Ghi chú Supabase
- `DATABASE_URL` dùng Session pooler cổng 5432 vì host direct chỉ có IPv6 mà máy dev không có IPv6. User quyết định không đổi các secret đã gửi trong chat (2026-11-05)

## Backlog kỹ thuật (để sau)
- Script dọn file ảnh mồ côi (log `ORPHAN_PHOTO`) — D-25
- UI US-01 chưa khớp `sprint-01/screens/`: skeleton trong header khi tải, hiệu ứng lắc ô mật khẩu và fade của Alert, sidebar desktop trang Admin
- UI US-02 chưa khớp `sprint-01/screens/profile.md`: banner tự thu gọn, cross-fade khi đổi ảnh, chia hai cột ở tablet, hàng đợi toast, lazy-load `/profile`, khóa nút khi 429 thiếu `retryAfterSeconds`
- Thêm favicon (hiện 404 trên trình duyệt)
- Chưa kiểm thật: Storage/DB lỗi giữa lúc tải ảnh (chỉ có mock), signed URL hết hạn sau 15 phút, token hết hạn, hết khóa sau 15 phút, đăng ký đồng thời, rate limit 20/phút; nút Back sau đăng xuất chỉ xác nhận không lộ nội dung riêng tư
- Stitch: xóa tay design system cũ `assets/10966836231677352902` trên stitch.withgoogle.com (font không có tiếng Việt)

## Ghi chú công cụ
- Stitch MCP: `update_design_system` luôn lỗi `Request contains an invalid argument`; `generate_screen_from_text` timeout với màn Hồ sơ; `list_screens` trả rỗng. Nguồn chuẩn là file `.md`, không phải mockup Stitch.
- Postman: workspace "Try-on", collection "Try-on API" (`478c6b9e-13c1-42f1-ad2b-724790e10e37`), environment "local" (`992b1ad8-9e5c-4786-a982-42b9fc044eac`). Postman MCP không chạy được collection và không gắn được file vào request form-data; nguồn chuẩn là `backend/tests/postman/`, chạy bằng `npm run test:postman` (D-40).
