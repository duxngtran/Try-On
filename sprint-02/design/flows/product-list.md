# Luồng: Danh sách sản phẩm

> US-04 §4.1, E3, AC-11, AC-12 · `GET /api/admin/products`

```mermaid
flowchart TD
  U(["Admin mở /admin/products?categoryId=&page="]) --> F1["Đọc bộ lọc, trang từ URL<br/>tải danh mục cho ô lọc (GET categories)"]
  F1 --> F2[GET /api/admin/products]
  F2 --> B1[["auth + requireRole admin"]]
  B1 --> B2["zod query: page ≥ 1, limit 1–100,<br/>categoryId là UUID nếu có"]
  B2 -- Sai --> E400[400 VALIDATION_ERROR]
  B2 -- OK --> D1[("SELECT sản phẩm + tên danh mục,<br/>count exact, WHERE deleted_at IS NULL<br/>ORDER BY created_at DESC, id DESC, range")]
  D1 -- Lỗi --> E500[500 INTERNAL_ERROR]
  D1 -- OK --> B3["Map Product: priceVnd,<br/>image.url = getPublicUrl(image_path),<br/>không gọi mạng"]
  B3 --> OK[200 items + pagination]
  OK --> F3{"Kết quả"}
  F3 -- "Có dữ liệu" --> F4[Bảng/thẻ, phân trang]
  F3 -- "Rỗng, page > 1" --> F5["Lùi về trang cuối (totalPages)<br/>vd. vừa xóa hết trang hiện tại"]
  F3 -- "Rỗng, có lọc" --> F6["'Danh mục này chưa có sản phẩm' + xóa lọc"]
  F3 -- "Rỗng, không lọc" --> F7["Trạng thái rỗng + nút Thêm sản phẩm"]
  E400 --> F8["Tham số URL sai: bỏ tham số, tải lại"]
  E500 --> F9[Thông báo lỗi + Thử lại]
```

Sắp xếp có `id` để thứ tự ổn định khi nhiều sản phẩm cùng `created_at`, tránh lặp giữa các trang. Phân trang theo offset đủ dùng cho số lượng sản phẩm của MVP.
