# Luồng: Worker gửi, poll, retry, lỗi

> US-05 R7, R8, R10, R12, E12–E19, AC-14, AC-15, AC-19, AC-20; US-06 R4, R6, AC-07, AC-08 · D-75, D-76, D-82, D-86, D-90, D-91

Worker là vòng lặp trong tiến trình Express, tick mỗi `TRYON_WORKER_TICK_MS` (1 giây), được đánh thức ngay khi có job mới. **Không giữ trạng thái job trong bộ nhớ**; khởi động lại thì chạy tiếp từ DB.

## 1. Mỗi tick

```mermaid
flowchart TD
  T0([Tick]) --> A[("expire_tryon_jobs<br/>quá 120 giây; chết giữa lúc gửi")]
  A --> B{"Đang tạm dừng<br/>do lỗi cấu hình?"}
  B -- Có --> P
  B -- Không --> C[("claim_tryon_jobs, advisory lock:<br/>hủy queued không ai theo dõi quá 8 giây<br/>display trước, prefetch sau<br/>≤ 2 running/người, ≤ 6 toàn hệ thống<br/>job hết hiệu lực thì hủy")]
  C --> S["Với mỗi job nhận được: gửi, mục 2"]
  S --> P[("next_tryon_polls")]
  P --> Q["Với mỗi job đến lượt: poll, mục 3"]
```

## 2. Gửi đi

```mermaid
flowchart TD
  S0([Job running, chưa có provider_job_id]) --> S1["Tải ảnh hồ sơ từ bucket private bằng service role"]
  S1 -- Lỗi --> F1
  S1 --> S2["Bản tạm: thu nhỏ, JPEG, chỉ trong bộ nhớ (D-82)"]
  S2 --> S3[("check_tryon_job_before_submit<br/>so khóa, generation, consent")]
  S3 -- canceled --> S4["Dừng. Đã hủy, trả giữ chỗ, không gửi gì"]
  S3 -- ok --> S5["provider.submit: chỉ ảnh người, URL ảnh sản phẩm,<br/>tham số kỹ thuật (AC-19)"]
  S5 -- Thành công --> S6[("mark_tryon_job_submitted")]
  S5 -- "TryOnProviderError" --> F1["Phân loại, mục 4"]
```

Tiến trình chết sau khi gửi mà chưa kịp ghi `provider_job_id`: hết lease 30 giây, `expire_tryon_jobs` đánh dấu `failed`, tính vào ngân sách vì không biết request đã tới chưa.

## 3. Poll

```mermaid
flowchart TD
  Q0([Job đến lượt poll]) --> Q1["provider.getStatus"]
  Q1 -- "Lỗi mạng" --> Q2["Bỏ qua, lần sau poll lại"]
  Q1 -- pending --> Q3["Chờ, đã dời lịch 2 giây"]
  Q1 -- succeeded --> Q4["Sang tryon-job-finish"]
  Q1 -- failed --> F1["Phân loại, mục 4"]
```

## 4. Phân loại lỗi

Bảng ánh xạ đầy đủ ở [`tryon-provider.md`](../tryon-provider.md#4-phân-loại-lỗi).

```mermaid
flowchart TD
  F0{"kind"} -- transient --> F1[("fail_tryon_job, retry sau 2 giây")]
  F1 --> F2{"Lần đầu và còn hạn?"}
  F2 -- Có --> F3["Về queued, lần nhận sau gửi lại<br/>vẫn giữ chỗ"]
  F2 -- Không --> F4["failed TRYON_FAILED<br/>trả lượt"]
  F0 -- blocked --> F5["failed TRYON_BLOCKED<br/>ghi nhớ theo khóa, không retry"]
  F0 -- photo_unusable --> F6["failed TRYON_PHOTO_UNUSABLE<br/>ghi nhớ theo khóa, không retry"]
  F0 -- input --> F7["failed TRYON_FAILED, không retry<br/>log mức lỗi cho vận hành"]
  F0 -- config --> F8["failed TRYON_UNAVAILABLE<br/>tạm dừng nhận job 5 phút<br/>log TRYON_PROVIDER_CONFIG_ERROR"]
```

## 5. Hủy và ưu tiên

| Tình huống | Xử lý | Bảo đảm ở |
|---|---|---|
| Rời sản phẩm khi job `queued`, không tab nào poll nữa | Quá 8 giây không poll, `claim` hủy, trả giữ chỗ (AC-07) | DB |
| Rời sản phẩm khi job đã gửi | Không hủy được (D-86). Kết quả vẫn lưu, tính lượt (AC-06) | DB |
| Hai tab cùng theo dõi một job | Một tab rời đi không ảnh hưởng tab kia, vì không có lệnh hủy, chỉ dựa vào lần poll cuối | DB |
| Job `display` mới khi đã đủ 2 job | Hủy `prefetch` chưa gửi; job mới xếp hàng, đi trước `prefetch` ở lần nhận sau (R6) | DB |
| Đã có 2 job `running`, không còn `prefetch` chưa gửi | Job `display` nằm `queued`, người mua thấy trạng thái chờ bình thường (E10) | DB |

## 6. Không có gì được log

Log có: `jobId`, `productId`, `userId`, `providerCode`, thời gian. Không có: ảnh, base64, signed URL, đường dẫn, số đo, API key, message gốc của nhà cung cấp (AC-20). Message của nhà cung cấp có thể lặp lại nội dung đầu vào.
