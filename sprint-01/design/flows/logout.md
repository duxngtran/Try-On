# Luồng: Đăng xuất

> US-01 §4.3.3, AC-09 · D-05 (không thu hồi token phía server, không gọi backend)

```mermaid
flowchart TD
  U([User/Admin bấm Đăng xuất ở header]) --> F1{Đang có upload ảnh chạy?}
  F1 -- Có --> F2[Hủy request bằng AbortController]
  F1 -- Không --> F3
  F2 --> F3["Xóa localStorage token<br/>reset AuthProvider: user = null, status = guest<br/>xóa hồ sơ/signed URL trong state"]
  F3 --> F4["navigate('/login', { replace: true })"]
  F4 --> F5([Trang Đăng nhập])
  F5 -. "User bấm Back" .-> F6{Route guard RequireAuth}
  F6 -- "Không có token" --> F4
```

## Ghi chú
- `replace: true` + route guard đảm bảo Back không hiện lại trang cần đăng nhập (AC-09). Dữ liệu nhạy cảm (signed URL, số đo) bị xóa khỏi state nên không còn trong bộ nhớ trang.
- Đăng xuất ở 1 tab không tự đăng xuất tab khác (Could: lắng nghe sự kiện `storage` để đồng bộ — không bắt buộc sprint 01).
- Token cũ vẫn hợp lệ phía server tới khi hết hạn (rủi ro đã chấp nhận ở D-05).
