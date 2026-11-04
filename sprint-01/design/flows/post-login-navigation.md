# Luồng: Điều hướng sau đăng nhập/đăng ký + route guard

> US-01 §4.2.4, §4.4, AC-08 · Chống open redirect

## 1. Sau đăng nhập / đăng ký

```mermaid
flowchart TD
  S([Có token + user từ response]) --> A{Nguồn?}
  A -- "Đăng ký (D-16)" --> P(["/profile — onboarding"])
  A -- Đăng nhập --> B["from = location.state.from<br/>(do route guard / handler 401 gắn)"]
  B --> C{"isSafeInternalPath(from)?"}
  C -- Không / không có --> D{role}
  C -- Có --> E{"Hợp vai?<br/>from bắt đầu /admin ⇔ role = admin"}
  E -- Có --> T([navigate from, replace])
  E -- Không --> D
  D -- admin --> AD(["/admin — placeholder"])
  D -- user --> F{profileCompleted?}
  F -- false --> P
  F -- true --> H(["/ — trang chủ"])
```

`isSafeInternalPath(p)`: là chuỗi, bắt đầu bằng `/`, **không** bắt đầu bằng `//` hoặc `/\`, không chứa `://`, không chứa ký tự điều khiển; không phải `/login` hoặc `/register`. Ví dụ: `/profile` ✓ · `//evil.com` ✗ · `https://evil.com` ✗ · `/\evil.com` ✗ (T-20).

## 2. Route guard

```mermaid
flowchart TD
  N([Điều hướng tới route]) --> S{status}
  S -- loading --> W[Màn chờ, chưa quyết định]
  S -- error --> X[Màn lỗi kết nối + Thử lại]
  S -- "guest / authenticated" --> K{Loại route}
  K -- "GuestOnly (/login, /register)" --> G1{Đã đăng nhập?}
  G1 -- Có --> G2([admin → /admin, user → /])
  G1 -- Không --> OK([Render])
  K -- "RequireAuth (/profile, /)" --> R1{Đã đăng nhập?}
  R1 -- Không --> R2(["/login, state.from = path hiện tại"])
  R1 -- Có --> R3{"role = user?"}
  R3 -- Không --> R4([admin → /admin])
  R3 -- Có --> OK
  K -- "RequireAdmin (/admin)" --> M1{Đã đăng nhập?}
  M1 -- Không --> R2
  M1 -- Có --> M2{"role = admin?"}
  M2 -- Không --> M3([Trang 403 'Bạn không có quyền truy cập.'])
  M2 -- Có --> OK
```

## Ghi chú
- Trang chủ `/` ở sprint 01 là placeholder cho user; admin luôn được đưa về `/admin` (admin không có hồ sơ — D-14, xem `auth-middleware.md`).
- Kiểm tra "hợp vai" tránh vòng lặp: user bị đá ra login từ `/admin` sẽ không bị đưa lại `/admin` sau khi đăng nhập.
- Sprint 01 chưa có điều kiện `profileCompleted` cho route nào (Phòng thử đồ thuộc US-05); trang chủ chỉ hiển thị banner nhắc hoàn thiện hồ sơ nếu cần.
- Thay đổi so với US-01 §4.4 (bổ sung, không mâu thuẫn): admin vào `/login`/`/register` khi đã đăng nhập → `/admin` thay vì trang chủ.
