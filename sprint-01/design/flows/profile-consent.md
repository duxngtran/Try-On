# Luồng: Ghi nhận consent ảnh

> US-02 §5.2.1, E2, AC-02 · `POST /api/profile/photo-consent` · D-10

```mermaid
flowchart TD
  F0([Trang Hồ sơ đã tải]) --> F1{"profile.consent.accepted?"}
  F1 -- true --> F9([Ẩn checkbox, nút Chọn ảnh mở])
  F1 -- false --> F2["Hiện checkbox consent<br/>nút Chọn ảnh bị khóa"]
  F2 --> U1([User tích checkbox])
  U1 --> F3["POST /api/profile/photo-consent<br/>{ accepted: true }<br/>checkbox disabled + loading"]
  F3 --> B1[[auth + requireRole user]]
  B1 --> B2{"accepted === true (literal)?"}
  B2 -- Không --> B2a[400 VALIDATION_ERROR]
  B2 -- Có --> B3[("UPDATE profiles SET<br/>photo_consent_at = now(),<br/>photo_consent_version = PHOTO_CONSENT_VERSION<br/>WHERE user_id = ? AND (photo_consent_at IS NULL<br/>OR photo_consent_version ≠ PHOTO_CONSENT_VERSION)")]
  B3 --> B4["200 {profile} — idempotent:<br/>đã consent bản hiện hành thì giữ thời điểm lần đầu"]
  B4 --> F9
  B2a --> F4[Bỏ tích, lỗi chung]
  B3 -- Lỗi --> B5[500 INTERNAL_ERROR] --> F4
```

## Ghi chú
- **Vì sao endpoint riêng** (không phải trường trong multipart upload): xem `api.md` §5.3.
- Không có endpoint rút consent (D-10). Xóa ảnh **không** xóa consent.
- `PHOTO_CONSENT_VERSION` là hằng số backend (sprint 01 = `1`) gắn với nội dung câu đồng ý trong US-02 §5.2.1. Khi Epic 3 đổi nội dung (ví dụ đổi nhà cung cấp AI), tăng version → hồ sơ có version cũ được coi là chưa consent và phải đồng ý lại.
- Bỏ tích checkbox sau khi đã đồng ý không có tác dụng (checkbox bị ẩn khi `accepted = true`).
