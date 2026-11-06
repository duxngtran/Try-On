# Luồng: Tạo job, cache, lượt, ngân sách

> US-05 R1, R2, R9, R11, R12, E2, E3, E8–E11, AC-01, AC-02, AC-04, AC-06, AC-16, AC-17, AC-21 · `POST /api/try-on/products/:productId/jobs` · D-49, D-71, D-75, D-76, D-77, D-88, D-90, D-94

Phần trong khung DB là **một transaction** của `create_tryon_job`. Đây là chỗ giữ các bảo đảm khi chạy song song.

```mermaid
flowchart TD
  R(["POST /products/:id/jobs"]) --> M1[["auth + requireRole user"]]
  M1 --> M2{"id đúng UUID?"}
  M2 -- Không --> E404[404 NOT_FOUND]
  M2 -- Có --> M3{"Rate limit 30/phút"}
  M3 -- Vượt --> E429R["429 TOO_MANY_REQUESTS"]
  M3 -- OK --> V1{"zod: purpose"}
  V1 -- Sai --> E400[400 VALIDATION_ERROR]
  V1 -- OK --> DB

  subgraph DB ["create_tryon_job, một transaction"]
    D1[("Khóa profile FOR UPDATE<br/>nối tiếp mọi yêu cầu của người này")]
    D1 --> D2{"profile_completed?"}
    D2 -- Có --> D3{"Consent hiệu lực?"}
    D3 -- Có --> D4[("Sản phẩm chưa xóa? FOR SHARE<br/>đọc image_version hiện tại")]
    D4 -- Có --> D5{"Có tryon_images<br/>theo khóa D-49?"}
    D5 -- Không --> D6{"Có job queued/running<br/>cùng khóa?"}
    D6 -- Không --> D7{"Khóa đã bị chặn<br/>với model hiện tại?"}
    D7 -- Không --> D8{"Display và đang đủ 2 job?"}
    D8 -- Có --> D9["Hủy prefetch chưa gửi của người này"]
    D9 --> D10
    D8 -- Không --> D10{"Vượt giới hạn job?"}
    D10 -- Không --> D11{"Đã tính + đang giữ<br/>vượt ngày/tháng?"}
    D11 -- Không --> D12{"Prefetch: còn ≤ 3 lượt,<br/>hệ thống bận?"}
    D12 -- Không --> D13[("Khóa dòng ngân sách FOR UPDATE")]
    D13 --> D14{"đã chi + đang giữ + 1 ảnh<br/>vượt giới hạn?"}
    D14 -- Không --> D15[("Giữ chỗ ngân sách<br/>insert job queued<br/>chụp photo_version, image_version, generation")]
  end

  D2 -- Không --> E409["409 PROFILE_INCOMPLETE"]
  D3 -- Không --> E403["403 TRYON_CONSENT_REQUIRED"]
  D4 -- Không --> E404
  D5 -- Có --> OK1["200 ready, ký signed URL<br/>kể cả khi hết lượt, hết ngân sách"]
  D6 -- Có --> OK2["202 pending, gắn vào job<br/>display thì nâng ưu tiên"]
  D7 -- Có --> OK3["200 blocked"]
  D10 -- "Display, đủ 4 job" --> E429B["429 TOO_MANY_REQUESTS, thử lại sau 5 giây"]
  D10 -- "Prefetch, đủ 2 job" --> S1["200 skipped busy"]
  D11 -- "Display" --> E429Q["429 TRYON_QUOTA_EXCEEDED<br/>scope day, month, pending"]
  D11 -- "Prefetch" --> S2["200 skipped low_quota"]
  D12 -- Có --> S3["200 skipped low_quota / busy"]
  D14 -- "Display" --> E503["503 TRYON_UNAVAILABLE<br/>log TRYON_BUDGET_EXCEEDED"]
  D14 -- "Prefetch, từ 80%" --> S4["200 skipped budget"]
  D15 --> W1{"Lần đầu vượt 80%?"}
  W1 -- Có --> W2["log TRYON_BUDGET_WARNING"]
  W1 -- Không --> OK4
  W2 --> OK4["202 pending, status queued<br/>đánh thức worker"]
```

`TRYON_ENABLED=false` hoặc đang tạm dừng do lỗi cấu hình: service gọi `get_tryon_result` trước. Có ảnh thì trả ảnh, chưa có thì 503, không tạo job.

## Vòng đời giữ chỗ

```mermaid
flowchart LR
  A["Tạo job:<br/>lượt: +1 đang giữ<br/>ngân sách: reserved + giá"] --> B{Kết thúc}
  B -- "succeeded, discarded" --> C["lượt: tính<br/>ngân sách: reserved → spent"]
  B -- "canceled, dịch vụ báo lỗi" --> D["lượt: trả<br/>ngân sách: trả reserved"]
  B -- "quá hạn sau khi gửi, chết lúc gửi, lưu lỗi" --> E["lượt: trả<br/>ngân sách: reserved → spent"]
```

## Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Client không gửi version hay URL | Khóa đọc từ DB trong transaction (US-05 mục 7) |
| Tra cache trước mọi giới hạn | Ảnh đã có luôn xem được (D-94) |
| Lượt không có bảng đếm riêng | Đếm từ `tryon_jobs`, không lệch số; khóa profile bảo đảm đúng khi song song |
| Không kiểm danh mục riêng | Sản phẩm chưa xóa thì danh mục chưa xóa (D-41) |
| `quota_pending` có nguyên nhân khác `quota_day` | Lượt cuối đang giữ cho job đang chạy, có thể được trả lại, nên `retryAfterSeconds` = 15 |
| Giới hạn ngày, tháng theo giờ Việt Nam | Quyết định ở Q4, `Asia/Ho_Chi_Minh` trong SQL |
| Điều kiện chỉ FE biết (tab ẩn, tiết kiệm dữ liệu, ảnh hiện tại đang lỗi) | Xem [tryon-prefetch](tryon-prefetch.md) |
