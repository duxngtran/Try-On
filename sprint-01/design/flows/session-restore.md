# Luồng: Khôi phục phiên (`GET /api/auth/me`) + xử lý 401 tập trung

> US-01 §4.3, AC-08, AC-11 · D-05

## 1. Khi tải / reload app

```mermaid
flowchart TD
  S([App khởi động]) --> F1{localStorage có token?}
  F1 -- Không --> G[status = guest] --> R([Render router])
  F1 -- Có --> F2["status = loading<br/>route guard hiện màn chờ, chưa redirect"]
  F2 --> F3["GET /api/auth/me<br/>Authorization: Bearer"]
  F3 --> B1[[Backend: middleware auth — auth-middleware.md]]
  B1 --> B2[(SELECT profiles.profile_completed)]
  B2 --> B3["200 {user{id,email,role,profileCompleted}}"]
  B3 --> F4[status = authenticated, set user] --> R
  B1 -- "401 UNAUTHORIZED / TOKEN_EXPIRED" --> F5[Handler 401 — mục 2]
  F3 -- "Mất mạng / 5xx" --> F6["Giữ token, status = error<br/>màn 'Không kết nối được' + nút Thử lại"]
  F6 -- Thử lại --> F3
```

## 2. Handler 401 trong API client (một chỗ duy nhất)

```mermaid
flowchart TD
  X([Response lỗi bất kỳ]) --> C1{"HTTP 401 VÀ code ∈<br/>{UNAUTHORIZED, TOKEN_EXPIRED}<br/>VÀ request có gửi token?"}
  C1 -- Không --> C2(["Trả lỗi chuẩn hóa {code,message} cho caller<br/>vd. 401 INVALID_CREDENTIALS của login"])
  C1 -- Có --> C3{Đang xử lý 401 khác?}
  C3 -- Có --> C4([Bỏ qua — chỉ xử lý 1 lần])
  C3 -- Không --> C5[Xóa token + user + dữ liệu hồ sơ đã cache]
  C5 --> C6{Đang ở route cần đăng nhập?}
  C6 -- Có --> C7["navigate('/login', replace)<br/>state.from = đường dẫn hiện tại<br/>thông báo 'Phiên đăng nhập đã hết hạn...'"]
  C6 -- Không --> C8([Ở lại trang, status = guest])
```

## Ghi chú
- Không đăng xuất khi lỗi mạng/5xx (F6): tránh mất phiên vì mạng chập chờn.
- Nhiều request song song cùng nhận 401 → cờ `handling401` đảm bảo chỉ redirect + thông báo **một lần** (T-05).
- `state.from` được lọc theo quy tắc đường dẫn nội bộ ở `post-login-navigation.md` (AC-08: đăng nhập lại thì quay về trang đang xem).
- `GET /api/auth/me` là nguồn duy nhất cập nhật `profileCompleted` khi reload; sau các thao tác hồ sơ FE cập nhật từ response của API hồ sơ.
