# Sprint 02 — API contract

> Stories: US-03, US-04 · Base URL: `VITE_API_URL` · Luồng: [`flows/`](flows/README.md) · DB: [`db/README.md`](db/README.md)

**Kế thừa sprint 01:** [`sprint-01/design/api.md`](../../sprint-01/design/api.md) giữ nguyên toàn bộ: quy ước, format response, endpoint auth và hồ sơ.

## Mục lục
1. [Thay đổi & bổ sung quy ước](#1-thay-đổi--bổ-sung-quy-ước)
2. [Bảng mã lỗi](#2-bảng-mã-lỗi)
3. [Tổng quan endpoint](#3-tổng-quan-endpoint)
4. [Danh mục](#4-danh-mục)
5. [Sản phẩm](#5-sản-phẩm)
6. [Đối tượng dữ liệu](#6-đối-tượng-dữ-liệu)

---

## 1. Thay đổi & bổ sung quy ước

| Mục | Quy ước |
|---|---|
| **Thay đổi** — "Không bao giờ trả URL public của Storage" | Nay chỉ áp dụng cho ảnh người dùng. Ảnh sản phẩm trả URL public trong `image.url` (D-46). Vẫn không có trường `image_path` |
| **Thay đổi** — `details` | Bổ sung `CATEGORY_HAS_PRODUCTS` với `{ productCount }` (mở rộng D-29) |
| Phân quyền | Mọi endpoint mới: Bearer, role `admin`. Thứ tự kiểm tra: 401 → 403 → 404 id → phần còn lại |
| Id trên path | Sai định dạng UUID trả `404 NOT_FOUND`, không gọi DB |
| Xóa | `DELETE` thành công trả `200 { "success": true, "data": { "id": "uuid" } }`. Gọi lại trả 404 |
| Bản ghi đã xóa mềm | Với API như không tồn tại |
| Giá | Số nguyên VND. Trả về kiểu number. Gửi trong multipart dạng chuỗi chữ số thuần |
| CORS | `PATCH`, `DELETE` đã nằm trong method mặc định của package `cors`, không cần đổi cấu hình |

Ngoài bảng mã riêng, mọi endpoint mới có thể trả `401 UNAUTHORIZED`, `401 TOKEN_EXPIRED`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`.

## 2. Bảng mã lỗi

Chỉ liệt kê mã mới hoặc mã cũ dùng trong ngữ cảnh mới.

| HTTP | `error.code` | Khi nào | Story | Mới? |
|---|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Body, field multipart, query sai; request không phải multipart; `PATCH` không có thay đổi | US-03 E3, US-04 E3 | Cũ |
| 400 | `CATEGORY_NOT_FOUND` | `categoryId` khi thêm/sửa sản phẩm không tồn tại hoặc đã xóa | US-04 E4 | **Mới** |
| 400 | `FILE_REQUIRED` | Thêm sản phẩm thiếu file `image` | US-04 E5 | Cũ |
| 400 | `INVALID_FILE_TYPE` | Không phải JPEG/PNG/WEBP; ảnh động | US-04 E6 | Cũ |
| 400 | `INVALID_IMAGE` | File hỏng | US-04 E7 | Cũ |
| 400 | `IMAGE_TOO_LARGE` | Cạnh dài > 8000 px | US-04 E9 | Cũ |
| 400 | `IMAGE_TOO_SMALL` | Cạnh ngắn < 512 px; message riêng cho sản phẩm | US-04 E10 | Cũ |
| 400 | `INVALID_ASPECT_RATIO` | Cạnh dài / cạnh ngắn > 3; message riêng cho sản phẩm | US-04 E11 | Cũ |
| 404 | `NOT_FOUND` | Id sai định dạng, không tồn tại, đã xóa | US-03 E6, US-04 E12 | Cũ |
| 409 | `CATEGORY_NAME_EXISTS` | Trùng tên danh mục, kể cả race | US-03 E4 | **Mới** |
| 409 | `CATEGORY_HAS_PRODUCTS` | Xóa danh mục còn sản phẩm | US-03 E5 | **Mới** |
| 413 | `FILE_TOO_LARGE` | Ảnh > `PRODUCT_IMAGE_MAX_MB`; message "Ảnh tối đa 10 MB." | US-04 E8 | Cũ |
| 429 | `TOO_MANY_REQUESTS` | Vượt `PRODUCT_WRITES_PER_HOUR`; có `details.retryAfterSeconds` (D-34) | US-04 E13 | Cũ |
| 500 | `UPLOAD_FAILED` | Tải file lên Storage lỗi | US-04 E14 | Cũ |

## 3. Tổng quan endpoint

| Method | Path | Mục đích | Story | Luồng |
|---|---|---|---|---|
| GET | `/api/admin/categories` | Danh sách kèm số sản phẩm | US-03 | [category-list](flows/category-list.md) |
| POST | `/api/admin/categories` | Thêm | US-03 | [category-save](flows/category-save.md) |
| PATCH | `/api/admin/categories/:id` | Đổi tên | US-03 | [category-save](flows/category-save.md) |
| DELETE | `/api/admin/categories/:id` | Xóa mềm | US-03 | [category-delete](flows/category-delete.md) |
| GET | `/api/admin/products` | Danh sách, phân trang, lọc | US-04 | [product-list](flows/product-list.md) |
| GET | `/api/admin/products/:id` | Chi tiết để sửa | US-04 | [product-update](flows/product-update.md) |
| POST | `/api/admin/products` | Thêm kèm ảnh | US-04 | [product-create](flows/product-create.md) |
| PATCH | `/api/admin/products/:id` | Sửa thông tin và/hoặc ảnh | US-04 | [product-update](flows/product-update.md) |
| DELETE | `/api/admin/products/:id` | Xóa mềm | US-04 | [product-delete](flows/product-delete.md) |

Chưa có endpoint cho người mua; thuộc Epic 3 (D-53).

## 4. Danh mục

### 4.1 `GET /api/admin/categories`

Không phân trang vì số danh mục nhỏ. Thứ tự `created_at` tăng dần, `id` tăng dần.

**200**
```json
{ "success": true, "data": { "categories": [ Category ] } }
```

### 4.2 `POST /api/admin/categories`

**Request** `{ "name": "Áo khoác" }`

| Trường | Validation (zod, FE + BE) |
|---|---|
| `name` | Chuỗi, bắt buộc. `normalize('NFC')`, trim, gộp khoảng trắng. 2–50 ký tự. Không có ký tự điều khiển. Trùng → 409 |

**201** → `{ "success": true, "data": { "category": Category } }` với `productCount = 0`.

| Lỗi | Mã |
|---|---|
| 400 | `VALIDATION_ERROR` (details theo `name`) |
| 409 | `CATEGORY_NAME_EXISTS` — "Danh mục này đã tồn tại." |

### 4.3 `PATCH /api/admin/categories/:id`

**Request** `{ "name": "Váy đầm" }` — validation như 4.2. Gửi đúng tên hiện tại vẫn 200.

**200** → `{ category }` với `productCount` hiện tại.

| Lỗi | Mã |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 404 | `NOT_FOUND` — "Không tìm thấy danh mục." |
| 409 | `CATEGORY_NAME_EXISTS` |

### 4.4 `DELETE /api/admin/categories/:id`

**200** → `{ "success": true, "data": { "id": "uuid" } }`

| Lỗi | Mã | Ghi chú |
|---|---|---|
| 404 | `NOT_FOUND` | |
| 409 | `CATEGORY_HAS_PRODUCTS` | `details: { "productCount": 3 }`, message "Danh mục đang có 3 sản phẩm. Hãy chuyển hoặc xóa các sản phẩm này trước." |

Sản phẩm đã xóa mềm không được tính.

## 5. Sản phẩm

### 5.1 `GET /api/admin/products`

| Query | Validation | Mặc định |
|---|---|---|
| `page` | Số nguyên ≥ 1 | 1 |
| `limit` | Số nguyên 1–100 | 20 |
| `categoryId` | UUID, tùy chọn. Danh mục không tồn tại trả danh sách rỗng | — |

Thứ tự `created_at` giảm dần, `id` giảm dần. `page` vượt quá trả `items: []`, không lỗi.

**200**
```json
{ "success": true, "data": {
  "items": [ Product ],
  "pagination": { "page": 1, "limit": 20, "total": 25, "totalPages": 2 } } }
```

| Lỗi | Mã |
|---|---|
| 400 | `VALIDATION_ERROR` (details theo tên query) |

### 5.2 `GET /api/admin/products/:id`

**200** → `{ product }`. **404** `NOT_FOUND` — "Sản phẩm không còn tồn tại."

### 5.3 `POST /api/admin/products`

Rate limit: `PRODUCT_WRITES_PER_HOUR` (120) request / admin / giờ, dùng chung với `PATCH`, đếm cả request bị từ chối.

**Request** `multipart/form-data`:

| Field | Loại | Validation |
|---|---|---|
| `name` | text | Chuẩn hóa như tên danh mục; 2–120 ký tự |
| `priceVnd` | text | `^[0-9]+$`; 1.000 – 100.000.000 |
| `categoryId` | text | UUID |
| `image` | file | 1 file, các kiểm tra ở bảng dưới |

Giới hạn multer: 1 file, tối đa 3 field chữ, mỗi field ≤ 1 KB. Không tin `Content-Type` và tên file của part.

| Kiểm tra (theo thứ tự) | Lỗi |
|---|---|
| Rate limit | 429 `TOO_MANY_REQUESTS` |
| Là multipart, multer đọc được, đúng field, không quá số lượng | 400 `VALIDATION_ERROR` |
| File ≤ 10 MB | 413 `FILE_TOO_LARGE` |
| `name`, `priceVnd`, `categoryId` hợp lệ | 400 `VALIDATION_ERROR` |
| Có file `image` | 400 `FILE_REQUIRED` |
| Danh mục còn hiệu lực | 400 `CATEGORY_NOT_FOUND` |
| Magic bytes JPEG/PNG/WEBP, không phải ảnh động | 400 `INVALID_FILE_TYPE` |
| Decode được | 400 `INVALID_IMAGE` |
| Cạnh dài ≤ 8000 px (sau EXIF) | 400 `IMAGE_TOO_LARGE` |
| Cạnh ngắn ≥ 512 px | 400 `IMAGE_TOO_SMALL` |
| Cạnh dài / cạnh ngắn ≤ 3 | 400 `INVALID_ASPECT_RATIO` |
| Upload Storage | 500 `UPLOAD_FAILED` |
| `create_product` trả `category_not_found` (danh mục vừa bị xóa) | 400 `CATEGORY_NOT_FOUND`, file mới bị xóa |
| Ghi DB lỗi | 500 `INTERNAL_ERROR`, file mới bị xóa |

Xử lý ảnh: xoay EXIF → resize cạnh dài 2048 (không phóng to) → nền trắng nếu có alpha → JPEG quality 90, chroma 4:4:4, sRGB, không metadata → `product-images/<productId>/<uuid>.jpg`.

**201** → `{ "success": true, "data": { "product": Product } }`, `image.version = 1`.

### 5.4 `PATCH /api/admin/products/:id`

Cùng rate limit với `POST`.

**Request** `multipart/form-data`, luôn multipart kể cả không có ảnh. Cùng các field như 5.3 nhưng tất cả tùy chọn. Field có mặt phải hợp lệ; `name=""` là lỗi, không phải "giữ nguyên". Không có field nào và không có file → 400 `VALIDATION_ERROR`.

Kiểm tra theo thứ tự như 5.3, trừ `FILE_REQUIRED`, thêm:

| Kiểm tra | Lỗi |
|---|---|
| Sản phẩm tồn tại, chưa xóa (kiểm tra sớm, trước khi xử lý ảnh) | 404 `NOT_FOUND` |
| `update_product` trả `not_found` (vừa bị xóa) | 404 `NOT_FOUND`, file mới bị xóa |
| `update_product` trả `category_not_found` | 400 `CATEGORY_NOT_FOUND`, file mới bị xóa |

**200** → `{ product }`. Có ảnh mới thì `image.version` tăng 1 và `image.url` đổi. Mọi lỗi 4xx/5xx: sản phẩm không đổi. Xóa file cũ lỗi vẫn trả 200, log `ORPHAN_PRODUCT_IMAGE`.

**Vì sao một request multipart thay vì tách `PATCH` JSON + `PUT /image`:** form sửa chỉ có một nút Lưu. Tách 2 request sẽ có trạng thái lưu một phần (tên đã đổi, ảnh lỗi), phải báo lỗi phức tạp. Một request cho phép ghi cả tên và ảnh trong một lần gọi `update_product`.

### 5.5 `DELETE /api/admin/products/:id`

Xóa mềm, giữ file ảnh.

**200** → `{ "success": true, "data": { "id": "uuid" } }`. **404** `NOT_FOUND`.

Không tính vào rate limit vì không xử lý ảnh.

## 6. Đối tượng dữ liệu

### 6.1 `Category`
```json
{ "id": "uuid", "name": "Áo thun", "productCount": 12,
  "createdAt": "2026-11-05T08:00:00.000Z", "updatedAt": "2026-11-05T08:00:00.000Z" }
```

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `productCount` | integer | Chỉ đếm sản phẩm chưa xóa |

### 6.2 `Product`
```json
{
  "id": "uuid",
  "name": "Áo thun trắng",
  "priceVnd": 199000,
  "category": { "id": "uuid", "name": "Áo thun" },
  "image": {
    "url": "https://<ref>.supabase.co/storage/v1/object/public/product-images/<productId>/<uuid>.jpg",
    "version": 1
  },
  "createdAt": "2026-11-05T08:00:00.000Z",
  "updatedAt": "2026-11-05T08:00:00.000Z"
}
```

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `priceVnd` | integer | FE hiển thị bằng `Intl.NumberFormat('vi-VN')` + `₫` |
| `category` | object | Luôn là danh mục còn hiệu lực, vì không xóa được danh mục còn sản phẩm |
| `image.url` | string | Public, không hết hạn |
| `image.version` | integer | Epic 3 dùng trong khóa cache |
| `createdAt`, `updatedAt` | ISO string | Chuẩn hóa bằng `toISOString()` (xem `common_errors.md`) |
