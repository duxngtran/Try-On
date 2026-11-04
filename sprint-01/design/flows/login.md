# Luồng: Đăng nhập (khóa 5 lần sai, rate limit IP, dummy hash)

> US-01 §4.2, E3, E4 · `POST /api/auth/login` · D-05, D-06

```mermaid
flowchart TD
  subgraph U[User / Admin]
    U1([Mở /login]) --> U2[Nhập email, mật khẩu, bấm Đăng nhập]
  end

  subgraph FE[Frontend]
    F1{"Validate: email hợp lệ,<br/>mật khẩu không rỗng, ≤72"}
    F1 -- Lỗi --> F1a[Lỗi dưới ô]
    F1 -- OK --> F2[Khóa nút + loading, gửi email + password]
    F3{Response}
    F3 -- 200 --> F4[Lưu token, set user] --> F5([Điều hướng: post-login-navigation.md])
    F3 -- "401 INVALID_CREDENTIALS" --> F6["'Email hoặc mật khẩu không đúng.'<br/>KHÔNG kích hoạt handler hết phiên"]
    F3 -- "429 TOO_MANY_ATTEMPTS" --> F7["'Thử lại sau X phút'<br/>X = ceil(retryAfterSeconds/60)"]
    F3 -- "429 TOO_MANY_REQUESTS" --> F8[Thao tác quá nhanh]
    F3 -- "500 / mạng" --> F9[Lỗi chung, giữ email]
  end

  subgraph BE[Backend Express]
    B1{"Rate limit IP<br/>AUTH_RATE_LIMIT_PER_MIN"} -- Vượt --> B1a[429 TOO_MANY_REQUESTS]
    B1 -- OK --> B2{zod hợp lệ?}
    B2 -- Không --> B2a["400 VALIDATION_ERROR<br/>(không tính là lần sai)"]
    B2 -- Có --> B3[email = trim + lowercase]
    B3 --> B4{"loginLock[email]<br/>đang khóa?"}
    B4 -- Có --> B4a["429 TOO_MANY_ATTEMPTS<br/>details.retryAfterSeconds + header Retry-After<br/>(kể cả mật khẩu đúng — AC-07)"]
    B4 -- Không --> B5[(SELECT id, role, password_hash<br/>FROM users WHERE email)]
    B5 --> B6{Tìm thấy?}
    B6 -- Không --> B7["bcrypt.compare(password, DUMMY_HASH)<br/>→ luôn false, thời gian tương đương"]
    B6 -- Có --> B8["bcrypt.compare(password, password_hash)"]
    B7 --> B9{Khớp?}
    B8 --> B9
    B9 -- Không --> B10["registerFail(email)<br/>count++ trong cửa sổ 15'"]
    B10 --> B11{count ≥ LOGIN_MAX_FAILS?}
    B11 -- Có --> B12["lockedUntil = now + LOGIN_LOCK_MINUTES"] --> B13
    B11 -- Không --> B13[401 INVALID_CREDENTIALS]
    B9 -- Có --> B14["clearFails(email)"]
    B14 --> B15[(SELECT profiles.profile_completed)]
    B15 --> B16["Ký JWT {sub, role} HS256"]
    B16 --> B17["200 {token, user{id,email,role,profileCompleted}}"]
  end

  U2 --> F1
  F2 --> B1
  B1a & B2a & B4a & B13 & B17 --> F3
```

## Quy tắc bộ đếm khóa (in-memory, D-06)

| Mục | Quy tắc |
|---|---|
| Khóa theo | Email đã chuẩn hóa — **kể cả email không tồn tại** (để hành vi khóa không tiết lộ tài khoản có tồn tại) |
| Cửa sổ | Lần sai đầu tiên mở cửa sổ 15 phút; hết cửa sổ mà chưa đủ 5 lần → reset |
| Khóa | Lần sai thứ 5 vẫn trả 401 và đặt `lockedUntil = now + 15'`; từ lần thứ 6 → 429 cho tới `lockedUntil` |
| Hết khóa | Sau `lockedUntil` xóa entry, đếm lại từ 0 |
| Đăng nhập đúng | Xóa entry (chỉ khi không bị khóa) |
| Không tính | Lỗi validation (400), lỗi rate limit IP (429), lỗi server (500) |
| Bộ nhớ | `Map`; dọn entry hết hạn khi truy cập + `setInterval` mỗi 5 phút (`unref()`); mất khi restart — chấp nhận cho 1 instance MVP |

## Ghi chú
- `DUMMY_HASH` = `bcrypt.hash(<chuỗi ngẫu nhiên>, BCRYPT_COST)` tạo **một lần khi khởi động**, cùng cost với hash thật → chống dò email bằng thời gian phản hồi (AC-06).
- Admin đăng nhập cùng endpoint; khác biệt duy nhất là `role` trong token/response.
- `401 INVALID_CREDENTIALS` không phải "hết phiên": API client chỉ chạy handler hết phiên với `UNAUTHORIZED`/`TOKEN_EXPIRED` (xem `session-restore.md`).
