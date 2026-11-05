# Luồng: Sửa sản phẩm và thay ảnh

> US-04 §4.3, §7 R3–R4, R7, E3–E17, AC-05 → AC-09, AC-14 · `GET`, `PATCH /api/admin/products/:id` · D-25 (kế thừa thứ tự)

## 1. Frontend

```mermaid
flowchart TD
  U0(["Admin mở /admin/products/:id/edit"]) --> F0["GET sản phẩm + GET danh mục"]
  F0 -- "404" --> F01["'Sản phẩm không còn tồn tại.' về danh sách"]
  F0 -- OK --> F1[Điền form, hiện ảnh hiện tại]
  F1 --> U1([Admin sửa, có thể chọn ảnh mới])
  U1 --> F2{"So với dữ liệu gốc: có thay đổi?"}
  F2 -- Không --> F3[Nút Lưu tắt]
  F2 -- Có --> F4{"Validate như form thêm"}
  F4 -- Sai --> F5[Lỗi dưới ô tương ứng]
  F4 -- OK --> U2([Bấm Lưu])
  U2 --> F6["PATCH FormData, chỉ trường đã đổi<br/>có ảnh thì hiện tiến trình"]
  F6 --> F7{Response}
  F7 -- 200 --> F8["'Đã cập nhật sản phẩm', về danh sách"]
  F7 -- 404 --> F01
  F7 -- "CATEGORY_NOT_FOUND" --> F9[Báo lỗi, tải lại danh mục, giữ form]
  F7 -- "Lỗi khác" --> F10[Lỗi theo error.code, giữ form và ảnh chọn]
```

Admin rời trang khi có thay đổi chưa lưu: hỏi xác nhận.

## 2. Backend

```mermaid
flowchart TD
  R(["PATCH /api/admin/products/:id"]) --> M1[["auth + requireRole admin"]]
  M1 --> M2{"id đúng UUID?"}
  M2 -- Không --> E404[404 NOT_FOUND]
  M2 -- Có --> M3{"Rate limit"}
  M3 -- Vượt --> E429[429 TOO_MANY_REQUESTS]
  M3 -- OK --> M4["multipart + multer như thêm sản phẩm"]
  M4 -- "Quá dung lượng" --> E413[413 FILE_TOO_LARGE]
  M4 -- "Không phải multipart, lỗi khác" --> E400[400 VALIDATION_ERROR]
  M4 -- OK --> V1["zod: trường tùy chọn;<br/>có mặt thì phải hợp lệ"]
  V1 -- Sai --> E400
  V1 -- OK --> V2{"Có trường hoặc file?"}
  V2 -- Không --> E400
  V2 -- Có --> V3[("Sản phẩm tồn tại, chưa xóa?")]
  V3 -- Không --> E404
  V3 -- Có --> V4{"Có categoryId?"}
  V4 -- Có --> V5[("Danh mục còn hiệu lực?")]
  V5 -- Không --> E_C[400 CATEGORY_NOT_FOUND]
  V5 -- Có --> V6{"Có file?"}
  V4 -- Không --> V6
  V6 -- Không --> D1
  V6 -- Có --> I1["processProductImage"]
  I1 -- Sai --> E_I[400 lỗi ảnh]
  I1 -- OK --> S1["Storage upload productId/uuid-mới.jpg"]
  S1 -- Lỗi --> E_U["500 UPLOAD_FAILED<br/>sản phẩm không đổi"]
  S1 -- OK --> D1[("rpc update_product<br/>FOR UPDATE sản phẩm, kiểm danh mục,<br/>ghi mọi trường + image_version + 1 nếu có ảnh")]
  D1 -- "not_found / category_not_found" --> R1["Có file mới thì remove file mới"]
  R1 --> E2["404 NOT_FOUND / 400 CATEGORY_NOT_FOUND"]
  D1 -- "Lỗi DB" --> R2["Có file mới thì remove file mới"]
  R2 --> E500[500 INTERNAL_ERROR]
  D1 -- ok --> D3{"out_old_image_path?"}
  D3 -- Có --> D4["Storage remove file cũ, thử lại 1 lần;<br/>vẫn lỗi log ORPHAN_PRODUCT_IMAGE + productId"]
  D3 -- Không --> D5
  D4 -.-> D5[("Đọc lại sản phẩm + danh mục")]
  D5 --> OK[200 product]
```

## 3. Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Thứ tự **upload mới → ghi DB → xóa cũ** | Giống D-25. Trước khi ghi DB, sản phẩm vẫn trỏ ảnh cũ (AC-08) |
| Ghi mọi trường trong một lần gọi `update_product` | Không có trạng thái "đổi tên rồi nhưng ảnh lỗi" |
| Xóa file cũ lỗi không làm request lỗi | Dữ liệu mới đã có hiệu lực; báo lỗi lúc này là báo sai (E16) |
| Hàm trả `out_old_image_path` từ dòng đã khóa | 2 lần thay ảnh đồng thời: mỗi request xóa đúng file mình thay thế, không mất dấu file nào (T-54) |
| Đổi tên, giá, danh mục không tăng `image_version` | Không làm mất cache try-on vốn chỉ phụ thuộc ảnh. Nếu Epic 3 đưa loại trang phục vào prompt thì cân nhắc lại với đổi danh mục |
| Sửa cùng lúc: ghi sau đè ghi trước | Chỉ có 1 tài khoản admin (D-32) |
