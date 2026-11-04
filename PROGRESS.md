# PROGRESS

## Tổng quan
| Sprint | Epic | Trạng thái | Bước hiện tại |
|---|---|---|---|
| sprint-01 | Epic 1: Thiết lập hồ sơ khách hàng (US-01, US-02) | Đang làm | Bước 5: Implement — setup (agent-coder) |
| sprint-02 | Epic 2: Quản lý kho hàng (US-03, US-04) | Chưa bắt đầu | — |
| sprint-03 | Epic 3: Phòng thử đồ (US-05, US-06) | Chưa bắt đầu | — |
| sprint-04 | Epic 4: Mua sắm & Giỏ hàng (US-07, US-08, US-09) | Chưa bắt đầu | — |

## Sprint 01 — chi tiết
- [x] Bước 1: User stories (`sprint-01/US-01.md`, `sprint-01/US-02.md`) — xong, user xác nhận giả định (D-04 → D-15) (2026-11-04)
- [x] Bước 2: Sprint backlog (`sprint-01/sprint-backlog.md`, 34 task) — xong, user xác nhận Q1–Q6 (D-17 → D-21, cập nhật D-06) (2026-11-04)
- [x] Bước 3: Thiết kế nghiệp vụ (`design/flows/` 11 luồng, `design/api.md`, `design/db/`) — xong, user xác nhận (D-22 → D-33) (2026-11-04)
- [x] Bước 4: UI/UX (`design/design-system.md` "Try-on Atelier v2", 6 file `sprint-01/screens/`) — xong, user xác nhận (D-34 → D-38) (2026-11-04)
- [ ] Bước 5: Implement + test (unit + Postman) — đang thực hiện: setup trên `chore/sprint-01-setup`

## Merge log
_(chưa có)_

## Blockers
_(chưa có)_

## Backlog kỹ thuật (để sau)
- Script dọn file ảnh mồ côi (log `ORPHAN_PHOTO`) — D-25
- Stitch: xóa tay design system cũ `assets/10966836231677352902` trên stitch.withgoogle.com (font không có tiếng Việt)

## Ghi chú công cụ
- Stitch MCP: `update_design_system` luôn lỗi `Request contains an invalid argument`; `generate_screen_from_text` timeout với màn Hồ sơ; `list_screens` trả rỗng. Nguồn chuẩn là file `.md`, không phải mockup Stitch.
