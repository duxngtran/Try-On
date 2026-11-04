# Sprint 01 — Luồng nghiệp vụ

Mỗi file là một luồng (Mermaid flowchart). Các bên: **User → Frontend (React) → Backend (Express) → Supabase (Postgres / Storage)**. API chi tiết ở [`../api.md`](../api.md), DB/Storage ở [`../db/README.md`](../db/README.md).

| File | Luồng | Story | Endpoint |
|---|---|---|---|
| [register.md](register.md) | Đăng ký + tự đăng nhập (D-16) | US-01 | `POST /api/auth/register` |
| [login.md](login.md) | Đăng nhập, khóa 5 lần sai, rate limit IP, dummy hash | US-01 | `POST /api/auth/login` |
| [auth-middleware.md](auth-middleware.md) | Middleware `auth` + `requireRole`, xử lý 401/403 | US-01 | mọi route cần đăng nhập |
| [session-restore.md](session-restore.md) | Khôi phục phiên khi tải app, API client xử lý 401 | US-01 | `GET /api/auth/me` |
| [logout.md](logout.md) | Đăng xuất phía client | US-01 | — |
| [post-login-navigation.md](post-login-navigation.md) | Điều hướng sau đăng nhập/đăng ký, route guard | US-01 | — |
| [profile-get.md](profile-get.md) | Lấy hồ sơ + signed URL, làm mới URL hết hạn | US-02 | `GET /api/profile` |
| [profile-measurements.md](profile-measurements.md) | Lưu chiều cao/cân nặng | US-02 | `PUT /api/profile/measurements` |
| [profile-consent.md](profile-consent.md) | Ghi nhận consent ảnh | US-02 | `POST /api/profile/photo-consent` |
| [profile-photo-upload.md](profile-photo-upload.md) | Tải/thay ảnh: magic bytes, EXIF, resize, rollback, xóa ảnh cũ, tăng `photo_version` | US-02 | `PUT /api/profile/photo` |
| [profile-photo-delete.md](profile-photo-delete.md) | Xóa ảnh | US-02 | `DELETE /api/profile/photo` |

Quy ước chung trong các sơ đồ:
- Hình thoi = điểm quyết định; nét đứt = bước "best-effort" (lỗi không làm hỏng request, chỉ log).
- Mọi lỗi trả về `{ success:false, error:{ code, message } }`; mã lỗi đầy đủ ở `api.md`.
- Log không bao giờ chứa mật khẩu, token, số đo, đường dẫn ảnh (chỉ `userId` + mã lỗi).
