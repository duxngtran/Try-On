# Luồng: Middleware `auth` + `requireRole`

> US-01 §4.4, E5–E7, AC-08, AC-10 · Áp dụng cho `/api/auth/me`, `/api/profile/*`, `/api/admin/*`

```mermaid
flowchart TD
  R([Request tới route cần đăng nhập]) --> A1{"Header Authorization<br/>dạng 'Bearer token'?"}
  A1 -- Không --> E1[401 UNAUTHORIZED]
  A1 -- Có --> A2["jwt.verify(token, JWT_SECRET,<br/>{ algorithms: ['HS256'] })"]
  A2 --> A3{Kết quả}
  A3 -- TokenExpiredError --> E2[401 TOKEN_EXPIRED]
  A3 -- "Chữ ký sai / alg khác /<br/>thiếu sub / malformed" --> E1
  A3 -- OK --> A4[(SELECT id, email, role<br/>FROM users WHERE id = sub)]
  A4 --> A5{Còn tồn tại?}
  A5 -- Không --> E1
  A5 -- Lỗi DB --> E5[500 INTERNAL_ERROR]
  A5 -- Có --> A6["req.user = { id, email, role }<br/>role lấy từ DB, không từ token"]
  A6 --> A7{Route có requireRole?}
  A7 -- Không --> OK([next → controller])
  A7 -- Có --> A8{"req.user.role ∈ roles?"}
  A8 -- Không --> E3[403 FORBIDDEN]
  A8 -- Có --> OK
```

## Phân quyền route sprint 01

| Route | Middleware | Ghi chú |
|---|---|---|
| `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login` | — (public) | 2 route auth có rate limit IP |
| `GET /api/auth/me` | `auth` | user + admin |
| `/api/profile/*` | `auth` + `requireRole('user')` | Admin → 403 (D-14: admin không có/không xem hồ sơ) |
| `/api/admin/*` | `auth` + `requireRole('admin')` | User → 403 (AC-10) |

## Ghi chú
- Kiểm tra user còn tồn tại ở mỗi request (1 query theo PK, rẻ) → token của user đã bị xóa mất hiệu lực ngay (E6). Sprint 01 chưa có trạng thái "khóa tài khoản".
- `role` lấy từ DB nên khi đổi quyền có hiệu lực ngay, không cần chờ token hết hạn.
- Chỉ định rõ `algorithms: ['HS256']` để chặn token `alg: none` / đổi thuật toán (T-16).
