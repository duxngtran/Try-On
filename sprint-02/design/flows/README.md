# Sprint 02 — Luồng nghiệp vụ

Mỗi file là một luồng (Mermaid flowchart). Các bên: **Admin → Frontend (React) → Backend (Express) → Supabase (Postgres / Storage)**. API chi tiết ở [`../api.md`](../api.md), DB/Storage ở [`../db/README.md`](../db/README.md).

| File | Luồng | Story | Endpoint |
|---|---|---|---|
| [category-list.md](category-list.md) | Xem danh sách danh mục | US-03 | `GET /api/admin/categories` |
| [category-save.md](category-save.md) | Thêm, đổi tên danh mục, chặn trùng tên | US-03 | `POST`, `PATCH /api/admin/categories` |
| [category-delete.md](category-delete.md) | Xóa mềm danh mục, chặn khi còn sản phẩm | US-03 | `DELETE /api/admin/categories/:id` |
| [product-list.md](product-list.md) | Danh sách, phân trang, lọc sản phẩm | US-04 | `GET /api/admin/products` |
| [product-create.md](product-create.md) | Thêm sản phẩm kèm ảnh, rollback file | US-04 | `POST /api/admin/products` |
| [product-update.md](product-update.md) | Sửa sản phẩm, thay ảnh, xóa file cũ | US-04 | `GET`, `PATCH /api/admin/products/:id` |
| [product-delete.md](product-delete.md) | Xóa mềm sản phẩm | US-04 | `DELETE /api/admin/products/:id` |

**Kế thừa sprint 01, không vẽ lại:** [`auth-middleware`](../../../sprint-01/design/flows/auth-middleware.md) (xác thực, `requireRole`, 401/403), [`post-login-navigation`](../../../sprint-01/design/flows/post-login-navigation.md) (guard `RequireAdmin`), [`session-restore`](../../../sprint-01/design/flows/session-restore.md) (API client xử lý 401).

Quy ước trong sơ đồ:
- Mọi route bắt đầu bằng `auth + requireRole admin`; thất bại trả 401/403 theo `auth-middleware`, không vẽ lại.
- Hình thoi = điểm quyết định; nét đứt = bước best-effort (lỗi chỉ log, không làm hỏng request).
- Log chỉ chứa `productId` hoặc `categoryId` và mã lỗi, không chứa token.
