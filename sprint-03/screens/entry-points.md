# Screen Descriptions — Lối vào Phòng thử đồ (Header, Trang chủ)

> Cập nhật của `sprint-01/screens/header-navigation.md` và `sprint-01/screens/home.md`. US-05 §5.1 · D-38, D-72 · **Chỉ nêu phần thay đổi.**

## Header — thêm liên kết "Thử đồ"

- Với role `user` đã đăng nhập: thêm nav link **Thử đồ** (`small` 600, icon `Shirt` 16px ở ≥ sm) → `/try-on`, đặt trước menu tài khoản (desktop: ngay sau logo, bên trái menu). `aria-current="page"` + gạch chân 2px `ink` khi ở `/try-on`. Vùng chạm ≥ 44px.
- Mobile: hiện trong hàng header nếu đủ chỗ ở 360px (logo + "Thử đồ" + avatar); nếu không đủ thì đưa lên đầu menu avatar (mục đầu tiên). Quy ước design system §7.7: không hamburger khi ≤ 3 mục.
- Admin và guest: không hiện liên kết (admin không dùng phòng thử đồ, D-14, D-28).
- Admin gõ `/try-on`: chuyển về `/admin` như D-38. Guest: `/login`, sau đăng nhập quay lại `/try-on`.

## Trang chủ — Card "Phòng thử đồ" đi vào hoạt động

- Bỏ badge "SẮP RA MẮT" và nút disabled. Mô tả đổi thành "Chọn danh mục, bấm mũi tên hoặc vuốt để xem bạn mặc từng sản phẩm."
- Nút **Vào phòng thử đồ** (primary) → `/try-on`, luôn bấm được. Nếu hồ sơ chưa đủ, `/try-on` hiện cổng hồ sơ G1 (banner hồ sơ ở Trang chủ vẫn hiện như Sprint 01, nên không lặp thêm lời nhắc trong card).
- Phần minh họa: giữ gradient `surface-muted` → `accent-soft` và silhouette SVG (D-37) thay cho icon `Shirt`, `aria-hidden`.
- Dòng `small` `success` "Hồ sơ của bạn đã sẵn sàng." giữ nguyên.
- Không gọi `/try-on/state` ở Trang chủ (tránh thêm tải; Trang chủ chỉ dùng `user.profileCompleted` của `/me`).

## Đăng nhập xong

Điều hướng sau đăng nhập giữ nguyên Sprint 01 (hồ sơ đủ → Trang chủ). Không tự đẩy vào `/try-on`. Cân nhắc ở bước sau nếu muốn đổi đích mặc định.
