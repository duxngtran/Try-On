# Luồng: Xóa ảnh (Should have)

> US-02 §5.5, AC-12 · `DELETE /api/profile/photo` · D-10, D-12, D-15

```mermaid
flowchart TD
  U([User bấm Xóa ảnh]) --> F1["Hộp thoại: 'Ảnh sẽ bị xóa vĩnh viễn và bạn sẽ<br/>không thể dùng phòng thử đồ cho đến khi tải ảnh mới.'"]
  F1 -- Hủy --> F0([Giữ nguyên])
  F1 -- Xác nhận --> F2["DELETE /api/profile/photo<br/>khóa nút"]
  F2 --> B1[[auth + requireRole user]]
  B1 --> B2[("rpc set_profile_photo(userId, NULL)<br/>trả old_path")]
  B2 -- Lỗi --> E1["500 INTERNAL_ERROR<br/>ảnh vẫn còn"]
  B2 -- OK --> B3{old_path?}
  B3 -- "null (đã không có ảnh)" --> B5["200 {profile} — idempotent,<br/>photo_version không đổi"]
  B3 -- có --> B4["Storage remove(old_path)<br/>thử lại 1 lần; vẫn lỗi → log ORPHAN_PHOTO userId"]
  B4 -.-> B6["200 {profile}<br/>photo = null, photo_version +1,<br/>profileCompleted = false"]
  B5 & B6 --> F3["'Đã xóa ảnh', hiện ô tải ảnh + banner"]
  E1 --> F4[Lỗi chung, ảnh vẫn hiển thị]
```

## Ghi chú
- Ghi DB **trước**, xóa file **sau**: nếu làm ngược và DB lỗi, hồ sơ sẽ trỏ tới file không còn tồn tại.
- Rủi ro còn lại: Storage lỗi cả 2 lần → file mồ côi trong bucket private (không truy cập được nhưng chưa bị xóa thật). Xem câu hỏi mở về script dọn file mồ côi trong báo cáo bước 3.
- `photo_version` tăng cả khi xóa để Epic 3 vô hiệu hóa cache try-on của ảnh cũ (D-15).
- Consent giữ nguyên sau khi xóa ảnh (D-10).
