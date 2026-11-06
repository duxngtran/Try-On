# Luồng: Đơn của tôi

> US-08 §4.4, R6, E14, AC-09, AC-15, AC-19 · `GET /api/orders`, `GET /api/orders/:id` · D-61, D-65, D-142, D-151

```mermaid
flowchart TD
  U0(["/orders?page=N"]) --> B1[["auth + requireRole user<br/>Rate limit 120/phút"]]
  B1 --> B2{"zod: page, limit"}
  B2 -- Sai --> E400["400, FE về trang 1"]
  B2 -- OK --> D1[("orders WHERE user_id = req.user.id<br/>created_at, id giảm dần<br/>chỉ cột của OrderSummary")]
  D1 --> F1{"items rỗng?"}
  F1 -- "Có, total = 0" --> F2["Chưa có đơn nào, lối về /try-on"]
  F1 -- "Có, total > 0" --> F3["Lùi về trang cuối (D-61, D-65)"]
  F1 -- Không --> F4["Danh sách: số đơn, thời gian, số món, tổng"]
  F4 --> U1(["Chọn một đơn, hoặc vừa đặt xong"])

  U1 --> B3[["/orders/:id: auth, role, UUID (sai → 404), rate limit"]]
  B3 --> D2[("orders WHERE id = :id AND user_id = req.user.id<br/>kèm order_items; products chỉ lấy image_path, image_version, deleted_at")]
  D2 -- "Không có" --> E404["404 NOT_FOUND<br/>đơn người khác cũng vậy"]
  D2 --> F5["Bản chụp tên, giá, số lượng; tổng; thông tin nhận hàng<br/>'Chưa thanh toán trực tuyến'<br/>Ảnh hiện tại, nhãn nếu đã ngừng bán"]
```

## Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| `user_id` nằm ngay trong câu truy vấn, không kiểm sau khi đọc | Không thể đọc nhầm rồi quên chặn (AC-15) |
| Tên, giá lấy từ `order_items`, không từ `products` | Bản chụp (AC-09) |
| Danh sách không có thông tin nhận hàng | Không tải dữ liệu cá nhân khi chưa cần (AC-19) |
| Không hiện nhãn trạng thái | Không có trạng thái (D-138) |
| `Cache-Control: no-store` | Trình duyệt dùng chung không giữ lại địa chỉ, số điện thoại |
