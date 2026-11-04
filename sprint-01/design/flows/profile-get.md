# Luồng: Lấy hồ sơ + signed URL

> US-02 §5.1, E13, AC-01, AC-10, AC-11 · `GET /api/profile` · D-09, D-12, D-14

```mermaid
flowchart TD
  U([User mở /profile]) --> F1["GET /api/profile"]
  F1 --> B1[[auth + requireRole user]]
  B1 -- "401 / 403" --> FE1[Theo session-restore.md / trang 403]
  B1 -- OK --> B2[("SELECT height_cm, weight_kg, photo_path,<br/>photo_version, photo_updated_at,<br/>photo_consent_at, photo_consent_version,<br/>profile_completed<br/>FROM profiles WHERE user_id = req.user.id")]
  B2 --> B3{Có dòng?}
  B3 -- "Không (bất thường)" --> B3a["INSERT profiles(user_id) ON CONFLICT DO NOTHING<br/>coi như hồ sơ trống"] --> B4
  B3 -- Có --> B4{photo_path?}
  B4 -- null --> B6
  B4 -- có --> B5["storage.from(bucket).createSignedUrl(<br/>photo_path, SIGNED_URL_TTL_SECONDS)"]
  B5 -- OK --> B5a["photo = {url, expiresAt, version, updatedAt}"] --> B6
  B5 -- Lỗi --> B5b["photo = {url: null, ...}<br/>log userId + mã lỗi"] --> B6
  B6["200 {profile} — tính missing[]"] --> F2

  F2{FE render} --> F3{profileCompleted?}
  F3 -- false --> F4["Banner 'Hoàn thiện hồ sơ...'<br/>liệt kê missing: photo / measurements"]
  F3 -- true --> F5[Không banner]
  F2 --> F6{photo.url?}
  F6 -- null + có photo --> F7["'Không tải được ảnh' + Thử lại"]
  F6 -- có --> F8[img src = url]
  F8 -. "onError (URL hết hạn — E13)" .-> F9{Đã thử làm mới cho URL này?}
  F9 -- Chưa --> F1
  F9 -- Rồi --> F7
  F8 -. "Trước expiresAt ~60s và trang còn mở" .-> F1
```

## Ghi chú
- `user_id` luôn lấy từ token, API không nhận id từ client (AC-11).
- Frontend không bao giờ nhận `photo_path` thô hay URL public; chỉ nhận signed URL (AC-10).
- Giới hạn làm mới 1 lần / URL để tránh vòng lặp khi Storage lỗi.
- `missing[]` do backend tính (cùng hàm với `profile_completed`) để FE không tự suy luận.
