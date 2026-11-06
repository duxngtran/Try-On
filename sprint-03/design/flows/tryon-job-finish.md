# Luồng: Có kết quả, kết quả về muộn

> US-05 R6, R7, R11, E17, AC-03, AC-11, AC-19 · `complete_tryon_job` · D-77, D-78, D-79, D-80

```mermaid
flowchart TD
  A0([provider trả ảnh]) --> A1["Giải mã, sharp đọc được không?<br/>không tin MIME của dịch vụ"]
  A1 -- Không --> X1
  A1 -- Được --> A2["JPEG không metadata, đọc width, height"]
  A2 --> A3[("reserve_tryon_result_path<br/>so khóa + generation + consent<br/>ghi pending_result_path TRƯỚC khi upload")]
  A3 -- "false: đã hết hiệu lực" --> B1[("complete_tryon_job, path = null")]
  B1 --> B2["discarded<br/>không có file nào được tạo<br/>vẫn tính lượt, chốt ngân sách"]
  A3 -- "true" --> A4["Upload tryon-images/userId/uuid.jpg"]
  A4 -- "Lỗi, thử lại 1 lần vẫn lỗi" --> X1[("fail_tryon_job TRYON_FAILED, cost_incurred<br/>không tính lượt, có tính ngân sách<br/>pending path vào hàng đợi xóa")]
  A4 -- OK --> C0

  subgraph C0 ["complete_tryon_job, một transaction"]
    C1[("profile FOR SHARE -> product FOR SHARE -> job FOR UPDATE")]
    C1 --> C2{"Job còn running?"}
    C2 -- Có --> C3{"Khóa, generation,<br/>consent còn hiện tại?"}
    C3 -- Có --> C4[("Insert tryon_images<br/>succeeded, tính lượt, chốt ngân sách")]
    C3 -- Không --> C5[("File vào hàng đợi xóa<br/>discarded, tính lượt, chốt ngân sách")]
  end

  C2 -- "Không: đã quá hạn" --> C6[("File vào hàng đợi xóa, trả stale<br/>đã chốt ở expire_tryon_jobs")]
  C4 --> D1([Người mua poll thấy succeeded, nhận signed URL])
  C5 --> D2["tryonCleanup.kick()"]
  C6 --> D2
  D2 --> D3([Người mua poll thấy discarded])
```

## Vì sao không có khe

| Thao tác song song | Giữ khóa | Hai thứ tự có thể xảy ra |
|---|---|---|
| Thay/xóa ảnh hồ sơ | `profiles` `FOR UPDATE` | Thay trước: `complete` thấy version khác → bỏ. `complete` trước: ảnh được ghi, rồi trigger xóa ngay trong transaction thay ảnh |
| Rút consent | `profiles` `FOR UPDATE` | Như trên, `generation` khác |
| Rút rồi đồng ý lại | Như trên, 2 lần | Các cột consent hợp lệ trở lại, nhưng `generation` đã khác → bỏ |
| Thay ảnh sản phẩm | `products` `FOR UPDATE` | Như trên, `image_version` khác |
| Xóa mềm sản phẩm | `products`, do lệnh `update` | Như trên, `deleted_at` khác null |

Đã chạy song song trên PostgreSQL thật, xem [`db/README.md`](../db/README.md#10-đã-kiểm-tra-những-gì).

## Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| **Tính lượt cả khi bị bỏ** | Dịch vụ đã sinh xong, tiền đã mất (US-05 R11). Đã nêu rõ ở D-77 |
| Không tính lượt khi lưu lỗi (E17) | Người mua không nhận được gì. Ngân sách vẫn tính vì tiền đã mất |
| Ghi `pending_result_path` trước khi upload | Chết sau upload vẫn biết file nào cần xóa, không phải quét bucket |
| Upload rồi mới ghi DB | Giống D-25. Không bao giờ có dòng trỏ tới file chưa tồn tại |
| Bản tạm và ảnh giải mã không xuống đĩa | D-82 |
| Mã hóa lại dù nhà cung cấp đã trả JPEG | Bỏ metadata (D-78), và chứng minh file đọc được là ảnh (US-05 mục 7) |
