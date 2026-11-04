# Screen Descriptions — Hồ sơ

> US-02 (toàn bộ), AC-01 → AC-12 · API: `GET /api/profile`, `PUT /api/profile/measurements`, `POST /api/profile/photo-consent`, `PUT|DELETE /api/profile/photo` · D-09 → D-15, D-22, D-24 · Flows: `design/flows/profile-*.md`

## Hồ sơ — `/profile`

### Mục đích
Nơi user hoàn thiện hồ sơ để dùng phòng thử đồ: đồng ý sử dụng ảnh (consent), tải/thay/xóa **1 ảnh toàn thân**, nhập chiều cao/cân nặng. Là trang onboarding sau đăng ký.

### Quyền truy cập
**Đã đăng nhập, role `user`** (RequireAuth). Admin vào `/profile` → chuyển `/admin` (D-14, D-28). Chưa đăng nhập → `/login` (kèm `state.from`).

### Bố cục
- **Mobile (< 640px)**: một cột, padding 16px, khoảng cách section 24px. Thứ tự: H1 → **Banner hoàn thiện hồ sơ** → Card ① Ảnh toàn thân → Card ② Số đo. Trong card ①: khung ảnh/dropzone `aspect-[3/4]` rộng tối đa 320px căn giữa → consent → nút → hướng dẫn chụp (mở sẵn dạng accordion thu gọn "Hướng dẫn chụp ảnh chuẩn", mặc định **mở** khi chưa có ảnh, **đóng** khi đã có ảnh). Nút hành động chính full-width.
- **Tablet (640–1023px)**: vẫn một cột, `max-w-2xl` căn giữa; khung ảnh rộng 320px nằm trái, hướng dẫn nằm phải trong card ① (hai cột 320px / còn lại) nếu đủ chỗ (≥ 720px), ngược lại xếp dọc.
- **Desktop (≥ 1024px)**: `max-w-5xl`, lưới 12 cột, gap 32px. **Trái (5 cột, sticky `top-24`)**: card ① Ảnh (khung ảnh lớn 3:4 + nút + consent). **Phải (7 cột)**: Banner → Hướng dẫn chụp ảnh (luôn mở, kèm ảnh minh họa đúng/sai) → card ② Số đo. Nút trong form đặt cạnh nhau, căn trái, không full-width.

### Các thành phần chính
1. **H1** "Hồ sơ của bạn" (`display`) + phụ đề "Ảnh và số đo giúp chúng tôi tạo ảnh thử đồ giống bạn nhất." (mobile ẩn phụ đề nếu quá dài).
2. **Banner/Trạng thái hồ sơ** (Card nhỏ, nền `accent-soft`, `role="status"`):
   - **Chưa đầy đủ** (`profileCompleted=false`): tiêu đề "Hoàn thiện hồ sơ để bắt đầu thử đồ" + tiến độ "Đã xong X/2 bước" (thanh 2 đoạn) + danh sách `missing[]` mỗi dòng icon + chữ + link neo: "Ảnh toàn thân" (`missing` chứa `photo`) → cuộn/focus card ①; "Chiều cao và cân nặng" (`measurements`) → cuộn/focus ô Chiều cao. Mục đã xong có icon `CheckCircle2` `success` và gạch ngang nhẹ + chữ ẩn "đã xong".
   - **Đầy đủ**: Alert success, icon `CheckCircle2`: "Hồ sơ đã đầy đủ. Bạn có thể bắt đầu thử đồ." + nút link "Về trang chủ" (secondary, → `/`). (Phòng thử đồ chưa có ở sprint 01; Epic 3 sẽ đổi CTA thành "Vào phòng thử đồ".) Hiệu ứng: thay thế banner cũ bằng cross-fade 200ms; tự thu gọn thành 1 dòng sau lần hiển thị đầu.
3. **Card ① "Ảnh toàn thân"** (eyebrow `caption`: "BƯỚC 1"), gồm:
   a. **Khối consent** (xem 3 dưới).
   b. **Khung ảnh** (một component `PhotoFrame` đổi theo trạng thái, xem bảng trạng thái ảnh).
   c. **Thanh tiến trình tải** (khi đang gửi).
   d. **Lỗi ảnh** (Alert danger ngay dưới khung ảnh, `role="alert"`).
   e. **Nút hành động** theo trạng thái (Chọn ảnh / Lưu ảnh + Chọn ảnh khác / Thay ảnh + Xóa ảnh).
   f. **Checklist tự kiểm tra** (hiện cùng preview).
4. **Khối consent** — checkbox (7.3 design system) + nhãn đầy đủ: *"Tôi đồng ý cho Try-on lưu trữ và sử dụng ảnh này để tạo ảnh thử đồ, bao gồm việc gửi ảnh tới dịch vụ AI xử lý ảnh."* Chỉ hiển thị khi `consent.accepted=false`. Khi tích: gọi `POST /photo-consent {accepted:true}` ngay (ghi nhận tức thì, D-22):
   - Đang gọi: checkbox disabled + spinner nhỏ cạnh nhãn, chữ ẩn "Đang ghi nhận".
   - Thành công: khối consent thu gọn thành dòng `small` `success` "Bạn đã đồng ý sử dụng ảnh" (icon `CheckCircle2`) và mở khóa nút Chọn ảnh (animation fade 200ms). Consent đã có từ trước (`accepted=true`) → chỉ hiện dòng này (không còn checkbox).
   - Lỗi (mạng/500): bỏ tích, lỗi dưới checkbox "Chưa ghi nhận được sự đồng ý của bạn, vui lòng thử lại."; 401 → xử lý toàn cục.
   - Nếu `consent.version` đổi (consent trả `accepted=false` dù từng đồng ý): hiện lại checkbox kèm chú thích `small` "Điều khoản sử dụng ảnh đã cập nhật, vui lòng đồng ý lại."
   - Văn bản consent có link "Xem chi tiết" (mở modal giải thích: ảnh lưu riêng tư, gửi tới dịch vụ AI, xóa ảnh bất cứ lúc nào để dừng sử dụng; admin không xem được ảnh).
5. **Hướng dẫn chụp ảnh chuẩn** (`<details>` / accordion, tiêu đề "Hướng dẫn chụp ảnh chuẩn"):
   - Danh sách ✓: "Một người duy nhất, đứng thẳng, nhìn thẳng, tay buông xuôi hoặc hơi tách khỏi thân." · "Thấy rõ toàn thân từ đỉnh đầu đến bàn chân, không bị cắt." · "Ảnh dọc, đủ sáng, nền đơn giản, không vật cản phía trước cơ thể." · "Mặc đồ ôm vừa người (tránh áo khoác dày, váy rộng)."
   - Thông số kỹ thuật `small`: "JPG, PNG hoặc WEBP · tối đa 10 MB · tối thiểu 512 × 1024 px · ảnh dọc."
   - **Ảnh minh họa đúng/sai**: lưới 2x2 (mobile cuộn ngang snap) gồm 1 ảnh "Nên" (đứng thẳng, đủ toàn thân; viền `success`, nhãn "Nên" + icon `Check`) và 3 ảnh "Không nên" (bị cắt chân, ngồi/nghiêng người, nhiều người/áo rộng; viền `danger`, nhãn "Không" + icon `X`). Ảnh minh họa là hình vẽ nét/silhouette (asset tĩnh `frontend/src/assets/guide/`), mỗi ảnh có `alt` mô tả và nhãn chữ (không phụ thuộc màu).
6. **Checklist tự kiểm tra** (hiện khi có preview, trước nút Lưu ảnh): tiêu đề `small` "Kiểm tra nhanh trước khi lưu" + 4 checkbox: "Thấy từ đầu đến chân" · "Chỉ có một mình tôi" · "Đứng thẳng, nhìn thẳng" · "Nền đơn giản, đủ sáng". **Không bắt buộc** (không khóa nút Lưu — hệ thống không kiểm tra tự động, D-11); chỉ nhắc nhở. Lựa chọn không gửi lên server. (Câu hỏi mở số 2.)
7. **Card ② "Số đo"** (eyebrow "BƯỚC 2"): 2 ô nằm cùng hàng từ `sm` (mobile: xếp dọc):
   - **Chiều cao** — label "Chiều cao", đơn vị "cm" bên phải ô, `inputmode="numeric"`, placeholder "165". Hint "Từ 100 đến 250 cm."
   - **Cân nặng** — label "Cân nặng", đơn vị "kg", `inputmode="decimal"`, placeholder "52,5". Hint "Từ 30 đến 250 kg, tối đa 1 chữ số thập phân." Chấp nhận `,` và `.`; hiển thị lại đúng ký tự user nhập; FE đổi `,`→`.` và gửi **số** (JSON number).
   - **Nút "Lưu thông tin"** (primary): disabled (kiểu `aria-disabled`, vẫn focus được) khi giá trị chưa đổi so với server; cạnh nút là dòng `small` "Đã lưu lúc HH:mm" sau khi lưu thành công (ẩn khi bắt đầu sửa lại).
   - Ghi chú quyền riêng tư `small` dưới form: "Số đo chỉ dùng để tạo ảnh thử đồ và không hiển thị cho người khác." (icon `Lock`).
8. **Modal xác nhận xóa ảnh** (mục 7.9): tiêu đề "Xóa ảnh?"; nội dung "Ảnh sẽ bị xóa vĩnh viễn và bạn sẽ không thể dùng phòng thử đồ cho đến khi tải ảnh mới."; nút "Hủy" (focus mặc định) + "Xóa ảnh" (danger). Loading: nút "Đang xóa…", cả hai disabled, không đóng được bằng Esc/scrim.
9. **Toast** (7.4): thành công "Đã cập nhật ảnh" / "Đã lưu thông tin" / "Đã xóa ảnh"; mỗi toast có `role="status"`.

### Trạng thái trang
| Trạng thái | Mô tả |
|---|---|
| **Loading lần đầu** (`GET /api/profile`) | Skeleton: tiêu đề thật + banner skeleton + khung ảnh skeleton 3:4 + 2 ô input skeleton (cao 48px); `aria-busy="true"` trên `main`; không hiện nút. Làm mới nền khi quay lại tab (không skeleton) |
| **Lỗi tải hồ sơ** (mạng/500) | Error state thay nội dung: "Không tải được hồ sơ. Vui lòng thử lại." + nút "Thử lại". 401 → xử lý toàn cục; 403 (admin lọt vào) → chuyển `/admin` |
| **Hồ sơ trống** (user mới, AC-01) | Banner "Hoàn thiện hồ sơ" 0/2 liệt kê 2 mục; dropzone khóa; consent chưa tích; số đo trống |
| **Hồ sơ đầy đủ** | Banner success; ảnh hiện; số đo điền sẵn |

### Trạng thái khối ảnh (`PhotoFrame`)
| # | Trạng thái | Khung ảnh | Nút / hành động |
|---|---|---|---|
| A | Chưa consent, chưa ảnh | Dropzone **disabled** (nhạt), chú thích trong khung "Đồng ý bên dưới để chọn ảnh" | Nút "Chọn ảnh" disabled (`aria-disabled`, `aria-describedby` trỏ chú thích); checkbox consent hiện |
| B | Đã consent, chưa ảnh | Dropzone enabled (nhấn mở trình chọn file; desktop kéo-thả) | "Chọn ảnh" (primary). Mobile: input file hỗ trợ thư viện + camera (`accept` ảnh; không ép `capture`) |
| C | Đang kiểm tra file ở FE | Spinner nhỏ trong khung (≤ 300ms thường không thấy) | Nút disabled |
| D | **Có preview chưa lưu** | Ảnh preview (`object-contain`, nhãn góc "Xem trước") + checklist tự kiểm tra | "Lưu ảnh" (primary) + "Chọn ảnh khác" (secondary) + "Hủy" (ghost, bỏ preview và về A/B hoặc ảnh hiện tại) |
| E | **Đang tải lên** | Preview mờ 60% + lớp phủ progress | Progress bar `role="progressbar"` "Đang tải lên… 64%"; về 100% → "Đang xử lý ảnh…" (indeterminate); nút Lưu loading, nút khác disabled; thêm "Hủy tải" (ghost, `AbortController`) chỉ khi chưa xong |
| F | Lỗi (FE hoặc API) | Giữ preview (D) hoặc ảnh cũ | Alert danger dưới khung (bảng lỗi) + "Lưu ảnh" cho phép gửi lại (nếu lỗi tạm thời) / "Chọn ảnh khác" (nếu file sai) |
| G | **Có ảnh đã lưu** | Ảnh (`photo.url`) `object-contain` trên nền `surface-muted`, `alt="Ảnh toàn thân của bạn"`; nhãn nhỏ "Cập nhật <ngày giờ>" | "Thay ảnh" (secondary) + "Xóa ảnh" (ghost danger, icon `Trash2`) |
| H | Có ảnh nhưng `photo.url = null` | Khung `surface-muted` + icon `ImageOff` + "Không tải được ảnh" | "Thử lại" (gọi lại `GET /profile`), vẫn có "Thay ảnh"/"Xóa ảnh" |
| I | Ảnh đang tải về (img chưa load) | Skeleton 3:4 shimmer cho tới `onLoad` | — |
| J | Ảnh vừa lưu thành công | Cross-fade từ preview → ảnh mới 200ms, toast "Đã cập nhật ảnh", focus chuyển về nút "Thay ảnh" | — |

Quy tắc ảnh: signed URL hết hạn (`onError`) → tự gọi lại `GET /profile` **1 lần/URL** rồi nếu vẫn lỗi → trạng thái H; làm mới URL ngầm trước `expiresAt` ~60 giây (trang còn mở) không nhấp nháy ảnh (chỉ đổi `src` khi ảnh mới đã preload). Thay ảnh khi đang xem ảnh cũ: ảnh cũ giữ nguyên tới khi 200 OK (AC-05). Revoke `URL.createObjectURL` khi bỏ preview.

### Kiểm tra file ở frontend (trước khi gọi API; khớp D-11) và thông báo
| Lỗi | Thông báo |
|---|---|
| Không phải JPG/PNG/WEBP (theo `file.type`) | "Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP." |
| > 10 MB | "Ảnh tối đa 10 MB." |
| Không đọc được bằng `Image()` | "Không đọc được ảnh, vui lòng chọn ảnh khác." |
| Rộng < 512 hoặc cao < 1024 | "Ảnh cần tối thiểu 512 × 1024 px." |
| Cạnh dài > 8000 | "Ảnh quá lớn, cạnh dài tối đa 8000 px." |
| Tỉ lệ cao/rộng ngoài 1,3–2,5 (kể cả ảnh ngang) | "Vui lòng dùng ảnh dọc chụp toàn thân." |
Lỗi FE hiện trong Alert dưới khung, **không** hiện preview, giữ nguyên ảnh cũ; Alert kèm chi tiết `small` "Ảnh của bạn: 1920 × 1080 px" khi có kích thước.

### Map mã lỗi API → hiển thị
| HTTP / mã | Vị trí | Thông báo tiếng Việt | Hành vi |
|---|---|---|---|
| 401 `UNAUTHORIZED` / `TOKEN_EXPIRED` | Toàn cục | (chuyển `/login`, notice hết phiên) | Xóa token |
| 403 `FORBIDDEN` | — | Chuyển `/admin` (chỉ admin) | — |
| 400 `CONSENT_REQUIRED` | Khối consent | "Vui lòng đồng ý điều khoản sử dụng ảnh trước khi tải lên." | Hiện lại checkbox chưa tích, focus nó, giữ preview |
| 400 `FILE_REQUIRED` | Alert ảnh | "Vui lòng chọn ảnh." | Về trạng thái B |
| 400 `INVALID_FILE_TYPE` | Alert ảnh | "Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP." | Giữ ảnh cũ; bỏ preview lỗi |
| 413 `FILE_TOO_LARGE` | Alert ảnh | "Ảnh tối đa 10 MB." | như trên |
| 400 `IMAGE_TOO_SMALL` | Alert ảnh | "Ảnh cần tối thiểu 512 × 1024 px." | như trên |
| 400 `IMAGE_TOO_LARGE` | Alert ảnh | "Ảnh quá lớn, cạnh dài tối đa 8000 px." | như trên |
| 400 `INVALID_ASPECT_RATIO` | Alert ảnh | "Vui lòng dùng ảnh dọc chụp toàn thân." | như trên |
| 400 `INVALID_IMAGE` | Alert ảnh | "Không đọc được ảnh, vui lòng chọn ảnh khác." | như trên |
| 400 `VALIDATION_ERROR` (upload/consent) | Alert ảnh | "Tải ảnh thất bại, vui lòng thử lại." | Cho phép gửi lại |
| 400 `VALIDATION_ERROR` + `details[]` (số đo) | Dưới ô `heightCm` / `weightKg` | `details[].message` ("Chiều cao phải từ 100 đến 250 cm." / "Cân nặng phải từ 30 đến 250 kg.") | Focus ô lỗi đầu; dữ liệu cũ trên server không đổi |
| 429 `TOO_MANY_REQUESTS` (upload) | Alert warning dưới khung (icon `Clock`) | "Bạn thao tác quá nhanh, vui lòng thử lại sau." + đếm ngược "Thử lại sau mm:ss" nếu có `retryAfterSeconds` (nếu không có: "Bạn đã tải ảnh quá nhiều lần trong 1 giờ, vui lòng thử lại sau.") | Nút "Lưu ảnh"/"Chọn ảnh"/"Thay ảnh" disabled tới hết giờ; giữ preview; hết giờ → Alert info "Bạn có thể tải ảnh lại." |
| 500 `UPLOAD_FAILED` / `INTERNAL_ERROR` | Alert ảnh | "Tải ảnh thất bại, vui lòng thử lại." | Giữ preview + ảnh cũ; nút Lưu ảnh gửi lại |
| 500 khi lưu số đo / xóa ảnh | Alert danger đầu form tương ứng | "Có lỗi xảy ra, vui lòng thử lại." | Giữ dữ liệu đã nhập |
| Không có response (mất mạng, E12) | Alert ảnh | "Mất kết nối, vui lòng thử lại." | Giữ preview để gửi lại |
| Người dùng hủy tải | — | Không lỗi; về trạng thái D | — |

### Validation số đo (client, on blur + submit; khớp D-13)
| Trường | Quy tắc | Thông báo |
|---|---|---|
| Chiều cao | bắt buộc, số nguyên, 100–250 (kể cả rỗng, chữ, âm, thập phân) | "Chiều cao phải từ 100 đến 250 cm." |
| Cân nặng | bắt buộc, 30–250, tối đa 1 chữ số thập phân (kể cả rỗng, chữ, `52.55`) | "Cân nặng phải từ 30 đến 250 kg." |
Gửi **cả hai** cùng lúc; nếu một ô sai thì không gọi API.

### Hiệu ứng
Progress bar tăng mượt (`transform: scaleX`); chuyển preview → ảnh đã lưu cross-fade 200ms; toast trượt-lên 200ms; banner thu gọn/đổi trạng thái fade. Tất cả tắt/giảm khi `prefers-reduced-motion`.

### Navigation
- Đến từ: đăng ký thành công (onboarding), đăng nhập khi `profileCompleted=false`, menu "Hồ sơ" ở header, banner ở `/`.
- Đi tới: `/` (nút "Về trang chủ" khi hồ sơ đầy đủ), `/login` (hết phiên / đăng xuất). Rời trang khi đang có preview chưa lưu hoặc đang tải: `beforeunload` cảnh báo mặc định của trình duyệt khi đang tải; preview chưa lưu thì không chặn.

### Accessibility
- Một `h1`; mỗi card là `<section aria-labelledby>`; thứ tự Tab: banner link → consent → chọn/lưu/thay/xóa → hướng dẫn → số đo → Lưu.
- Dropzone là `<button>` (Enter/Space mở file picker); input file `sr-only` có `aria-label="Chọn ảnh toàn thân"`.
- Nút bị khóa do chưa consent dùng `aria-disabled="true"` + `aria-describedby` giải thích lý do (không dùng `disabled` thuần để vẫn đọc được lý do).
- Progress `role="progressbar"`; thông báo kết quả `role="status"`; lỗi ảnh `role="alert"`; khi có lỗi ảnh focus vẫn ở nút gửi (không cướp focus), nhưng lỗi được đọc bởi `role="alert"`.
- Modal xóa: trap focus, Esc, trả focus về nút "Xóa ảnh" (hoặc về "Chọn ảnh" khi ảnh đã bị xóa).
- Ảnh minh họa đúng/sai có `alt` và nhãn chữ.

### Ghi chú
- Ảnh và số đo lưu **độc lập**: lưu số đo không cần có ảnh và ngược lại; mọi response thành công đều trả `{profile}` đầy đủ → cập nhật toàn bộ trạng thái (banner, ảnh, số đo) từ đó.
- Admin không có hồ sơ; không hiện menu Hồ sơ cho admin.
- Không ghi chiều cao/cân nặng/URL ảnh vào log hay analytics.
- Epic 3 sẽ dùng `photo.version` làm khóa cache; FE chỉ cần hiển thị.
