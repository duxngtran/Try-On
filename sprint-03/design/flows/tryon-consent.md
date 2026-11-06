# Luồng: Đồng ý và rút đồng ý gửi ảnh

> US-05 §5.2, R4, E3, AC-02, AC-10, AC-11 · `POST`, `DELETE /api/try-on/consent` · D-10, D-22, D-79, D-93

## 1. Đồng ý

```mermaid
flowchart TD
  U0([Người mua tích ô đồng ý]) --> F1["POST /try-on/consent { accepted: true }"]
  F1 --> B1{"zod: accepted = true?"}
  B1 -- Không --> E400[400 VALIDATION_ERROR]
  B1 -- Có --> D1[("accept_tryon_consent<br/>chỉ ghi khi chưa có, đã rút, hoặc lệch phiên bản")]
  D1 --> OK["200 state"]
  OK --> F2[Vào danh sách danh mục]
```

## 2. Rút

Nút ở trang Hồ sơ, có hộp thoại xác nhận nói rõ ảnh thử đồ sẽ bị xóa, ảnh hồ sơ giữ nguyên.

```mermaid
flowchart TD
  U0([Người mua bấm Rút đồng ý, xác nhận]) --> F1["DELETE /try-on/consent"]
  F1 --> D1[("withdraw_tryon_consent, một transaction:<br/>khóa dòng profile<br/>withdrawn_at = now, generation + 1<br/>xóa mọi tryon_images của người này<br/>trigger đưa file vào hàng đợi xóa<br/>hủy job queued, trả giữ chỗ")]
  D1 --> K1["tryonCleanup.kick()"]
  K1 -.-> K2["Xóa file khỏi Storage<br/>lỗi thì hàng đợi thử lại"]
  D1 --> OK["200 state, consent.accepted = false"]
  OK --> F2["FE gỡ ảnh try-on khỏi bộ nhớ trang"]
```

## 3. Job đang gửi lúc rút

```mermaid
flowchart TD
  J0{"Job đang ở đâu?"}
  J0 -- "queued" --> J1["Đã hủy trong transaction rút.<br/>Không gửi, không tính lượt"]
  J0 -- "running, chưa gửi" --> J2["check_tryon_job_before_submit phát hiện,<br/>hủy, không gửi, không tính lượt"]
  J0 -- "running, đã gửi" --> J3["Không thu hồi được.<br/>Kết quả về bị bỏ, vẫn tính lượt"]
```

## 4. Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Consent lưu ảnh (D-22) và consent gửi ảnh (D-93) độc lập | Ảnh có consent cũ giữ nguyên, upload không bị ảnh hưởng, nhưng không gửi đi |
| `PHOTO_CONSENT_VERSION` giữ 1, chỉ sửa modal chi tiết ở Hồ sơ | Tăng số này sẽ chặn upload của mọi người (phương án đã loại ở Q3). Việc gửi ảnh đã được chặn bởi consent mới. Đề xuất D-102 |
| `generation` tăng mỗi lần rút | Rút rồi đồng ý lại vẫn bỏ kết quả về muộn (D-79) |
| Rút là idempotent | Bấm hai lần, hai tab không lỗi |
| Không xóa được phần đã gửi | Câu consent đã nói rõ. Bản ghi request ở FASHN không tự xóa; dùng `provider_job_id` nếu phải yêu cầu xóa qua email |
| Tuổi là tự khai, không thu ngày sinh | D-08, D-93 |
