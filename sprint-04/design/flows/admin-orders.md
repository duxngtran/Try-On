# Luồng: Admin xem đơn

> US-09 §4, R1–R6, E1–E8, AC-01 → AC-09 · `GET /api/admin/orders`, `GET /api/admin/orders/:id` · D-14, D-28, D-61, D-65, D-138, D-151

```mermaid
flowchart TD
  U0(["AdminNav: Đơn hàng → /admin/orders?page=N"]) --> G0{"Guard RequireAdmin"}
  G0 -- "Không phải admin" --> G1["Theo guard hiện có. API trả 401, 403"]
  G0 -- OK --> B1["GET /admin/orders"]
  B1 --> B2[["auth + requireRole admin"]]
  B2 --> B3{"zod: page, limit"}
  B3 -- Sai --> E400["400, FE về trang 1"]
  B3 -- OK --> D1[("orders, created_at + id giảm dần, count exact<br/>Chỉ cột: id, order_no, created_at, item_count, total_vnd, recipient_name<br/>PGRST103 → items rỗng (D-65)")]
  D1 -- Lỗi --> E500["Thông báo + Thử lại"]
  D1 --> F1{"items rỗng?"}
  F1 -- "Có, total = 0" --> F2["'Chưa có đơn hàng nào.'"]
  F1 -- "Có, total > 0" --> F3["Lùi về trang cuối"]
  F1 -- Không --> F4["Số đơn, thời gian, người nhận, số món, tổng"]
  F4 --> U1(["Chọn dòng, state.from giữ trang"])

  U1 --> B4["GET /admin/orders/:id"]
  B4 --> B5[["auth, role, UUID (sai → 404)"]]
  B5 --> D2[("orders kèm order_items, users(email)<br/>products chỉ lấy image_path, image_version, deleted_at<br/>KHÔNG join profiles, KHÔNG đọc tryon_*")]
  D2 -- "Không có" --> E404["404, link về danh sách"]
  D2 --> F5["Số đơn, thời gian, email, người nhận, số điện thoại, địa chỉ<br/>Từng dòng theo bản chụp, tổng<br/>'Chưa thanh toán trực tuyến'<br/>Nhãn 'Đã ngừng bán' nếu cần"]
  F5 --> U2(["Quay lại → đúng trang (AC-09)"])
```

## Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Chỉ đọc, không có endpoint ghi | D-138. DB cũng không cho `service_role` sửa |
| Danh sách chỉ `select` đúng cột | Dữ liệu cá nhân không rời DB khi chưa cần, không chỉ lọc ở response (AC-03) |
| Không join `profiles`, `tryon_*` | D-14: không có đường nào lộ ảnh, số đo (AC-06) |
| `item_count`, `total_vnd` đọc từ cột đã lưu | Nhanh, và không tính lại từ dữ liệu có thể đổi |
| Không có "Xem giỏ của người mua" | PB không yêu cầu; D-14 |
| Không cập nhật thời gian thực | Tải lại trang là đủ cho MVP (AC-08) |
