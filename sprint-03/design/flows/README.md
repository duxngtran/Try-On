# Sprint 03 — Luồng nghiệp vụ

Mỗi file là một luồng (Mermaid flowchart). Các bên: **Người mua → Frontend → Backend (Express + worker) → Supabase (Postgres / Storage) → Dịch vụ AI (qua adapter)**. API ở [`../api.md`](../api.md), DB ở [`../db/README.md`](../db/README.md), adapter ở [`../tryon-provider.md`](../tryon-provider.md).

| File | Luồng | Story | Endpoint / hàm |
|---|---|---|---|
| [tryon-room-entry.md](tryon-room-entry.md) | Vào phòng, kiểm điều kiện | US-05 | `GET /try-on/state` |
| [tryon-consent.md](tryon-consent.md) | Đồng ý, rút đồng ý | US-05 | `POST`, `DELETE /try-on/consent` |
| [tryon-select-category.md](tryon-select-category.md) | Chọn danh mục, hiện sản phẩm đầu tiên | US-05 | `GET /categories`, `/products`, `/result` |
| [tryon-job-create.md](tryon-job-create.md) | Tạo job, cache, lượt, ngân sách | US-05 | `POST /products/:id/jobs` |
| [tryon-job-worker.md](tryon-job-worker.md) | Worker: nhận, gửi, poll, retry, lỗi, hết hạn | US-05 | `claim_tryon_jobs`, `fail_tryon_job`… |
| [tryon-job-finish.md](tryon-job-finish.md) | Có kết quả, kết quả về muộn | US-05 | `complete_tryon_job` |
| [tryon-navigation.md](tryon-navigation.md) | Chuyển sản phẩm, chờ dừng 400 ms, xóa giữa chừng | US-06 | `GET /products`, `/result`, `POST /jobs` |
| [tryon-prefetch.md](tryon-prefetch.md) | Generate trước | US-06 | `POST /jobs` với `prefetch` |
| [tryon-invalidate.md](tryon-invalidate.md) | Xóa ảnh khi thay ảnh hồ sơ, sản phẩm | US-05 | Trigger DB |
| [tryon-cleanup.md](tryon-cleanup.md) | Xóa file, dọn 90 ngày, dọn job | US-05 | `tryon_file_deletions` |
| [tryon-model-switch.md](tryon-model-switch.md) | Đổi model | US-05 | `npm run tryon:purge-model` |

**Kế thừa, không vẽ lại:** [`auth-middleware`](../../../sprint-01/design/flows/auth-middleware.md) (401/403), [`session-restore`](../../../sprint-01/design/flows/session-restore.md) (API client xử lý 401), [`profile-photo-upload`](../../../sprint-01/design/flows/profile-photo-upload.md), [`product-update`](../../../sprint-02/design/flows/product-update.md).

Quy ước trong sơ đồ:
- Mọi route `/try-on/*` bắt đầu bằng `auth + requireRole user`, thất bại trả 401/403 theo `auth-middleware`.
- Hình thoi = điểm quyết định; hình trụ = thao tác DB; nét đứt = best-effort.
- Log chỉ chứa `jobId`, `productId`, `userId`, mã lỗi. **Không** có ảnh, base64, signed URL, đường dẫn ảnh, số đo, API key (AC-20).
