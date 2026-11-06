# Luồng: Xóa file, dọn 90 ngày, dọn job

> US-05 R13, E17, AC-09 · D-25, D-39, D-79, D-81

Chạy trong tiến trình Express, không dùng `pg_cron` để không phụ thuộc cấu hình Supabase.

## 1. Hàng đợi xóa file

```mermaid
flowchart TD
  A0(["Mỗi TRYON_CLEANUP_TICK_SECONDS, hoặc kick()"]) --> A1[("claim_tryon_file_deletions, SKIP LOCKED<br/>dời lịch thử lại, attempts + 1")]
  A1 --> A2{"Có file?"}
  A2 -- Không --> Z([Xong])
  A2 -- Có --> A3["storage.remove(paths)"]
  A3 -- OK --> A4[("ack_tryon_file_deletions: xóa dòng")]
  A4 --> A1
  A3 -- Lỗi --> A5{"attempts ≥ 5?"}
  A5 -- Có --> A6["log ORPHAN_TRYON_IMAGE, số lượng<br/>không log đường dẫn"]
  A5 -- Không --> Z
  A6 --> Z
```

Giữ dòng khi lỗi: lịch đã dời, lần sau thử lại. Không bỏ cuộc sau N lần, vì đây là dữ liệu nhạy cảm và D-79 nói xóa thật.

## 2. Việc hằng ngày

```mermaid
flowchart TD
  B0(["Mỗi 24 giờ, và khi khởi động server"]) --> B1[("purge_stale_tryon_images(90)<br/>last_viewed_at quá 90 ngày")]
  B1 --> B2["Trigger đưa file vào hàng đợi. Log số lượng"]
  B2 --> B3[("purge_old_tryon_jobs(35)<br/>job đã kết thúc quá 35 ngày")]
  B3 --> B4["Log số lượng"]
```

Chạy khi khởi động: server có thể không sống đủ 24 giờ liên tục ở dev.

## 3. Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Xem lại ảnh sau khi bị dọn | Sinh lại, tính lượt (US-05 R13) |
| `last_viewed_at` cập nhật tối đa 1 lần/ngày | Giảm ghi khi lướt qua lại; mốc 90 ngày không cần chính xác tới phút |
| Generate trước chưa từng xem | `last_viewed_at` bằng lúc tạo, cũng được dọn sau 90 ngày |
| Job giữ 35 ngày | Đếm lượt tháng cần job của tháng hiện tại. Ghi nhớ bị chặn cũng hết sau 35 ngày: có thể thử lại, lỗi không tốn credit theo tài liệu FASHN |
| Dòng ngân sách giữ lâu dài | Không có dữ liệu cá nhân, để đối chiếu chi phí |
| `provider_job_id` mất cùng job | Yêu cầu FASHN xóa bản ghi request cần id này, nên phải làm trong 35 ngày. Cần xem lại nếu ra mắt thật (D-96) |
