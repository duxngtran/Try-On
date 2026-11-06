# Sprint 03 — Adapter dịch vụ try-on

> US-05 R8–R10, E12–E18 · D-75, D-76, D-82, D-86, D-89, D-91, D-92 · Tra tài liệu ngày **2026-11-06**, [nguồn ở cuối](#7-nguồn)

Mọi lệnh gọi nhà cung cấp nằm sau một interface, để đổi model không ảnh hưởng luồng khác (D-91). **Chưa gọi API thật lần nào.** Nội dung về FASHN dưới đây đọc từ tài liệu, chưa kiểm chứng bằng chạy thử.

## Mục lục
1. [Interface](#1-interface)
2. [Adapter giả](#2-adapter-giả)
3. [Adapter FASHN](#3-adapter-fashn)
4. [Phân loại lỗi](#4-phân-loại-lỗi)
5. [Chưa xác minh được](#5-chưa-xác-minh-được)
6. [Khác với US-05 mục 12](#6-khác-với-us-05-mục-12)
7. [Nguồn](#7-nguồn)

---

## 1. Interface

```js
// backend/src/services/tryon/provider.js (JSDoc, dự án dùng JS)
{
  name: 'fashn' | 'fake',
  modelName: 'tryon-v1.6',
  // Gửi đi. Không có tham số nào chứa số đo, email, userId (D-82).
  async submit({ modelImage /* Buffer JPEG */, garmentImageUrl /* string */ })
    // -> { providerJobId: string }
    // throw TryOnProviderError
  async getStatus(providerJobId)
    // -> { state: 'pending' }
    //  | { state: 'succeeded', image: Buffer }
    //  | { state: 'failed', error: TryOnProviderError }
    // throw TryOnProviderError khi chính lệnh đọc trạng thái lỗi
}

// TryOnProviderError
{
  kind: 'transient' | 'blocked' | 'photo_unusable' | 'input' | 'config',
  costMaybeIncurred: boolean, // true: request có thể đã tới nơi và bị tính tiền
  providerCode: string,       // chỉ tên lỗi, không có message của nhà cung cấp trong log
}
```

Không có `cancel`: job đã gửi coi như không hủy được (D-86).

| Lựa chọn | Lý do |
|---|---|
| Ảnh người gửi bằng **buffer**, ảnh sản phẩm gửi bằng **URL public** | Ảnh người không để lại URL phía nhà cung cấp (D-82). Ảnh sản phẩm vốn công khai (D-46), không phải dữ liệu cá nhân, nên không cần tốn băng thông base64 |
| Poll, **không dùng webhook** | Backend dev không có URL public. Tài liệu webhook không nêu cơ chế xác thực chữ ký [5], phải tự làm. Poll trạng thái lưu ở DB nên khởi động lại vẫn chạy tiếp |

## 2. Adapter giả

`TRYON_PROVIDER=fake` là **mặc định** ở `.env.example`. Toàn bộ unit test, API test và kiểm tra trình duyệt dùng adapter này, không có mạng ra ngoài.

| Hành vi | Cách đặt |
|---|---|
| Thành công sau `TRYON_FAKE_DELAY_MS` | Mặc định. Trả ảnh JPEG sinh bằng sharp, không phải ảnh người |
| Lỗi tạm thời rồi thành công, lỗi tạm thời cả hai lần, bị chặn, lỗi tư thế, lỗi đầu vào, hết credit, không bao giờ xong | Tiền tố tên sản phẩm: `FAKE-TRANSIENT-ONCE`, `FAKE-TRANSIENT`, `FAKE-BLOCKED`, `FAKE-POSE`, `FAKE-INPUT`, `FAKE-NOCREDIT`, `FAKE-HANG` |
| Ghi lại request để kiểm AC-19 | Unit test đọc mảng `calls` của instance giả |

Tên sản phẩm chỉ tới được adapter giả qua `resolveScenario(job)` do `container.js` truyền vào khi `provider = fake`. Adapter thật không nhận gì ngoài hai ảnh.

**Chốt chặn chống gọi thật khi test:**
- `env.js`: `TRYON_PROVIDER=fashn` mà thiếu `FASHN_API_KEY` thì không khởi động; `NODE_ENV=test` mà `TRYON_PROVIDER=fashn` thì không khởi động.
- `tests/postman/run.js` ép `TRYON_PROVIDER=fake` cho tiến trình server, không phụ thuộc `.env`.
- Test của adapter FASHN truyền `fetchImpl` giả; không có test nào dùng `fetch` thật.

## 3. Adapter FASHN

### 3.1 Gửi

`POST https://api.fashn.ai/v1/run`, header `Authorization: Bearer <key>`, tham số nằm trong `inputs` [1].

```json
{
  "model_name": "tryon-v1.6",
  "inputs": {
    "model_image": "data:image/jpeg;base64,<...>",
    "garment_image": "https://<ref>.supabase.co/storage/v1/object/public/product-images/...",
    "category": "auto",
    "garment_photo_type": "flat-lay",
    "mode": "balanced",
    "moderation_level": "permissive",
    "num_samples": 1,
    "output_format": "jpeg",
    "return_base64": true
  }
}
```

Response: `{ "id": "...", "error": null }` [2].

| Tham số | Giá trị | Vì sao |
|---|---|---|
| `category` | `auto` | D-92 |
| `garment_photo_type` | `flat-lay` | Tài liệu nói cần giá trị này để xử lý chính xác ảnh trải phẳng, ví dụ loại nhãn cổ áo [4] |
| `mode` | `balanced` | US-05 Q1. Tài liệu ghi ~8 giây, chưa đo [1] |
| `num_samples` | `1`, ghi tường minh | Mỗi ảnh ra là 1 credit [1] |
| `moderation_level` | `permissive` | Mặc định của tài liệu; chặn khỏa thân, cho đồ bơi và đồ lót. Không dùng `none`. Tài liệu chỉ nói tới loại trang phục, chưa rõ có lọc ảnh người không [1] |
| `return_base64` | `true` | Kết quả có 60 phút thay vì 3 ngày trên CDN; lịch sử request chỉ có placeholder [1][3] |
| `output_format` | `jpeg` | Tài liệu ghi phản hồi nhanh hơn `png`. Backend vẫn mã hóa lại để bỏ metadata (D-78) |

**Bản tạm ảnh người (D-82):** đọc từ bucket private bằng service role, thu về cạnh dài ≤ `FASHN_MODEL_IMAGE_MAX_SIDE` (1536, ước lượng), JPEG, chỉ trong bộ nhớ. Tài liệu ghi ảnh được xử lý ở 864 × 1296 [1], khuyên không resize chỉ để khớp đầu ra và khuyên URL hơn base64 lớn [6]. Ở đây vẫn thu nhỏ vì chọn base64 để bảo vệ riêng tư, và tài liệu không nêu giới hạn kích thước request. Ngưỡng 1536 phải kiểm trong pilot.

**Ảnh sản phẩm:** gửi URL từ `getPublicUrl`. Bản ghi request sẽ giữ chuỗi URL này [3], chấp nhận được vì URL công khai.

### 3.2 Đọc trạng thái

`GET https://api.fashn.ai/v1/status/<id>` [2]. Tài liệu trang tổng quan chỉ nêu `/v1/status/`; đường dẫn đầy đủ cần xác nhận trong pilot.

| `status` | Xử lý |
|---|---|
| `starting`, `in_queue`, `processing` | `pending` |
| `completed` | `output[0]` là chuỗi `data:image/...;base64,...` → `succeeded`. Giá trị `"_expired"` hoặc thiếu → `input`, `costMaybeIncurred: true`, không tự thử lại vì đã mất tiền |
| `failed` | Tra `error.name` ở mục 4 |
| Giá trị khác (`canceled`, `time_out`, chưa biết) | `input`, `costMaybeIncurred: false`, log `providerCode` |

**Giới hạn của FASHN** [2]: `/v1/run` 100 request/60 giây; `/v1/status` 50 request/10 giây; đồng thời mặc định 6. Với `TRYON_SYSTEM_CONCURRENCY=6` và poll 2 giây, tối đa 30 request/10 giây, trong giới hạn.

### 3.3 Timeout của từng request

`FASHN_REQUEST_TIMEOUT_MS` (15 giây), dùng `AbortSignal.timeout`. Khác với hạn 120 giây của job.

## 4. Phân loại lỗi

Lỗi `failed` không tốn credit theo tài liệu [7]. Cột "Tốn tiền?" là cách thiết kế ghi nhận thận trọng vào ngân sách, không phải khẳng định của FASHN.

| Nguồn | Lỗi | `kind` | Mã job | Tự thử lại | Tốn tiền? |
|---|---|---|---|---|---|
| HTTP | 400 `BadRequest` | `input` | `TRYON_FAILED` | Không (E16) | Không |
| HTTP | 401 `UnauthorizedAccess` | `config` | `TRYON_UNAVAILABLE` | Không (E18) | Không |
| HTTP | 404 `NotFound` | `input` | `TRYON_FAILED` | Không | Có thể (đã gửi) |
| HTTP | 429 `RateLimitExceeded`, `ConcurrencyLimitExceeded` | `transient` | `TRYON_FAILED` | Có | Không |
| HTTP | 429 `OutOfCredits` | `config` | `TRYON_UNAVAILABLE` | Không (E18) | Không |
| HTTP | 500 `InternalServerError` | `transient` | `TRYON_FAILED` | Có | Không |
| Runtime | `ContentModerationError` | `blocked` | `TRYON_BLOCKED` | Không, ghi nhớ theo khóa (E14) | Không |
| Runtime | `PoseError` | `photo_unusable` | `TRYON_PHOTO_UNUSABLE` | Không, ghi nhớ theo khóa (E15) | Không |
| Runtime | `ImageLoadError`, `InputValidationError` | `input` | `TRYON_FAILED` | Không (E16) | Không |
| Runtime | `ThirdPartyError`, `UnavailableError`, `PipelineError` | `transient` | `TRYON_FAILED` | Có | Không |
| Mạng | Không kết nối được (chưa gửi được byte nào) | `transient` | `TRYON_FAILED` | Có | Không |
| Mạng | **Hết thời gian chờ khi `POST /run`** | `input` | `TRYON_FAILED` | **Không** | **Có thể** |
| Mạng | Lỗi khi đọc trạng thái | Bỏ qua, poll lại lần sau | — | — | — |

**Vì sao `POST /run` hết giờ không tự thử lại:** request có thể đã tới nơi. Gửi lần hai có thể mất 2 credit trong khi job chỉ giữ chỗ 1 phần ngân sách, làm hỏng cam kết dừng cứng ở D-94.

`ThirdPartyError` lặp lại: tài liệu khuyên coi như bị chặn nội dung [7]. Ở đây vẫn trả `TRYON_FAILED`, không ghi nhớ theo khóa, vì chưa có dữ liệu cho thấy lỗi này ổn định; xem lại sau pilot.

**`config` (hết credit, sai key):** worker tạm dừng nhận job `TRYON_PROVIDER_PAUSE_SECONDS` (300 giây) và log `TRYON_PROVIDER_CONFIG_ERROR`, để không làm hỏng lần lượt mọi job đang xếp hàng. Trong lúc dừng, tạo job mới trả 503 `TRYON_UNAVAILABLE`.

## 5. Chưa xác minh được

| Điều | Hiện trạng | Xử lý trong thiết kế |
|---|---|---|
| **API hủy job** | Trang `fashn-api/endpoints` xuất hiện trong kết quả tìm kiếm có nêu `GET /v1/cancel/:id`, nhưng trang này trả 404 khi mở và không có trong bộ tài liệu `llms-full.txt` hiện hành | Giữ D-86: không dùng hủy |
| **Trạng thái `canceled`, `time_out`** | Chỉ thấy trong ghi chú code mẫu của SDK [8], không có trong danh sách trạng thái [2] | Mọi giá trị lạ xử lý như lỗi, không kẹt job |
| **Giới hạn kích thước base64 đầu vào** | Tài liệu v1.6 không nêu | Thu nhỏ còn cạnh dài 1536, kiểm trong pilot |
| **Độ trễ thật, giá thật** | Số do nhà cung cấp công bố | Pilot đo. Ngân sách là ước tính theo `TRYON_COST_PER_IMAGE_USD`, không đọc số dư thật |
| **Header `x-fashn-credits-used`** | Tài liệu có nêu [2], chưa thấy thực tế | Log để đối chiếu với giá ước tính trong pilot |
| **Lọc ảnh người** | `moderation_level` chỉ nói tới trang phục [1] | Pilot quan sát |
| **Độ phân giải đầu ra** | Trang v1.6 chỉ nêu đầu vào xử lý ở 864 × 1296 [1] | Đọc kích thước thật bằng sharp, lưu vào `tryon_images` |

## 6. Khác với US-05 mục 12

Tài liệu đổi hoặc bản US-05 chưa chính xác; không ảnh hưởng quyết định đã chốt.

| US-05 | Tài liệu hiện tại |
|---|---|
| "6, 50 request/phút" | `/v1/run` 100 request/60 giây; 6 đồng thời [2] |
| Mục 7: "cạnh dài ≤ 2000 px ở endpoint 1K" | Không có con số này ở v1.6 và trang preprocessing [1][6] |
| "chưa thấy nhà cung cấp hỗ trợ hủy" | Vẫn đúng với tài liệu hiện hành; xem mục 5 |

Tài liệu nay ghi Try-On Max là endpoint khuyên dùng cho đa số ứng dụng, còn v1.6 **Stable**, dành cho tích hợp thời gian thực và nhạy về chi phí [9]. Hợp với D-91, là một điểm để so sánh ở pilot.

## 7. Nguồn

Tra ngày 2026-11-06.

1. [FASHN Try-On v1.6](https://docs.fashn.ai/api-reference/tryon-v1-6)
2. [FASHN API Fundamentals](https://docs.fashn.ai/api-overview/api-fundamentals)
3. [FASHN Data Retention & Privacy](https://docs.fashn.ai/api-overview/data-retention-privacy)
4. [FASHN Try-On Parameters Guide](https://docs.fashn.ai/guides/tryon-parameters-guide)
5. [FASHN Webhooks](https://docs.fashn.ai/api-overview/webhooks)
6. [FASHN Image Preprocessing Best Practices](https://docs.fashn.ai/guides/image-preprocessing-best-practices)
7. [FASHN Error Handling](https://docs.fashn.ai/api-overview/error-handling)
8. [FASHN docs, bản đầy đủ](https://docs.fashn.ai/llms-full.txt) (code mẫu SDK)
9. [FASHN Model Lifecycle](https://docs.fashn.ai/api-overview/model-lifecycle), cùng [llms-full](https://docs.fashn.ai/llms-full.txt)
