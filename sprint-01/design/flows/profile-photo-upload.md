# Luồng: Tải lên / thay ảnh toàn thân

> US-02 §5.2, §7.1, E2–E12, E14–E16, AC-02 → AC-06, AC-09 · `PUT /api/profile/photo` · D-10, D-11, D-12, D-15

## 1. Frontend

```mermaid
flowchart TD
  U0([Consent đã có — profile-consent.md]) --> U1["User bấm Chọn ảnh<br/>input accept=image/jpeg,image/png,image/webp"]
  U1 --> F1{"Kiểm tra sơ bộ:<br/>type, size ≤ 10 MB"}
  F1 -- Sai --> F1a[Lỗi tương ứng, không preview]
  F1 -- OK --> F2["Đọc kích thước qua Image()<br/>(trình duyệt đã tự xoay theo EXIF)"]
  F2 --> F3{"≥512×1024, cạnh dài ≤8000,<br/>tỉ lệ cao/rộng 1,3–2,5?"}
  F3 -- Sai --> F1a
  F3 -- "Không đọc được" --> F1a
  F3 -- OK --> F4[Preview + checklist tự kiểm tra]
  F4 --> U2([User bấm Lưu ảnh])
  U2 --> F5["PUT multipart field 'photo'<br/>onUploadProgress → thanh tiến trình<br/>khóa nút, AbortController"]
  F5 --> F6{Response}
  F6 -- 200 --> F7["'Đã cập nhật ảnh'<br/>thay ảnh bằng photo.url mới<br/>cập nhật profileCompleted"]
  F6 -- "4xx" --> F8[Thông báo theo error.code<br/>ảnh cũ giữ nguyên, giữ preview]
  F6 -- "500 UPLOAD_FAILED / INTERNAL_ERROR" --> F8
  F6 -- "Mất mạng (E12)" --> F9["'Mất kết nối, vui lòng thử lại.'<br/>giữ preview để gửi lại"]
```

Kiểm tra ở FE chỉ để phản hồi nhanh; backend kiểm tra lại toàn bộ.

## 2. Backend

```mermaid
flowchart TD
  R([PUT /api/profile/photo]) --> M1[[auth + requireRole user]]
  M1 --> M2{"Rate limit theo req.user.id<br/>PHOTO_UPLOADS_PER_HOUR"}
  M2 -- Vượt --> E14[429 TOO_MANY_REQUESTS]
  M2 -- OK --> M3[("SELECT photo_consent_at, photo_consent_version")]
  M3 --> M4{"Consent bản hiện hành?"}
  M4 -- Không --> E2["400 CONSENT_REQUIRED<br/>(trước khi nhận file)"]
  M4 -- Có --> M5["multer memoryStorage<br/>field 'photo', files: 1, fileSize: PHOTO_MAX_MB"]
  M5 -- "LIMIT_FILE_SIZE" --> E5[413 FILE_TOO_LARGE]
  M5 -- "Không có file" --> E3[400 FILE_REQUIRED]
  M5 -- "Sai tên field / >1 file" --> E0[400 VALIDATION_ERROR]
  M5 -- OK --> I1["file-type(buffer) — magic bytes<br/>bỏ qua mimetype/tên file client"]
  I1 --> I2{"jpeg / png / webp?"}
  I2 -- Không --> E4[400 INVALID_FILE_TYPE]
  I2 -- Có --> I3["sharp(buffer, {limitInputPixels: 8000×8000,<br/>failOn: 'error'}).metadata()<br/>(chỉ đọc header)"]
  I3 -- Lỗi decode --> E8[400 INVALID_IMAGE]
  I3 --> I4{"pages > 1 (ảnh động)?"}
  I4 -- Có --> E4
  I4 -- Không --> I5["w, h sau EXIF: orientation 5–8 → hoán đổi w/h"]
  I5 --> I6{"max(w,h) ≤ 8000?"}
  I6 -- Không --> E15[400 IMAGE_TOO_LARGE]
  I6 -- Có --> I7{"w ≥ 512 và h ≥ 1024?"}
  I7 -- Không --> E6[400 IMAGE_TOO_SMALL]
  I7 -- Có --> I8{"1,3 ≤ h/w ≤ 2,5?"}
  I8 -- Không --> E7[400 INVALID_ASPECT_RATIO]
  I8 -- Có --> I9["sharp pipeline:<br/>.rotate() theo EXIF<br/>.resize 2048 fit inside, withoutEnlargement<br/>.flatten nền trắng (PNG/WEBP có alpha)<br/>.jpeg quality 85 — không giữ metadata"]
  I9 -- Lỗi --> E8
  I9 --> S1["newPath = userId/uuid.jpg"]
  S1 --> S2["Storage upload(newPath, buffer,<br/>contentType image/jpeg, upsert: false)"]
  S2 -- Lỗi --> E10["500 UPLOAD_FAILED<br/>DB chưa đổi → ảnh cũ giữ nguyên"]
  S2 -- OK --> D1[("rpc set_profile_photo(userId, newPath)<br/>khóa dòng, trả old_path, photo_version+1,<br/>photo_updated_at = now()")]
  D1 -- Lỗi --> D2["Storage remove(newPath)<br/>(best-effort, thử lại 1 lần)"]
  D2 --> E11[500 INTERNAL_ERROR]
  D1 -- OK --> D3{old_path?}
  D3 -- có --> D4["Storage remove(old_path)<br/>best-effort, thử lại 1 lần;<br/>vẫn lỗi → log ORPHAN_PHOTO userId"]
  D3 -- null --> D5
  D4 -.-> D5["Đọc hồ sơ + createSignedUrl(newPath)<br/>(lỗi ký URL → photo.url = null)"]
  D5 --> OK["200 {profile}<br/>photo.version mới, profileCompleted"]
```

## 3. Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Thứ tự **upload file mới → ghi DB → xóa file cũ** | Lỗi ở bất kỳ bước nào trước khi ghi DB thì hồ sơ vẫn trỏ ảnh cũ (AC-05) |
| DB lỗi → xóa file mới vừa tải | Không để file mồ côi (E11) |
| Xóa file cũ là best-effort, **không** làm request lỗi | Ảnh mới đã có hiệu lực; trả lỗi lúc này sẽ khiến FE báo sai "ảnh cũ giữ nguyên" |
| Cập nhật đường dẫn bằng hàm SQL `set_profile_photo` (1 câu lệnh, khóa dòng) | Hai upload đồng thời: mỗi request nhận đúng `old_path` của mình → không mất dấu file nào; `photo_version` tăng nguyên tử (D-15) |
| Kiểm tra consent **trước** multer | Không nhận 10 MB vô ích; khớp AC-02 (`CONSENT_REQUIRED` ưu tiên hơn lỗi file) |
| Đọc `metadata()` (header) trước khi decode toàn ảnh | Chặn ảnh quá lớn/ảnh "bom" sớm, rẻ |
| Kích thước so sánh **sau** khi áp EXIF orientation | Ảnh dọc chụp bằng điện thoại thường lưu ngang + orientation 6 (T-25) |
| Rate limit đếm **mọi** request upload (kể cả bị từ chối) | Chống lạm dụng CPU xử lý ảnh; FE đã lọc sơ bộ nên user bình thường hiếm khi chạm ngưỡng |
| Log chỉ `userId` + mã lỗi, không log `newPath`/`old_path` | US-02 §9 |

Thứ tự ưu tiên mã lỗi khi một file sai nhiều quy tắc: `CONSENT_REQUIRED` → `FILE_TOO_LARGE` / `FILE_REQUIRED` → `INVALID_FILE_TYPE` → `INVALID_IMAGE` → `IMAGE_TOO_LARGE` → `IMAGE_TOO_SMALL` → `INVALID_ASPECT_RATIO`.
