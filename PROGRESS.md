# PROGRESS

## Tổng quan
| Sprint | Epic | Trạng thái | Bước hiện tại |
|---|---|---|---|
| sprint-01 | Epic 1: Thiết lập hồ sơ khách hàng (US-01, US-02) | Đang làm | Bước 5: US-01 trên `feature/US-01-auth` (agent-coder) |
| sprint-02 | Epic 2: Quản lý kho hàng (US-03, US-04) | Chưa bắt đầu | — |
| sprint-03 | Epic 3: Phòng thử đồ (US-05, US-06) | Chưa bắt đầu | — |
| sprint-04 | Epic 4: Mua sắm & Giỏ hàng (US-07, US-08, US-09) | Chưa bắt đầu | — |

## Sprint 01 — chi tiết
- [x] Bước 1: User stories (`sprint-01/US-01.md`, `sprint-01/US-02.md`) — xong, user xác nhận giả định (D-04 → D-15) (2026-11-04)
- [x] Bước 2: Sprint backlog (`sprint-01/sprint-backlog.md`, 34 task) — xong, user xác nhận Q1–Q6 (D-17 → D-21, cập nhật D-06) (2026-11-04)
- [x] Bước 3: Thiết kế nghiệp vụ (`design/flows/` 11 luồng, `design/api.md`, `design/db/`) — xong, user xác nhận (D-22 → D-33) (2026-11-04)
- [x] Bước 4: UI/UX (`design/design-system.md` "Try-on Atelier v2", 6 file `sprint-01/screens/`) — xong, user xác nhận (D-34 → D-38) (2026-11-04)
- [ ] Bước 5: Implement + test (unit + Postman) — setup (T-01, T-03→T-06, T-08) xong; T-07 (migrate) và T-09 (chạy Postman) chờ Supabase của user; US-01 đang làm trên `feature/US-01-auth`; US-02 chưa bắt đầu

## Merge log
- 2026-11-04: `chore/sprint-01-setup` → `main` (merge commit `3a8d178`). Setup T-01, T-03→T-06, T-08 + Prettier, .gitattributes, README. Test BE 20/20, FE 8/8, lint, format:check, build đều pass. T-07, T-09 còn chờ Supabase.

## Blockers
- T-02: user cần tạo Supabase project, điền `.mcp.json` + `backend/.env` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL cổng 5432, JWT_SECRET ≥ 32 ký tự, ADMIN_EMAIL/ADMIN_PASSWORD) và `frontend/.env`

## Backlog kỹ thuật (để sau)
- Script dọn file ảnh mồ côi (log `ORPHAN_PHOTO`) — D-25
- Stitch: xóa tay design system cũ `assets/10966836231677352902` trên stitch.withgoogle.com (font không có tiếng Việt)

## Ghi chú công cụ
- Stitch MCP: `update_design_system` luôn lỗi `Request contains an invalid argument`; `generate_screen_from_text` timeout với màn Hồ sơ; `list_screens` trả rỗng. Nguồn chuẩn là file `.md`, không phải mockup Stitch.
- Postman: workspace "Try-on", collection "Try-on API" (`478c6b9e-13c1-42f1-ad2b-724790e10e37`), environment "local" (`992b1ad8-9e5c-4786-a982-42b9fc044eac`). Postman MCP không chạy được collection — cần Postman app hoặc newman.
