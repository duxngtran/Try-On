# Sprint 04 — API contract

> Stories: US-07, US-08, US-09 · Base URL: `VITE_API_URL` · Luồng: [`flows/`](flows/README.md) · DB: [`db/README.md`](db/README.md)

**Kế thừa:** `sprint-01/design/api.md`, `sprint-02/design/api.md`, `sprint-03/design/api.md` giữ nguyên toàn bộ, kể cả format `{ success, data }` / `{ success: false, error: { code, message, details? } }`.

## Mục lục
1. [Quy ước](#1-quy-ước)
2. [Bảng mã lỗi](#2-bảng-mã-lỗi)
3. [Tổng quan endpoint](#3-tổng-quan-endpoint)
4. [Giỏ hàng](#4-giỏ-hàng)
5. [Đơn hàng của người mua](#5-đơn-hàng-của-người-mua)
6. [Đơn hàng phía admin](#6-đơn-hàng-phía-admin)
7. [Đối tượng dữ liệu](#7-đối-tượng-dữ-liệu)
8. [Thay đổi ở API cũ](#8-thay-đổi-ở-api-cũ)

---

## 1. Quy ước

| Mục | Quy ước |
|---|---|
| Phân quyền | `/cart*`, `/orders*`: Bearer, role `user`. `/admin/orders*`: Bearer, role `admin`. Thứ tự: 401 → 403 → 404 id → rate limit → body |
| Chủ sở hữu | Luôn là `req.user.id`. **Không có** tham số người dùng trên path, query, body |
| Id trên path | Sai định dạng UUID trả `404 NOT_FOUND`, không gọi DB (`validateUuidParam`) |
| Tiền | Số nguyên VND, kiểu number. Tổng đơn tối đa 3 × 10¹⁰, an toàn trong số JS |
| Client không gửi | Giá, tổng tiền, tên sản phẩm, dòng đơn. Trường thừa bị bỏ qua |
| Không trả | `image_path`, `added_price_vnd`, `user_id`, `idempotency_key` |
| Ảnh | Chỉ URL public của ảnh trải phẳng (D-46). **Không bao giờ** có ảnh try-on, ảnh hồ sơ |
| GenAI | Không endpoint nào ở đây tạo job, tính lượt, tính ngân sách |
| `Cache-Control` | `no-store` trên `GET /orders*`, `GET /admin/orders*` vì có dữ liệu cá nhân |
| Log | Chỉ `userId`, `orderId`, mã lỗi. **Không** có họ tên, số điện thoại, địa chỉ |

Ngoài bảng mã riêng, mọi endpoint có thể trả `401 UNAUTHORIZED`, `401 TOKEN_EXPIRED`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`.

## 2. Bảng mã lỗi

| HTTP | `error.code` | Khi nào | `details` | Story | Mới? |
|---|---|---|---|---|---|
| 400 | `VALIDATION_ERROR` | `productId`, `quantity`, `recipient.*`, `idempotencyKey`, `cartFingerprint`, `page`, `limit` sai | `[{ field, message }]` | US-07, US-08, US-09 | Cũ |
| 404 | `NOT_FOUND` | Sản phẩm không có, đã xóa; dòng không có trong giỏ; đơn không có hoặc của người khác | — | US-07 E1, US-08 E1, E2, E14 | Cũ |
| 409 | `CART_QUANTITY_LIMIT` | Vượt số lượng mỗi sản phẩm | `{ maxQuantity }` | US-07 E2, US-08 E3 | **Mới** |
| 409 | `CART_FULL` | Vượt số dòng | `{ maxLines }` | US-07 E3 | **Mới** |
| 409 | `CART_EMPTY` | Đặt khi giỏ rỗng | — | US-08 E4 | **Mới** |
| 409 | `CART_HAS_UNAVAILABLE` | Đặt khi có dòng ngừng bán | — | US-08 E5 | **Mới** |
| 409 | `CART_CHANGED` | `cartFingerprint` lệch giỏ hiện tại | — | US-08 E6 | **Mới** |
| 429 | `TOO_MANY_REQUESTS` | Vượt rate limit | `{ retryAfterSeconds }` (D-34) | US-07 E4, US-08 E10 | Cũ |

## 3. Tổng quan endpoint

| Method | Path | Mục đích | Role | Rate limit | Story | Luồng |
|---|---|---|---|---|---|---|
| GET | `/api/cart` | Giỏ, tổng tiền, `fingerprint` | user | Giỏ | US-07, US-08 | [cart-view](flows/cart-view.md) |
| POST | `/api/cart/items` | Thêm, hoặc tăng 1 | user | Giỏ | US-07 | [cart-add](flows/cart-add.md) |
| PATCH | `/api/cart/items/:productId` | Đặt số lượng tuyệt đối | user | Giỏ | US-08 | [cart-view](flows/cart-view.md) |
| DELETE | `/api/cart/items/:productId` | Bỏ dòng | user | Giỏ | US-08 | [cart-view](flows/cart-view.md) |
| POST | `/api/orders` | Đặt hàng | user | Tạo đơn | US-08 | [order-place](flows/order-place.md) |
| GET | `/api/orders` | Đơn của tôi | user | Đọc đơn | US-08 | [order-view](flows/order-view.md) |
| GET | `/api/orders/:id` | Một đơn của tôi | user | Đọc đơn | US-08 | [order-view](flows/order-view.md) |
| GET | `/api/admin/orders` | Danh sách đơn | admin | — | US-09 | [admin-orders](flows/admin-orders.md) |
| GET | `/api/admin/orders/:id` | Chi tiết đơn | admin | — | US-09 | [admin-orders](flows/admin-orders.md) |

**Rate limit:** in-memory theo user, đếm mọi request như D-31. Giỏ: `CART_REQUESTS_PER_MIN` = 120/phút (D-149). Tạo đơn: `ORDER_CREATES_PER_HOUR` = 20/giờ. Đọc đơn: `ORDER_READS_PER_MIN` = 120/phút (D-148). Admin không có rate limit đọc, giống `GET /admin/products`. Không phải chốt nghiệp vụ: giới hạn số lượng và chống trùng nằm ở DB.

## 4. Giỏ hàng

Mọi endpoint thành công trong mục này trả **cùng một dạng** `data: Cart` (mục 7.1), để FE cập nhật tổng và `fingerprint` từ một nguồn.

### 4.1 `GET /api/cart`

**200** → `Cart`. Giỏ rỗng: `items: []`, `totalVnd: 0`, `itemCount: 0`, `fingerprint: null`, `limits` vẫn có.

Sản phẩm xóa mềm vẫn nằm trong `items`, `available: false` (D-143).

### 4.2 `POST /api/cart/items`

**Request** `{ "productId": "uuid" }`.

**200** → `Cart`. Chưa có thì tạo dòng số lượng 1, có rồi thì +1. Không idempotent: FE khóa nút trong lúc gửi, không tự gửi lại (US-07 R3).

| Lỗi | Mã | Ghi chú |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `productId` không phải UUID |
| 404 | `NOT_FOUND` | "Sản phẩm này không còn bán." |
| 409 | `CART_QUANTITY_LIMIT` | `details.maxQuantity`, số lượng giữ nguyên |
| 409 | `CART_FULL` | `details.maxLines` |

### 4.3 `PATCH /api/cart/items/:productId`

**Request** `{ "quantity": 3 }`, số nguyên ≥ 1. Số tuyệt đối: gửi lại không cộng dồn; hai tab thì ghi sau đè ghi trước, `fingerprint` bắt được khi đặt hàng.

**200** → `Cart`.

| Lỗi | Mã | Ghi chú |
|---|---|---|
| 400 | `VALIDATION_ERROR` | `0`, âm, số lẻ, chuỗi |
| 404 | `NOT_FOUND` | Không có trong giỏ, hoặc sản phẩm đã ngừng bán. FE tải lại `GET /cart` |
| 409 | `CART_QUANTITY_LIMIT` | Lớn hơn `CART_MAX_QUANTITY` |

### 4.4 `DELETE /api/cart/items/:productId`

**200** → `Cart`. Idempotent: dòng đã mất vẫn 200. Xóa được dòng ngừng bán. Dùng `validateUuidParam` nên id sai vẫn 404.

## 5. Đơn hàng của người mua

### 5.1 `POST /api/orders`

**Request**
```json
{
  "idempotencyKey": "uuid do client sinh một lần khi mở form",
  "cartFingerprint": "fingerprint của GET /cart mà người mua đã xem",
  "recipient": { "name": "Nguyễn Văn A", "phone": "0912345678", "address": "12 Lê Lợi, Quận 1, TP. HCM" }
}
```

Chuẩn hóa và quy tắc từng trường: `US-08.md` mục 6. Backend lưu `phone` đã chuẩn hóa.

| Kết quả | HTTP | `data` |
|---|---|---|
| Tạo đơn mới, giỏ về rỗng | **201** | `Order` |
| Đã có đơn cùng `idempotencyKey`, kể cả khi `recipient` khác | **200** | `Order` đã có |

Cả chuỗi kiểm và ghi là một transaction trong `place_order`. Thứ tự: khóa trùng → giỏ rỗng → dòng ngừng bán → `fingerprint`.

| Lỗi | Mã | FE làm gì |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Lỗi dưới từng ô |
| 409 | `CART_EMPTY` | Link "Đơn của tôi" |
| 409 | `CART_HAS_UNAVAILABLE` | Về `/cart` |
| 409 | `CART_CHANGED` | Ở lại, tải lại `GET /cart`, người mua xác nhận lại. **Không tự gửi lại.** Dùng lại cùng khóa được vì chưa có đơn |
| 429 | `TOO_MANY_REQUESTS` | Đếm ngược, giữ form |
| Không có response | — | Thử lại **cùng khóa** |

**Lỗi 500 phải làm sạch:** repository bắt lỗi rpc, thay bằng lỗi chỉ có mã. Lỗi ràng buộc của Postgres có `details` "Failing row contains (...)" với địa chỉ, số điện thoại, và `errorHandler` ở môi trường dev log nguyên đối tượng lỗi.

### 5.2 `GET /api/orders`

| Query | Validation |
|---|---|
| `page` | Số nguyên ≥ 1, mặc định 1 |
| `limit` | Số nguyên 1–50, mặc định 20 |

**200** `{ "items": [ OrderSummary ], "pagination": { "page", "limit", "total", "totalPages" } }`. Mới nhất trước. Trang vượt tổng trả `items: []`, `total` thật (D-65).

### 5.3 `GET /api/orders/:id`

**200** → `Order`. Đơn của người khác và đơn không tồn tại đều 404 `NOT_FOUND`, cùng một thông báo.

## 6. Đơn hàng phía admin

Chỉ đọc. Không có `POST`, `PATCH`, `DELETE` nào; gọi vào sẽ gặp 404 của router.

### 6.1 `GET /api/admin/orders`

Query như 5.2. **200** `{ "items": [ AdminOrderSummary ], "pagination": ... }`, `created_at` giảm dần, `id` giảm dần.

### 6.2 `GET /api/admin/orders/:id`

**200** → `AdminOrder`. 404 `NOT_FOUND` nếu không có.

## 7. Đối tượng dữ liệu

### 7.1 `Cart`

```json
{
  "items": [ CartItem ],
  "itemCount": 3,
  "lineCount": 2,
  "totalVnd": 848000,
  "hasUnavailable": false,
  "fingerprint": "32 ký tự hex hoặc null",
  "limits": { "maxQuantity": 10, "maxLines": 30 }
}
```

| Trường | Ghi chú |
|---|---|
| `itemCount` | Tổng số lượng mọi dòng, **kể cả dòng ngừng bán**: số trên header dẫn người mua vào xử lý |
| `totalVnd` | Do DB tính theo giá hiện tại, không tính dòng ngừng bán |
| `hasUnavailable` | `true` thì FE tắt nút đặt hàng |
| `limits` | D-155. `maxQuantity` (`CART_MAX_QUANTITY`), `maxLines` (`CART_MAX_LINES`) lấy từ env, có trong mọi `Cart` kể cả giỏ rỗng. FE dùng để biết giới hạn mà không phải đợi lỗi 409; số 10 và 30 ở ví dụ chỉ là mặc định |
| `fingerprint` | Client coi là chuỗi mờ. Không phải chốt bảo mật, chỉ để phát hiện thay đổi (D-144) |

### 7.2 `CartItem`

```json
{
  "productId": "uuid",
  "name": "Áo thun trắng",
  "category": { "id": "uuid", "name": "Áo thun" },
  "image": { "url": "https://<ref>.supabase.co/storage/v1/object/public/product-images/...", "version": 1 },
  "quantity": 2,
  "priceVnd": 199000,
  "lineTotalVnd": 398000,
  "priceChangedFrom": null,
  "available": true
}
```

| Trường | Ghi chú |
|---|---|
| `priceChangedFrom` | Giá lúc thêm gần nhất, chỉ khi khác `priceVnd`, ngược lại `null`. Dòng ngừng bán: `null` |
| `available: false` | `priceVnd: null`, `lineTotalVnd: 0`. `name`, `image` vẫn có (D-42) |

### 7.3 `OrderSummary`

```json
{ "id": "uuid", "code": "DH000123", "createdAt": "2026-11-06T02:00:00.000Z", "itemCount": 3, "totalVnd": 848000 }
```

`code` = `DH` + `order_no` đệm đủ 6 chữ số; vượt 6 chữ số thì giữ nguyên.

### 7.4 `Order`

```json
{
  "id": "uuid",
  "code": "DH000123",
  "createdAt": "2026-11-06T02:00:00.000Z",
  "itemCount": 3,
  "totalVnd": 848000,
  "recipient": { "name": "Nguyễn Văn A", "phone": "0912345678", "address": "12 Lê Lợi, Quận 1, TP. HCM" },
  "items": [ OrderItem ]
}
```

### 7.5 `OrderItem`

```json
{
  "productId": "uuid",
  "name": "Áo thun trắng",
  "unitPriceVnd": 199000,
  "quantity": 2,
  "lineTotalVnd": 398000,
  "image": { "url": "https://.../product-images/...", "version": 1 },
  "stillOnSale": true
}
```

`name`, `unitPriceVnd`, `quantity`, `lineTotalVnd` là **bản chụp**. `image`, `stillOnSale` đọc từ `products` hiện tại (D-142); `stillOnSale = false` khi sản phẩm đã xóa mềm.

### 7.6 `AdminOrderSummary`

`OrderSummary` + `recipientName`. **Không có** số điện thoại, địa chỉ, email, `userId` (US-09 R3).

### 7.7 `AdminOrder`

`Order` + `buyerEmail`. **Không có** `userId`, ảnh hồ sơ, ảnh try-on, số đo, consent (D-14).

## 8. Thay đổi ở API cũ

| API | Thay đổi | Lý do |
|---|---|---|
| `PATCH`, `DELETE /api/admin/products/:id` | **Không đổi contract.** Có thể chờ rất ngắn nếu một `place_order` đang giữ `FOR SHARE` trên sản phẩm đó | Bảo đảm giá trong đơn (`db/README.md` mục 5) |
| `/api/try-on/*` | Không đổi | D-146 |
| `GET /api/auth/me` | Không đổi. Số trong giỏ lấy từ `GET /cart` | Không gộp hai mục đích |
| CORS | Không đổi. `idempotencyKey` nằm trong body nên không cần thêm vào `allowedHeaders` | D-145 |
