# Luồng: Xóa danh mục

> US-03 §4.4, §7 R1–R2, E5, E6, AC-06 → AC-08, AC-10 · `DELETE /api/admin/categories/:id`

```mermaid
flowchart TD
  U([Admin bấm Xóa]) --> F1{"productCount đang hiển thị > 0?"}
  F1 -- Có --> F2["Báo: đang có N sản phẩm<br/>liên kết tới danh sách đã lọc<br/>không gọi API"]
  F1 -- Không --> F3[Hộp thoại xác nhận]
  F3 -- Hủy --> END1([Không đổi])
  F3 -- "Đồng ý" --> F4[Khóa nút, gửi DELETE]
  F4 --> B1[["auth + requireRole admin"]]
  B1 --> B2{"id đúng UUID?"}
  B2 -- Không --> E404[404 NOT_FOUND]
  B2 -- Có --> D1[("rpc soft_delete_category(id)<br/>FOR UPDATE danh mục<br/>đếm sản phẩm chưa xóa")]
  D1 -- "not_found" --> E404
  D1 -- "has_products" --> E409["409 CATEGORY_HAS_PRODUCTS<br/>details.productCount"]
  D1 -- "Lỗi" --> E500[500 INTERNAL_ERROR]
  D1 -- "ok: đặt deleted_at" --> OK["200 { id }"]
  OK --> F5[Xóa khỏi danh sách + thông báo]
  E404 --> F6["'Không tìm thấy danh mục.'<br/>tải lại danh sách"]
  E409 --> F7["Báo N sản phẩm theo server<br/>tải lại danh sách để số liệu đúng"]
  E500 --> F8[Thông báo lỗi, danh mục giữ nguyên]
```

| Quy tắc | Lý do |
|---|---|
| Frontend chặn sớm nhưng backend vẫn quyết định | Số hiển thị có thể cũ, ví dụ khi thêm sản phẩm từ tab khác (E5) |
| Khóa dòng danh mục trước khi đếm | Không lọt sản phẩm mới vào danh mục đang bị xóa (AC-08). Xem `db/README.md` mục 4 |
| Sản phẩm đã xóa mềm không tính | Admin xóa hết sản phẩm phải xóa được danh mục (AC-07) |
| Xóa mềm thay vì xóa dòng | Sản phẩm đã xóa mềm vẫn trỏ về danh mục, FK `RESTRICT` sẽ chặn xóa thật |
