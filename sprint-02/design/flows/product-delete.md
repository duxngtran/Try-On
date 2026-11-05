# Luồng: Xóa sản phẩm

> US-04 §4.4, §7 R2, E12, AC-10, AC-14 · `DELETE /api/admin/products/:id`

```mermaid
flowchart TD
  U([Admin bấm Xóa]) --> F1[Hộp thoại xác nhận]
  F1 -- Hủy --> END1([Không đổi])
  F1 -- "Đồng ý" --> F2[Khóa nút, gửi DELETE]
  F2 --> B1[["auth + requireRole admin"]]
  B1 --> B2{"id đúng UUID?"}
  B2 -- Không --> E404[404 NOT_FOUND]
  B2 -- Có --> D1[("UPDATE products SET deleted_at = now<br/>WHERE id AND deleted_at IS NULL<br/>RETURNING id")]
  D1 -- "0 dòng" --> E404
  D1 -- Lỗi --> E500[500 INTERNAL_ERROR]
  D1 -- "1 dòng" --> OK["200 { id }<br/>giữ dòng và file ảnh"]
  OK --> F3["Tải lại trang hiện tại + 'Đã xóa sản phẩm'"]
  E404 --> F4["'Sản phẩm không còn tồn tại.' tải lại danh sách"]
  E500 --> F5[Thông báo lỗi, sản phẩm giữ nguyên]
```

| Quy tắc | Lý do |
|---|---|
| Không xóa file ảnh | Giỏ hàng, đơn hàng, ảnh try-on ở sprint sau có thể tham chiếu; khôi phục được bằng SQL khi lỡ tay |
| Ảnh vẫn truy cập được nếu có URL | Bucket public, ảnh không nhạy cảm (`db/README.md` mục 7.4) |
| Sprint 03, 04 phải xử lý sản phẩm đã xóa | Xem US-04 §7 "Yêu cầu chuyển cho sprint sau" |
| Xóa đồng thời với `update_product` | Khóa dòng làm 2 lệnh chạy nối tiếp. Sửa sau xóa nhận `not_found` và dọn file mới |
