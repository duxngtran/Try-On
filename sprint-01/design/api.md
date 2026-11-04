# Sprint 01 — API contract

> Stories: US-01, US-02 · Base URL: `VITE_API_URL` (vd. `http://localhost:4000/api`) · Luồng: [`flows/`](flows/README.md) · DB: [`db/README.md`](db/README.md)

## Mục lục
1. [Quy ước chung](#1-quy-ước-chung)
2. [Bảng mã lỗi](#2-bảng-mã-lỗi)
3. [Tổng quan endpoint](#3-tổng-quan-endpoint)
4. [Auth & hệ thống](#4-auth--hệ-thống)
5. [Hồ sơ](#5-hồ-sơ)
6. [Đối tượng dữ liệu](#6-đối-tượng-dữ-liệu)

---

## 1. Quy ước chung

| Mục | Quy ước |
|---|---|
| Prefix | Mọi endpoint dưới `/api` |
| Định dạng | JSON (`Content-Type: application/json`), trừ upload ảnh (`multipart/form-data`). JSON body tối đa **10 KB** |
| Tên trường | `camelCase` trong API; `snake_case` trong DB (service map) |
| Auth | `Authorization: Bearer <JWT>` (HS256, hạn `JWT_EXPIRES_IN` = 7d). Payload: `sub` (user id), `role`, `iat`, `exp` |
| Thời gian | ISO 8601 UTC, vd. `2026-11-04T08:00:00.000Z` |
| Thành công | `{ "success": true, "data": { ... } }` |
| Lỗi | `{ "success": false, "error": { "code": "…", "message": "…", "details"?: … } }` — `message` tiếng Việt, hiển thị được cho user |
| `details` | Chỉ có ở `VALIDATION_ERROR` (mảng `{ field, message }`) và `TOO_MANY_ATTEMPTS` / `TOO_MANY_REQUESTS` (`{ retryAfterSeconds }`). Mở rộng tối thiểu so với format chung trong `CLAUDE.md` để FE hiện lỗi từng ô |
| Trường thừa | Bị bỏ qua (zod `strip`), không báo lỗi — kể cả `role`, `userId`, `photoPath` |
| Rate limit | Header chuẩn `RateLimit` / `RateLimit-Policy` (express-rate-limit `standardHeaders: 'draft-8'`) và `Retry-After` khi 429 |
| CORS | Chỉ `CORS_ORIGIN`; header cho phép: `Authorization`, `Content-Type` |
| Không bao giờ trả | `password_hash`, `photo_path` thô, URL public của Storage, key Supabase |

Ví dụ `VALIDATION_ERROR`:
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Dữ liệu không hợp lệ.",
  "details": [ { "field": "password", "message": "Mật khẩu phải có ít nhất 1 chữ cái và 1 chữ số." } ] } }
```

## 2. Bảng mã lỗi

| HTTP | `error.code` | Khi nào | Story |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Body sai quy tắc, JSON hỏng, sai tên field multipart / >1 file | US-01 E1, US-02 E9 |
| 400 | `CONSENT_REQUIRED` | Upload ảnh khi chưa consent bản hiện hành | US-02 E2 |
| 400 | `FILE_REQUIRED` | Multipart không có file `photo` | US-02 E3 |
| 400 | `INVALID_FILE_TYPE` | Magic bytes không phải JPEG/PNG/WEBP; ảnh động | US-02 E4, E16 |
| 400 | `INVALID_IMAGE` | File hỏng, không decode được | US-02 E8 |
| 400 | `IMAGE_TOO_LARGE` | Cạnh dài > 8000 px | US-02 E15 |
| 400 | `IMAGE_TOO_SMALL` | Rộng < 512 hoặc cao < 1024 (sau EXIF) | US-02 E6 |
| 400 | `INVALID_ASPECT_RATIO` | cao/rộng ngoài 1,3–2,5 | US-02 E7 |
| 401 | `UNAUTHORIZED` | Thiếu/sai token, sai chữ ký, `alg` khác HS256, user không còn | US-01 E5, E6 |
| 401 | `TOKEN_EXPIRED` | Token hết hạn | US-01 E5 |
| 401 | `INVALID_CREDENTIALS` | Đăng nhập sai email hoặc mật khẩu (FE **không** coi là hết phiên) | US-01 E3 |
| 403 | `FORBIDDEN` | Sai vai (user → `/admin/*`, admin → `/profile/*`) | US-01 E7 |
| 404 | `NOT_FOUND` | Route không tồn tại | — |
| 409 | `EMAIL_ALREADY_EXISTS` | Email đã đăng ký (kể cả race) | US-01 E2, E8 |
| 413 | `FILE_TOO_LARGE` | Ảnh > `PHOTO_MAX_MB` | US-02 E5 |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body > 10 KB | — |
| 429 | `TOO_MANY_ATTEMPTS` | Email đang bị khóa đăng nhập | US-01 E4 |
| 429 | `TOO_MANY_REQUESTS` | Vượt rate limit IP (`/auth/*`) hoặc upload/user/giờ | US-01 §8, US-02 E14 |
| 500 | `UPLOAD_FAILED` | Tải file lên Storage lỗi (ảnh cũ giữ nguyên) | US-02 E10 |
| 500 | `INTERNAL_ERROR` | Lỗi khác (DB…); production không lộ stack | US-01 E9, US-02 E11 |

## 3. Tổng quan endpoint

| Method | Path | Auth | Role | Story | Luồng |
|---|---|---|---|---|---|
| GET | `/api/health` | — | — | setup | — |
| POST | `/api/auth/register` | — | — | US-01 | [register](flows/register.md) |
| POST | `/api/auth/login` | — | — | US-01 | [login](flows/login.md) |
| GET | `/api/auth/me` | Bearer | user, admin | US-01 | [session-restore](flows/session-restore.md) |
| GET | `/api/admin/ping` | Bearer | admin | US-01 | [auth-middleware](flows/auth-middleware.md) |
| GET | `/api/profile` | Bearer | user | US-02 | [profile-get](flows/profile-get.md) |
| PUT | `/api/profile/measurements` | Bearer | user | US-02 | [profile-measurements](flows/profile-measurements.md) |
| POST | `/api/profile/photo-consent` | Bearer | user | US-02 | [profile-consent](flows/profile-consent.md) |
| PUT | `/api/profile/photo` | Bearer | user | US-02 | [profile-photo-upload](flows/profile-photo-upload.md) |
| DELETE | `/api/profile/photo` | Bearer | user | US-02 | [profile-photo-delete](flows/profile-photo-delete.md) |

Không có endpoint logout (D-05: đăng xuất chỉ xóa token phía client). API hồ sơ không có tham số id — luôn là hồ sơ của `sub` (AC-11).

Ngoài bảng mã riêng của từng endpoint, mọi endpoint có thể trả `500 INTERNAL_ERROR`; endpoint có Bearer có thể trả `401 UNAUTHORIZED` / `401 TOKEN_EXPIRED` và `403 FORBIDDEN` (khi có role).

## 4. Auth & hệ thống

### 4.1 `GET /api/health`
Kiểm tra server sống (không gọi DB, không rate limit).

`200` → `{ "success": true, "data": { "status": "ok" } }`

### 4.2 `POST /api/auth/register`
Rate limit IP: `AUTH_RATE_LIMIT_PER_MIN` request/phút/IP (chung cho `/api/auth/register` + `/api/auth/login`).

**Request**
```json
{ "email": " A@Example.com ", "password": "abc12345" }
```

| Trường | Validation (zod, FE + BE) |
|---|---|
| `email` | string, bắt buộc; `trim()` + `toLowerCase()`; ≤ 254; regex `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$` |
| `password` | string, bắt buộc; không trim; 8–72 ký tự; chỉ ASCII in được `^[\x20-\x7E]+$`; có `[A-Za-z]` và `[0-9]`; `password.toLowerCase() !== email` (sau chuẩn hóa) |
| `confirmPassword` | Chỉ FE, không gửi |
| `role` và trường khác | Bỏ qua; luôn tạo `role = 'user'` |

**201**
```json
{ "success": true, "data": {
  "token": "<jwt>",
  "user": { "id": "uuid", "email": "a@example.com", "role": "user", "profileCompleted": false, "createdAt": "…" } } }
```

| Lỗi | Mã |
|---|---|
| 400 | `VALIDATION_ERROR` (details theo field `email` / `password`) |
| 409 | `EMAIL_ALREADY_EXISTS` — "Email này đã được đăng ký." |
| 429 | `TOO_MANY_REQUESTS` |

### 4.3 `POST /api/auth/login`

**Request** `{ "email": "a@example.com", "password": "abc12345" }`

| Trường | Validation |
|---|---|
| `email` | Như đăng ký (định dạng + chuẩn hóa) |
| `password` | string, không rỗng, ≤ 72 ký tự (không kiểm độ mạnh/ASCII) |

**200** — cùng shape với đăng ký (`token`, `user`); `profileCompleted` lấy từ `profiles`.

| Lỗi | Mã | Ghi chú |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Không tính vào bộ đếm khóa |
| 401 | `INVALID_CREDENTIALS` | Cùng message cho email lạ và sai mật khẩu: "Email hoặc mật khẩu không đúng." |
| 429 | `TOO_MANY_ATTEMPTS` | `details.retryAfterSeconds` + header `Retry-After`; message "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau X phút." (X = làm tròn lên) |
| 429 | `TOO_MANY_REQUESTS` | Rate limit IP |

Quy tắc khóa: `LOGIN_MAX_FAILS` (5) lần sai / email / `LOGIN_LOCK_MINUTES` (15) — chi tiết ở [login.md](flows/login.md).

### 4.4 `GET /api/auth/me`
Auth: Bearer (user, admin).

**200**
```json
{ "success": true, "data": { "user": { "id": "uuid", "email": "a@example.com", "role": "user", "profileCompleted": false, "createdAt": "…" } } }
```
Với admin, `profileCompleted` luôn `false` (không dùng).

| Lỗi | Mã |
|---|---|
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED` |

### 4.5 `GET /api/admin/ping`
Auth: Bearer, role `admin`. Dùng kiểm AC-10 và làm khung cho route admin Epic 2.

`200` → `{ "success": true, "data": { "pong": true, "role": "admin" } }`

| Lỗi | Mã |
|---|---|
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN` — "Bạn không có quyền truy cập." |

## 5. Hồ sơ

Tất cả: Bearer, role `user` (admin → `403 FORBIDDEN`, D-14). Response thành công của **mọi** endpoint hồ sơ là `{ profile }` đầy đủ (mục 6.2) để FE chỉ cần một reducer.

### 5.1 `GET /api/profile`
**200** → `{ "success": true, "data": { "profile": Profile } }`. Nếu ký signed URL lỗi: vẫn 200, `photo.url = null` (FE hiện "Không tải được ảnh" + Thử lại).

### 5.2 `PUT /api/profile/measurements`

**Request** `{ "heightCm": 165, "weightKg": 52.5 }`

| Trường | Validation |
|---|---|
| `heightCm` | **number** (JSON number, không nhận string), số nguyên, 100–250 — "Chiều cao phải từ 100 đến 250 cm." |
| `weightKg` | **number**, 30–250, tối đa 1 chữ số thập phân — "Cân nặng phải từ 30 đến 250 kg." |
| Cả hai | Bắt buộc, gửi cùng lúc |

**200** → `{ profile }`. **400** `VALIDATION_ERROR` (details theo `heightCm` / `weightKg`); dữ liệu cũ không đổi.

FE chịu trách nhiệm đổi `52,5` → `52.5` trước khi gửi.

### 5.3 `POST /api/profile/photo-consent`

**Request** `{ "accepted": true }` — phải đúng literal `true`, ngược lại `400 VALIDATION_ERROR`.

**200** → `{ profile }` với `consent.accepted = true`. Idempotent: gọi lại không đổi `acceptedAt` lần đầu (trừ khi version consent đã tăng).

**Quyết định: consent là endpoint riêng, không phải trường trong multipart upload.** Lý do:

| Tiêu chí | Endpoint riêng (chọn) | Trường `consent=true` trong upload |
|---|---|---|
| Khớp UX US-02 §5.2.1 | Tích checkbox → ghi nhận ngay → mở nút chọn ảnh; reload trang vẫn nhớ | Tích checkbox chỉ là state FE, mất khi reload; consent chỉ ghi khi upload thành công |
| Khớp US-02 §5.2.5.2 | "Kiểm tra consent **đã được ghi nhận**" trước khi xử lý file | Phải đọc field trước file trong stream multipart (thứ tự field phụ thuộc client) |
| Chặn sớm | Kiểm consent trước multer → không nhận 10 MB vô ích | Phải parse multipart rồi mới biết |
| Bằng chứng | Thời điểm + version câu đồng ý, tách khỏi việc có ảnh hay không | Gộp 2 ý nghĩa vào 1 request |
| Mở rộng Epic 3 | Đổi nội dung consent → tăng version → gọi lại endpoint này | Phải đổi contract upload |
| Nhược điểm | Thêm 1 request; có thể có consent mà chưa từng tải ảnh (vô hại) | — |

### 5.4 `PUT /api/profile/photo`

Rate limit: `PHOTO_UPLOADS_PER_HOUR` (10) request / user / giờ, đếm mọi request (kể cả bị từ chối).

**Request** `multipart/form-data`, đúng 1 file ở field **`photo`**; không có field khác. Không tin `Content-Type`/tên file của part.

| Kiểm tra (theo thứ tự) | Lỗi |
|---|---|
| Consent bản hiện hành | 400 `CONSENT_REQUIRED` |
| File ≤ `PHOTO_MAX_MB` (10 MB) | 413 `FILE_TOO_LARGE` |
| Có file `photo` | 400 `FILE_REQUIRED` |
| Đúng field, 1 file | 400 `VALIDATION_ERROR` |
| Magic bytes JPEG/PNG/WEBP, không phải ảnh động | 400 `INVALID_FILE_TYPE` |
| Decode được | 400 `INVALID_IMAGE` |
| Cạnh dài ≤ 8000 px (sau EXIF) | 400 `IMAGE_TOO_LARGE` |
| Rộng ≥ 512, cao ≥ 1024 (sau EXIF) | 400 `IMAGE_TOO_SMALL` |
| 1,3 ≤ cao/rộng ≤ 2,5 | 400 `INVALID_ASPECT_RATIO` |
| Upload Storage | 500 `UPLOAD_FAILED` |
| Ghi DB (file mới bị xóa lại) | 500 `INTERNAL_ERROR` |
| Rate limit | 429 `TOO_MANY_REQUESTS` |

Xử lý: xoay EXIF → resize cạnh dài 2048 (không phóng to) → nền trắng nếu có alpha → JPEG quality 85, không metadata → `profile-photos/<userId>/<uuid>.jpg`.

**200** → `{ profile }` với `photo.version` đã tăng. Mọi lỗi 4xx/5xx: hồ sơ và ảnh cũ không đổi (AC-05).

Dùng `PUT` vì mỗi user có đúng 1 ảnh (thay thế tài nguyên).

### 5.5 `DELETE /api/profile/photo`

**200** → `{ profile }` với `photo = null`, `profileCompleted = false`. Idempotent: chưa có ảnh vẫn 200 (không tăng version).

## 6. Đối tượng dữ liệu

### 6.1 `User`
| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid | |
| `email` | string | lowercase |
| `role` | `"user"` \| `"admin"` | |
| `profileCompleted` | boolean | D-09; admin luôn `false` |
| `createdAt` | ISO string | |

### 6.2 `Profile`
```json
{
  "heightCm": 165,
  "weightKg": 52.5,
  "photo": {
    "url": "https://<ref>.supabase.co/storage/v1/object/sign/profile-photos/...?token=...",
    "expiresAt": "2026-11-04T08:15:00.000Z",
    "version": 3,
    "updatedAt": "2026-11-04T08:00:00.000Z"
  },
  "consent": { "accepted": true, "acceptedAt": "2026-11-04T07:59:00.000Z", "version": 1 },
  "profileCompleted": true,
  "missing": []
}
```

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `heightCm` | integer \| null | |
| `weightKg` | number \| null | 1 chữ số thập phân; backend `Number()` giá trị numeric từ DB |
| `photo` | object \| null | `null` khi chưa có ảnh |
| `photo.url` | string \| null | Signed URL hạn `SIGNED_URL_TTL_SECONDS` (900); `null` nếu ký lỗi |
| `photo.expiresAt` | ISO string \| null | Thời điểm URL hết hạn (FE làm mới trước ~60 s) |
| `photo.version` | integer | `photo_version` (D-15) — Epic 3 dùng làm khóa cache |
| `photo.updatedAt` | ISO string | |
| `consent.accepted` | boolean | `photo_consent_at` có giá trị **và** `photo_consent_version = PHOTO_CONSENT_VERSION` |
| `consent.acceptedAt` | ISO string \| null | |
| `consent.version` | integer \| null | |
| `profileCompleted` | boolean | Cột generated `profile_completed` |
| `missing` | `("photo" \| "measurements")[]` | Phần còn thiếu cho banner |
