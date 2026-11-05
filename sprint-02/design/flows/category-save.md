# Luồng: Thêm và đổi tên danh mục

> US-03 §4.2, §4.3, E3, E4, E6, E7, AC-02 → AC-05, AC-10 · `POST /api/admin/categories`, `PATCH /api/admin/categories/:id`

```mermaid
flowchart TD
  U([Admin nhập tên, bấm Lưu]) --> F1{"Frontend validate<br/>sau chuẩn hóa: 2–50 ký tự"}
  F1 -- Sai --> F1a[Lỗi dưới ô tên, không gửi]
  F1 -- OK --> F2["Khóa nút, gửi POST hoặc PATCH"]
  F2 --> B1[["auth + requireRole admin"]]
  B1 --> B2{"PATCH: id đúng UUID?"}
  B2 -- Không --> E404[404 NOT_FOUND]
  B2 -- "Có, hoặc là POST" --> B3["zod: NFC, trim, gộp khoảng trắng,<br/>2–50 ký tự, không ký tự điều khiển"]
  B3 -- Sai --> E400[400 VALIDATION_ERROR]
  B3 -- OK --> B4{POST hay PATCH}
  B4 -- POST --> D1[("INSERT categories")]
  B4 -- PATCH --> D2[("UPDATE name<br/>WHERE id AND deleted_at IS NULL")]
  D1 -- "23505 trùng tên" --> E409[409 CATEGORY_NAME_EXISTS]
  D2 -- "23505 trùng tên" --> E409
  D2 -- "0 dòng" --> E404
  D1 -- "Lỗi khác" --> E500[500 INTERNAL_ERROR]
  D2 -- "Lỗi khác" --> E500
  D1 -- OK --> OK201["201 category, productCount = 0"]
  D2 -- OK --> D3[("Đếm sản phẩm chưa xóa")]
  D3 --> OK200[200 category]
  OK201 --> F3[Cập nhật danh sách + thông báo]
  OK200 --> F3
  E400 --> F4[Lỗi dưới ô tên, giữ nội dung]
  E409 --> F4
  E404 --> F5["'Không tìm thấy danh mục.'<br/>đóng form, tải lại danh sách"]
  E500 --> F6[Thông báo lỗi, giữ nội dung]
```

| Quy tắc | Lý do |
|---|---|
| Chống trùng dựa vào unique index, **không** kiểm tra trước bằng `SELECT` | `SELECT` rồi `INSERT` vẫn có race (AC-03) |
| Chuẩn hóa NFC trước khi ghi | Cùng chữ "Á" có thể có 2 dạng mã hóa, unique index sẽ coi là khác nhau |
| Danh mục đã xóa không giữ chỗ tên | Unique index một phần `WHERE deleted_at IS NULL` |
