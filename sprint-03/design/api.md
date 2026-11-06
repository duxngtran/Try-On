# Sprint 03 — API contract

> Stories: US-05, US-06 · Base URL: `VITE_API_URL` · Luồng: [`flows/`](flows/README.md) · DB: [`db/README.md`](db/README.md) · Dịch vụ AI: [`tryon-provider.md`](tryon-provider.md)

**Kế thừa:** [`sprint-01/design/api.md`](../../sprint-01/design/api.md), [`sprint-02/design/api.md`](../../sprint-02/design/api.md) giữ nguyên toàn bộ, kể cả format `{ success, data }` / `{ success: false, error: { code, message, details? } }`.

## Mục lục
1. [Quy ước](#1-quy-ước)
2. [Bảng mã lỗi](#2-bảng-mã-lỗi)
3. [Tổng quan endpoint](#3-tổng-quan-endpoint)
4. [Trạng thái & consent](#4-trạng-thái--consent)
5. [Danh mục & sản phẩm](#5-danh-mục--sản-phẩm)
6. [Ảnh try-on & job](#6-ảnh-try-on--job)
7. [Đối tượng dữ liệu](#7-đối-tượng-dữ-liệu)
8. [Thay đổi ở API cũ](#8-thay-đổi-ở-api-cũ)

---

## 1. Quy ước

| Mục | Quy ước |
|---|---|
| Phân quyền | Mọi endpoint: Bearer, role `user`. Thứ tự kiểm tra: 401 → 403 → 404 id → rate limit → phần còn lại. Admin nhận 403 (D-14, D-28) |
| Id trên path | Sai định dạng UUID trả `404 NOT_FOUND`, không gọi DB (dùng `validateUuidParam`) |
| Client gửi | **Không bao giờ** có `userId`, `photoVersion`, `imageVersion`, URL ảnh. Trường thừa bị bỏ qua. Khóa cache D-49 do backend đọc từ DB |
| Lỗi của job | Là **dữ liệu** trong response 200 (`job.error`), không phải lỗi HTTP: request đọc trạng thái vẫn thành công |
| Không trả | Đường dẫn Storage, id phía nhà cung cấp, số tiền, số liệu ngân sách (US-05 E10) |
| Ảnh try-on | Signed URL `SIGNED_URL_TTL_SECONDS` (15 phút), kèm `expiresAt`. Không log (AC-20) |
| Ảnh sản phẩm | URL public (D-46) |
| Theo dõi job | FE poll `GET /try-on/jobs/:id` mỗi 2 giây. Mỗi lần poll làm mới dấu "còn người theo dõi" (US-06 R4) |

Ngoài bảng mã riêng, mọi endpoint có thể trả `401 UNAUTHORIZED`, `401 TOKEN_EXPIRED`, `403 FORBIDDEN`, `500 INTERNAL_ERROR`.

## 2. Bảng mã lỗi

### 2.1 Lỗi HTTP

| HTTP | `error.code` | Khi nào | Story | Mới? |
|---|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Con trỏ, `limit`, `purpose`, `accepted` sai | US-06 mục 6 | Cũ |
| 403 | `TRYON_CONSENT_REQUIRED` | Chưa đồng ý, đồng ý lỗi thời, đã rút | US-05 E3 | **Mới** |
| 404 | `NOT_FOUND` | Danh mục, sản phẩm không có hoặc đã xóa; job của người khác | US-05 E7, E8; US-06 E3 | Cũ |
| 409 | `PROFILE_INCOMPLETE` | Thiếu ảnh hoặc số đo. `details.missing: ('photo' \| 'measurements')[]` | US-05 E2 | **Mới** |
| 429 | `TRYON_QUOTA_EXCEEDED` | Hết lượt. `details: { retryAfterSeconds, scope, resetsAt }` | US-05 E9 | **Mới** |
| 429 | `TOO_MANY_REQUESTS` | Vượt rate limit, hoặc người mua đang có quá nhiều job. `details.retryAfterSeconds` (D-34) | US-05 E11 | Cũ |
| 503 | `TRYON_UNAVAILABLE` | Hết ngân sách, tắt tính năng, dịch vụ đang dừng do lỗi cấu hình. Không nêu lý do cụ thể | US-05 E10, E18 | **Mới** |

`details.scope` của `TRYON_QUOTA_EXCEEDED`:

| `scope` | Ý nghĩa | `retryAfterSeconds` | `resetsAt` |
|---|---|---|---|
| `day` | Hết 20 ảnh hôm nay | Tới 0 giờ ngày mai, giờ Việt Nam | ISO |
| `month` | Hết 100 ảnh tháng này | Tới 0 giờ ngày 1 tháng sau, giờ Việt Nam | ISO |
| `pending` | Lượt cuối đang được giữ cho job đang chạy (D-77) | 15 | `null` |

### 2.2 Mã lỗi trong `job.error.code`

| `code` | Khi nào | Thử lại được | Tính lượt | Story |
|---|---|---|---|---|
| `TRYON_FAILED` | Dịch vụ lỗi, từ chối đầu vào, lưu kết quả lỗi, chết giữa chừng | Có | Không | E12, E16, E17, E19 |
| `TRYON_TIMEOUT` | Quá 120 giây. **Mốc 60 giây là của FE**, xem mục 6.4 | Có | Không | E13 |
| `TRYON_BLOCKED` | Bộ lọc an toàn từ chối. Ghi nhớ theo khóa | Không | Không | E14 |
| `TRYON_PHOTO_UNUSABLE` | Không nhận ra tư thế. Ghi nhớ theo khóa | Đổi ảnh hồ sơ | Không | E15 |
| `TRYON_UNAVAILABLE` | Hết credit tại nhà cung cấp, sai API key | Có, sau | Không | E18 |

## 3. Tổng quan endpoint

| Method | Path | Mục đích | Rate limit | Story | Luồng |
|---|---|---|---|---|---|
| GET | `/api/try-on/state` | Điều kiện vào phòng, lượt | Đọc | US-05 | [room-entry](flows/tryon-room-entry.md) |
| POST | `/api/try-on/consent` | Đồng ý gửi ảnh | Đọc | US-05 | [consent](flows/tryon-consent.md) |
| DELETE | `/api/try-on/consent` | Rút đồng ý | Đọc | US-05 | [consent](flows/tryon-consent.md) |
| GET | `/api/try-on/categories` | Danh mục có sản phẩm | Đọc | US-05 | [select-category](flows/tryon-select-category.md) |
| GET | `/api/try-on/categories/:categoryId/products` | Danh sách theo con trỏ | Đọc | US-05, US-06 | [navigation](flows/tryon-navigation.md) |
| GET | `/api/try-on/products/:productId/result` | Ảnh hoặc job hiện có, **không tạo job** | Đọc | US-05, US-06 | [select-category](flows/tryon-select-category.md) |
| POST | `/api/try-on/products/:productId/jobs` | Có ảnh thì trả, chưa có thì tạo hoặc gắn vào job | **Tạo job** | US-05, US-06 | [job-create](flows/tryon-job-create.md) |
| GET | `/api/try-on/jobs/:jobId` | Theo dõi job | Đọc | US-05, US-06 | [job-worker](flows/tryon-job-worker.md) |

**Rate limit (D-88):** theo user, đếm cả request bị từ chối. Tạo job `TRYON_JOB_CREATES_PER_MIN` = 30/phút. Đọc `TRYON_READS_PER_MIN` = 240/phút (ước lượng: poll 30/phút mỗi job, 2 tab, cộng thao tác lướt). Hai bộ đếm tách nhau. In-memory như D-31.

**Vì sao không kiểm consent ở `GET /categories`, `GET /products`:** thông tin catalog không nhạy cảm. Cổng vào phòng nằm ở `GET /state` phía FE. Mọi thứ chạm tới ảnh người (`/result`, `/jobs`) đều kiểm phía backend.

## 4. Trạng thái & consent

### 4.1 `GET /api/try-on/state`

Luôn trả 200 (trừ lỗi xác thực): đây là chỗ FE hỏi, không phải chỗ chặn. Không tạo job.

```json
{ "success": true, "data": {
  "profile": { "completed": true, "missing": [] },
  "consent": { "accepted": true, "acceptedAt": "2026-11-06T02:00:00.000Z", "version": 1, "requiredVersion": 1, "withdrawnAt": null },
  "quota": {
    "dailyLimit": 20, "dailyUsed": 3, "dailyResetsAt": "2026-11-06T17:00:00.000Z",
    "monthlyLimit": 100, "monthlyUsed": 12, "monthlyResetsAt": "2026-11-30T17:00:00.000Z",
    "held": 1, "remaining": 16
  },
  "generation": { "available": true, "prefetchAllowed": true }
} }
```

| Trường | Ghi chú |
|---|---|
| `quota.remaining` | `min(dailyLimit − dailyUsed, monthlyLimit − monthlyUsed) − held`, không âm. FE hiện số này khi ≤ 5 |
| `generation.available` | `false`: hết ngân sách, tắt tính năng, hoặc dịch vụ đang dừng |
| `generation.prefetchAllowed` | `false`: tắt generate trước, hoặc đã vượt 80% ngân sách. FE dùng để khỏi gửi; backend vẫn tự kiểm |

### 4.2 `POST /api/try-on/consent`

**Request** `{ "accepted": true }`. Ô đồng ý gồm cả phần tự khai đủ 18 tuổi và là người trong ảnh (D-93), nên một trường là đủ. `accepted` khác `true` → 400.

Idempotent: đã đồng ý đúng phiên bản thì giữ nguyên thời điểm. Hằng `TRYON_CONSENT_VERSION` ở backend, tách khỏi `PHOTO_CONSENT_VERSION`.

**200** → `{ "success": true, "data": <như 4.1> }`.

### 4.3 `DELETE /api/try-on/consent`

Xóa ảnh try-on, hủy job chưa gửi, ngừng gửi; giữ ảnh hồ sơ (D-93, AC-10). Idempotent: chưa đồng ý hoặc đã rút vẫn 200.

**200** → như 4.1, `consent.accepted = false`.

Job đã gửi không thu hồi được. Kết quả của nó bị bỏ khi về, vẫn tính lượt (US-05 R4, R6, R11). File được xóa khỏi Storage qua hàng đợi, thường trong vài giây; link cũ đã có thể còn mở tối đa 90 giây (D-39).

## 5. Danh mục & sản phẩm

### 5.1 `GET /api/try-on/categories`

Chỉ danh mục chưa xóa và có ≥ 1 sản phẩm chưa xóa (D-73), theo thứ tự D-44: `created_at` tăng dần, `id` tăng dần.

**200**
```json
{ "success": true, "data": { "categories": [ { "id": "uuid", "name": "Áo thun", "productCount": 12 } ] } }
```

### 5.2 `GET /api/try-on/categories/:categoryId/products`

Thứ tự D-44: `created_at` giảm dần, `id` giảm dần. Điều hướng theo con trỏ, không theo số thứ tự (US-06 R2).

| Query | Validation | Ghi chú |
|---|---|---|
| `limit` | Số nguyên 1–50, mặc định 20 | |
| `after` | Con trỏ | Các sản phẩm cũ hơn con trỏ |
| `before` | Con trỏ | Các sản phẩm mới hơn con trỏ, trả về vẫn theo thứ tự giảm dần |
| `at` | UUID sản phẩm | Trang bắt đầu từ sản phẩm này. Dùng khi tải lại trang (US-06 R8) |

Chỉ được có **tối đa một** trong `after`, `before`, `at`; nhiều hơn → 400.

**200**
```json
{ "success": true, "data": {
  "items": [ { "...": "TryOnProduct", "position": 3 } ],
  "total": 12,
  "prevCursor": "opaque-hoặc-null",
  "nextCursor": "opaque-hoặc-null",
  "anchor": { "found": true, "deleted": false }
} }
```

| Trường | Ghi chú |
|---|---|
| `position` | Vị trí tham khảo cho "3 / 12" (US-06 R2), tính lại ở mỗi lần tải |
| `prevCursor`, `nextCursor` | `null` khi hết chiều đó. Con trỏ là base64url của `{ c: created_at, i: id }`, client không tự dựng |
| `anchor` | Chỉ có khi gọi với `at`. `deleted: true`: sản phẩm đã xóa, `items` bắt đầu từ sản phẩm kế tiếp, FE hiện E3. `found: false`: sản phẩm không thuộc danh mục, `items` là trang đầu |

**Con trỏ phải giữ `created_at` dạng text từ SQL (`created_at_raw`).** Cột có độ chính xác micro giây, `Date` của JS chỉ tới mili giây; làm tròn sẽ lặp hoặc bỏ sót sản phẩm. Vì vậy `list_tryon_products` là hàm SQL, không dựng bằng `.or()` của supabase-js.

| Lỗi | Mã | Ghi chú |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Con trỏ không giải mã được, `limit` sai, nhiều hơn một tham số vị trí |
| 404 | `NOT_FOUND` | Danh mục không có, đã xóa, id sai — "Danh mục không còn tồn tại." |

Danh mục còn hiệu lực nhưng hết sản phẩm: 200, `items: []`, `total: 0` (US-05 E6).

## 6. Ảnh try-on & job

### 6.1 `GET /api/try-on/products/:productId/result`

Chỉ đọc, **không bao giờ tạo job**, không tốn lượt. Dùng khi chuyển tới sản phẩm, tải trước (US-06 R10), lấy lại URL hết hạn (US-05 E20).

**200**, `state` là một trong:

```json
{ "success": true, "data": { "state": "ready", "image": TryOnImage } }
{ "success": true, "data": { "state": "pending", "job": { "id": "uuid", "status": "queued" } } }
{ "success": true, "data": { "state": "blocked", "errorCode": "TRYON_BLOCKED" } }
{ "success": true, "data": { "state": "none" } }
```

| Lỗi | Mã |
|---|---|
| 403 | `TRYON_CONSENT_REQUIRED` |
| 404 | `NOT_FOUND` — "Sản phẩm này không còn bán." |
| 409 | `PROFILE_INCOMPLETE` |

Không ký được URL: trả 500 `INTERNAL_ERROR`, FE hiện ảnh trải phẳng và nút **Tải lại ảnh** (US-05 E22).

### 6.2 `POST /api/try-on/products/:productId/jobs`

**Request** `{ "purpose": "display" }` hoặc `{ "purpose": "prefetch" }`, mặc định `display`.

Idempotent theo khóa cache: gọi lặp lại không sinh trùng (D-75, AC-06). Nút **Thử lại** dùng chính endpoint này.

| Tình huống | HTTP | `data` |
|---|---|---|
| Đã có ảnh | 200 | `{ "state": "ready", "image": TryOnImage }` |
| Đã có job cùng khóa. `display` nâng ưu tiên của generate trước | 202 | `{ "state": "pending", "job": { "id", "status" } }` |
| Tạo job mới | 202 | như trên, `status: "queued"` |
| Khóa đã bị chặn | 200 | `{ "state": "blocked", "errorCode": "TRYON_BLOCKED" }` |
| `prefetch` không chạy (US-06 mục 4.3) | 200 | `{ "state": "skipped", "reason": "low_quota" \| "busy" \| "budget" \| "disabled" }` |

Generate trước không chạy là **kết quả bình thường**, không phải lỗi: không có gì hiện cho người mua.

| Lỗi (thứ tự kiểm) | Mã | Ghi chú |
|---|---|---|
| 429 | `TOO_MANY_REQUESTS` | Rate limit 30/phút |
| 400 | `VALIDATION_ERROR` | `purpose` sai |
| 503 | `TRYON_UNAVAILABLE` | `TRYON_ENABLED=false` hoặc đang tạm dừng. **Kiểm sau khi tra cache**, ảnh đã có vẫn xem được |
| 409 | `PROFILE_INCOMPLETE` | `details.missing` |
| 403 | `TRYON_CONSENT_REQUIRED` | |
| 404 | `NOT_FOUND` | Sản phẩm đã xóa, không tạo job, không tính lượt (AC-12) |
| 429 | `TOO_MANY_REQUESTS` | Đang có `TRYON_MAX_ACTIVE_PER_USER` job, `retryAfterSeconds: 5` |
| 429 | `TRYON_QUOTA_EXCEEDED` | `scope` `day`, `month`, `pending` |
| 503 | `TRYON_UNAVAILABLE` | Vượt ngân sách. Log `TRYON_BUDGET_EXCEEDED`, không lộ số tiền |

Cả chuỗi kiểm tra từ `PROFILE_INCOMPLETE` trở đi nằm trong một transaction của `create_tryon_job`.

### 6.3 `GET /api/try-on/jobs/:jobId`

Chủ job mới đọc được; job của người khác 404, không tiết lộ tồn tại (US-05 mục 7).

**200**
```json
{ "success": true, "data": { "job": {
  "id": "uuid",
  "productId": "uuid",
  "purpose": "display",
  "status": "succeeded",
  "createdAt": "2026-11-06T02:00:00.000Z",
  "image": TryOnImage,
  "error": null
} } }
```

| `status` | Ý nghĩa | FE làm gì |
|---|---|---|
| `queued`, `running` | Đang chờ | Poll tiếp, tính mốc 15, 60 giây từ lúc **người mua bắt đầu chờ**, không từ `createdAt` |
| `succeeded` | Xong, `image` có giá trị | Hiện ảnh nếu vẫn ở đúng sản phẩm (US-06 R7) |
| `failed` | `error: { code, message }` | Hiện theo mục 2.2 |
| `canceled` | Bị hủy trước khi gửi | Gọi `/result` để biết lý do; đang xem thì gọi lại `POST /jobs` |
| `discarded` | Đã hết hiệu lực, kết quả bị bỏ | Gọi `/result` để biết lý do (403, 409, 404, hoặc `none`) |

Hai trường hợp API trả khác cột `status` trong DB:
- Job đang chạy nhưng đã hết hiệu lực (`out_current = false`): trả `discarded` ngay, để tab đang chờ dừng lại luôn (US-06 AC-16).
- Job `succeeded` nhưng ảnh đã bị xóa sau đó: trả `discarded`, `image: null`.

| Lỗi | Mã |
|---|---|
| 404 | `NOT_FOUND` |

### 6.4 Mốc thời gian

| Mốc | Bên giữ | Ý nghĩa |
|---|---|---|
| ≤ 200 ms | FE | Hiện ảnh trải phẳng và trạng thái chờ, không đợi API (D-74) |
| 400 ms | FE | Dừng ở sản phẩm mới tạo job (D-86) |
| 15 giây | FE | Thêm dòng "Vẫn đang tạo…" |
| 60 giây | FE | Hiện `TRYON_TIMEOUT`, nút Thử lại. **Job vẫn chạy.** Thử lại gắn vào đúng job đó (AC-15) |
| 120 giây | BE | `deadline_at`, job thành `failed` `TRYON_TIMEOUT` |

## 7. Đối tượng dữ liệu

### 7.1 `TryOnProduct`

```json
{
  "id": "uuid",
  "name": "Áo thun trắng",
  "priceVnd": 199000,
  "category": { "id": "uuid", "name": "Áo thun" },
  "image": { "url": "https://<ref>.supabase.co/storage/v1/object/public/product-images/...", "version": 1 },
  "position": 3
}
```

Ảnh `image` là ảnh trải phẳng, hiện trong lúc chờ. `image.version` dùng làm khóa bộ nhớ tạm ở FE (US-06 R9). Không có `createdAt`: thứ tự do backend quyết định.

### 7.2 `TryOnImage`

```json
{
  "url": "https://<ref>.supabase.co/storage/v1/object/sign/tryon-images/...?token=...",
  "expiresAt": "2026-11-06T02:15:00.000Z",
  "width": 864,
  "height": 1296
}
```

FE chỉ giữ trong bộ nhớ của trang (US-06 mục 9). `width`, `height` để giữ khung ổn định, không xê dịch khi đổi ảnh.

## 8. Thay đổi ở API cũ

| API | Thay đổi | Lý do |
|---|---|---|
| `PUT`, `DELETE /api/profile/photo` | **Không đổi contract.** Trigger DB xóa ảnh try-on; service gọi thêm `tryonCleanup.kick()` để xóa file sớm | D-79 |
| `PATCH`, `DELETE /api/admin/products/:id` | **Không đổi contract.** Như trên | D-80 |
| `GET /api/profile` | Không đổi. FE lấy trạng thái consent gửi ảnh từ `GET /try-on/state`, để API hồ sơ không gộp hai consent khác mục đích | D-93 |
| `POST /api/profile/photo-consent` | Không đổi, `PHOTO_CONSENT_VERSION` giữ 1 | D-93: ảnh có consent cũ giữ nguyên |
