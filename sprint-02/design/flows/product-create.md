# Luồng: Thêm sản phẩm

> US-04 §4.2, §6, E3–E11, E13–E15, E17, E18, AC-01 → AC-05, AC-12 · `POST /api/admin/products` · D-12, D-25 (kế thừa kỹ thuật)

## 1. Frontend

```mermaid
flowchart TD
  U0([Admin mở /admin/products/new]) --> F0[Tải danh mục]
  F0 --> F00{"Có danh mục?"}
  F00 -- Không --> F01["'Cần tạo danh mục trước' + liên kết<br/>khóa nút Lưu (E18)"]
  F00 -- Có --> U1([Nhập tên, giá, chọn danh mục, chọn ảnh])
  U1 --> F1{"Giá đúng mẫu nhóm 3 chữ số?<br/>199.000 đúng, 199.5 sai"}
  F1 -- Sai --> Fe[Lỗi dưới ô tương ứng, không gửi]
  F1 -- OK --> F2{"Ảnh: loại, ≤ 10 MB,<br/>cạnh ngắn ≥ 512, cạnh dài ≤ 8000,<br/>tỉ lệ ≤ 3"}
  F2 -- Sai --> Fe
  F2 -- OK --> F3[Xem trước + hướng dẫn flat lay]
  F3 --> U2([Bấm Lưu])
  U2 --> F4["POST FormData, priceVnd là chữ số thuần<br/>thanh tiến trình, khóa nút"]
  F4 --> F5{Response}
  F5 -- 201 --> F6["Về danh sách + 'Đã thêm sản phẩm'"]
  F5 -- "CATEGORY_NOT_FOUND" --> F7[Báo lỗi, tải lại danh mục, giữ form]
  F5 -- "4xx khác, 500" --> F8[Lỗi theo error.code, giữ form và ảnh]
  F5 -- "Mất mạng" --> F9["'Mất kết nối, vui lòng thử lại.' giữ form và ảnh"]
```

## 2. Backend

```mermaid
flowchart TD
  R([POST /api/admin/products]) --> M1[["auth + requireRole admin"]]
  M1 --> M2{"Rate limit theo admin<br/>PRODUCT_WRITES_PER_HOUR"}
  M2 -- Vượt --> E429[429 TOO_MANY_REQUESTS]
  M2 -- OK --> M3{"Là multipart?"}
  M3 -- Không --> E400[400 VALIDATION_ERROR]
  M3 -- Có --> M4["multer memoryStorage<br/>field image, 1 file, ≤ 10 MB,<br/>3 field chữ, mỗi field ≤ 1 KB"]
  M4 -- "LIMIT_FILE_SIZE" --> E413[413 FILE_TOO_LARGE]
  M4 -- "Lỗi khác" --> E400
  M4 -- OK --> V1["zod: name, priceVnd, categoryId"]
  V1 -- Sai --> E400
  V1 -- OK --> V2{"Có file image?"}
  V2 -- Không --> E_F[400 FILE_REQUIRED]
  V2 -- Có --> V3[("Danh mục tồn tại, chưa xóa?")]
  V3 -- Không --> E_C[400 CATEGORY_NOT_FOUND]
  V3 -- Có --> I1["processProductImage:<br/>magic bytes → header → kích thước, tỉ lệ sau EXIF<br/>→ xoay, resize 2048, nền trắng,<br/>JPEG q90 4:4:4, sRGB, không metadata"]
  I1 -- Sai --> E_I["400 INVALID_FILE_TYPE / INVALID_IMAGE /<br/>IMAGE_TOO_LARGE / IMAGE_TOO_SMALL /<br/>INVALID_ASPECT_RATIO"]
  I1 -- OK --> S1["productId = randomUUID()<br/>path = productId/uuid.jpg"]
  S1 --> S2["Storage upload<br/>upsert false, cacheControl 7 ngày"]
  S2 -- Lỗi --> E_U["500 UPLOAD_FAILED<br/>DB chưa đổi"]
  S2 -- OK --> D1[("rpc create_product<br/>FOR SHARE danh mục → INSERT")]
  D1 -- "category_not_found" --> R1["Storage remove(path)<br/>thử lại 1 lần"]
  R1 --> E_C
  D1 -- "Lỗi DB" --> R2["Storage remove(path)<br/>thử lại 1 lần; vẫn lỗi log ORPHAN_PRODUCT_IMAGE"]
  R2 --> E500[500 INTERNAL_ERROR]
  D1 -- ok --> D2[("Đọc lại sản phẩm + danh mục")]
  D2 --> OK["201 product, image.version = 1"]
```

## 3. Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Kiểm tra trường và danh mục **trước** khi xử lý ảnh | Không tốn CPU sharp và không tạo file cho request chắc chắn sai |
| Backend sinh `productId` trước khi upload | Đường dẫn ảnh chứa id; CHECK ở DB bảo đảm ảnh thuộc đúng sản phẩm |
| Thứ tự **upload → ghi DB**, DB lỗi thì xóa file | Không bao giờ có sản phẩm trỏ tới file không tồn tại |
| Kiểm tra danh mục 2 lần: trước khi xử lý ảnh và trong `create_product` | Lần đầu để trả lỗi sớm, lần sau là chốt chặn chống race (US-03 AC-08) |
| Rate limit đặt **trước** multer | Giống D-31: chặn trước khi nhận file vào bộ nhớ |
