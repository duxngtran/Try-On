# Luồng: Chọn danh mục, hiện sản phẩm đầu tiên

> US-05 §4, §5.3, §5.4, E5–E8, E20–E22, AC-03 → AC-07 · D-44, D-72, D-73, D-74

```mermaid
flowchart TD
  U0([Người mua chọn danh mục C]) --> F0["Hủy theo dõi của danh mục cũ<br/>Phản hồi ≤ 200 ms: khung chờ"]
  F0 --> F1["GET /categories/C/products"]
  F1 --> R1{Response}
  R1 -- "404" --> E1["'Danh mục không còn tồn tại.'<br/>tải lại danh mục"]
  R1 -- "items rỗng" --> E2["'Danh mục này chưa có sản phẩm.'<br/>không sinh ảnh"]
  R1 -- "lỗi mạng, 500" --> E3["Báo lỗi, nút Thử lại"]
  R1 -- "có items" --> F2["P = items[0]: hiện tên, giá,<br/>ảnh trải phẳng, trạng thái chờ"]
  F2 --> F3["GET /products/P/result"]
  F3 --> R2{state}
  R2 -- ready --> F4["Hiện ảnh try-on + nhãn AI<br/>không gọi dịch vụ, không tốn lượt"]
  R2 -- pending --> F5["Gắn vào job, poll<br/>xem tryon-job-worker"]
  R2 -- blocked --> F6["Hiện E14 hoặc E15, không Thử lại"]
  R2 -- none --> F7["POST /products/P/jobs { display }<br/>xem tryon-job-create"]
  F3 -- "403" --> F8[Khối consent]
  F3 -- "409" --> F9[Lời nhắc hoàn thiện hồ sơ]
  F3 -- "404" --> F10["'Sản phẩm này không còn bán.' nút chuyển tiếp"]
  F7 --> R3{Kết quả}
  R3 -- "ready" --> F4
  R3 -- "pending" --> F5
  R3 -- "blocked" --> F6
  R3 -- "429 hết lượt" --> F11["Giữ ảnh trải phẳng, báo hết lượt và thời điểm có lượt mới"]
  R3 -- "503" --> F12["Giữ ảnh trải phẳng, 'Tính năng tạo ảnh đang tạm dừng.'"]
  F5 --> T1{"Có kết quả khi vẫn ở P?"}
  T1 -- Có --> F4
  T1 -- "Đã rời P" --> T2["Không đổi ảnh đang xem<br/>kết quả nằm trong cache"]
```

## Trạng thái chờ theo thời gian (D-74)

```mermaid
flowchart LR
  A["0 giây: ảnh trải phẳng,<br/>'Đang tạo ảnh bạn mặc sản phẩm này…'"] --> B["15 giây: thêm 'Vẫn đang tạo…<br/>Bạn có thể xem sản phẩm khác'"]
  B --> C["60 giây: TRYON_TIMEOUT, nút Thử lại<br/>job phía server vẫn chạy"]
  C --> D["Thử lại trước 120 giây:<br/>gắn vào đúng job, đếm lại từ 0"]
  C --> E["120 giây: job failed"]
```

## Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| `GET /result` trước, `POST /jobs` sau | Tải lại trang, quay lại sản phẩm không có nguy cơ tạo job thừa |
| Mọi trạng thái lỗi đều giữ thông tin và ảnh trải phẳng | Không bao giờ là màn hình trống; US-07 cần thêm vào giỏ được cả khi ảnh lỗi |
| Không có phần trăm giả | US-05 mục 4 |
| Ảnh tải về lỗi dù API thành công | E22: nút **Tải lại ảnh**, gọi lại `GET /result`, không tốn lượt |
| Signed URL hết hạn lúc đang xem | E20: gọi lại `GET /result`, không báo lỗi |
