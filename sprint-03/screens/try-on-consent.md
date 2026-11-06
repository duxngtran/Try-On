# Screen Descriptions — Consent gửi ảnh cho dịch vụ AI (Phòng thử đồ)

> US-05 §5.2, §12 Q3, E3, AC-02, AC-10 · `GET /api/try-on/state`, `POST /api/try-on/consent` · D-10, D-22, D-93, D-96, D-102, D-108 · Flow: `design/flows/tryon-consent.md` · Rút consent ở Hồ sơ: [`profile-updates.md`](profile-updates.md)

Đây là consent **riêng, độc lập** với consent lưu ảnh ở Hồ sơ (D-22). Lưu ảnh và gửi ảnh ra bên thứ ba là hai mục đích khác nhau, nên có hai lần đồng ý riêng. Thiết kế giả định chưa ra mắt thật (D-96); câu chữ vẫn viết như thể ra mắt thật để không phải làm lại.

## Cổng consent (G2) — trong `/try-on`

### Mục đích
Trước lần sinh ảnh đầu tiên, người mua được nói rõ ảnh đi đâu, ai nhận, lưu bao lâu, không thu hồi được gì, rồi tự quyết định. Chưa đồng ý thì không gửi gì ra ngoài và không vào được phòng (US-05 §5.2).

### Quyền truy cập
Đã đăng nhập, role `user`, hồ sơ đã đủ (`profile.completed = true`) và `consent.accepted = false`.

### Khi nào hiện
| Tình huống (`state.consent`) | Câu mở đầu (Alert phía trên card) |
|---|---|
| Chưa từng đồng ý (`acceptedAt = null`, `withdrawnAt = null`) | Không có Alert |
| Đã rút (`withdrawnAt` có giá trị) | `info`: "Bạn đã rút đồng ý trước đó và các ảnh thử đồ cũ đã được xóa. Hãy đồng ý lại nếu muốn tiếp tục thử đồ." |
| Đồng ý bản cũ (`acceptedAt` có giá trị, `version < requiredVersion`) | `info`: "Điều khoản gửi ảnh đã được cập nhật. Vui lòng đọc và đồng ý lại. Các ảnh thử đồ đã tạo vẫn được giữ và sẽ hiện lại sau khi bạn đồng ý." (D-108) |
| Bị gọi giữa chừng (403 `TRYON_CONSENT_REQUIRED` khi đang lướt, E9) | `warning` `role="alert"`: "Đồng ý gửi ảnh của bạn không còn hiệu lực, nên ảnh thử đồ đã được gỡ khỏi màn hình." |
Ảnh hồ sơ có consent lưu ảnh cũ (D-22) **không** coi là đã đồng ý gửi ảnh (D-93): họ vẫn thấy cổng này lần đầu, ảnh hồ sơ không bị xóa, không bị gửi đi.

### Các thành phần chính (card `max-w-xl`, căn giữa, dưới `h1`)

1. **Tiêu đề**
   - Eyebrow `caption` "TRƯỚC KHI THỬ ĐỒ"; `h2` (`title`) "Cho phép gửi ảnh của bạn tới dịch vụ AI".
   - Đoạn dẫn `body`: "Để tạo ảnh bạn mặc thử sản phẩm, chúng tôi cần gửi ảnh toàn thân của bạn tới một dịch vụ AI bên thứ ba. Hãy đọc kỹ các điều dưới đây trước khi quyết định."

2. **Danh sách điều cần biết** (`<ul>`, **luôn hiển thị đầy đủ, không giấu sau liên kết "Xem chi tiết"**; đồng ý có hiểu biết phải thấy nội dung trước khi tích). Mỗi dòng: icon 20px `accent` (trang trí) + tiêu đề `small` 700 + nội dung `small`.
   | Icon | Tiêu đề | Nội dung |
   |---|---|---|
   | `Send` | Gửi gì | "Ảnh toàn thân của bạn và ảnh sản phẩm. Chiều cao, cân nặng, email và tên của bạn **không** được gửi." |
   | `Building2` | Gửi cho ai | "FASHN (fashn.ai), nhà cung cấp dịch vụ thử đồ bằng AI, cùng các đơn vị hạ tầng mà họ sử dụng." |
   | `Globe` | Xử lý ở đâu | "Ảnh có thể được xử lý ở ngoài Việt Nam, ví dụ tại Hoa Kỳ hoặc Singapore." |
   | `Clock` | Lưu bao lâu | "Ảnh thử đồ tạo ra được lưu riêng tư trên Try-on tối đa 90 ngày kể từ lần bạn xem gần nhất, rồi tự xóa. Theo công bố của FASHN, ảnh bạn gửi được xóa khỏi hệ thống của họ sau khi xử lý xong (bản dự phòng được dọn trong tối đa 1 ngày), nhưng bản ghi về yêu cầu có thể được giữ lâu hơn. Thông tin này do FASHN công bố, chúng tôi chưa tự kiểm chứng." |
   | `Ban` | Không thu hồi được | "Khi ảnh đã được gửi đi, chúng tôi không thể thu hồi hoặc xóa phần đã được xử lý ở phía FASHN. Rút đồng ý chỉ dừng các lần gửi tiếp theo và xóa ảnh thử đồ lưu trên Try-on." |
   | `Undo2` | Rút đồng ý | "Bạn có thể rút đồng ý bất cứ lúc nào ở trang Hồ sơ. Ảnh hồ sơ và số đo của bạn vẫn được giữ." |
   - Không dùng chữ nhỏ hơn `small` (14px) hay màu nhạt hơn `ink-muted`. Tiêu đề từng dòng là chữ `ink`.
   - Nội dung dòng "Lưu bao lâu" chiếm nhiều dòng ở 360px (chấp nhận được; không cắt, không thu gọn).

3. **Ô đồng ý** (Checkbox 7.3, **không tích sẵn**, `<input type="checkbox">` thật)
   - Nhãn đầy đủ (một đoạn, `body`, đúng nội dung D-93): "Tôi từ đủ 18 tuổi và là người trong ảnh. Tôi đồng ý cho Try-on gửi ảnh toàn thân của tôi tới FASHN và các đơn vị hạ tầng của họ, có thể ở ngoài Việt Nam, chỉ để tạo ảnh thử đồ. Ảnh kết quả được lưu riêng tư. Tôi có thể rút lại bất kỳ lúc nào; việc này không xóa được phần đã xử lý trước đó."
   - Vùng chạm cả hàng ≥ 44px (bọc `<label>`). Tuổi là **tự khai**, không thu ngày sinh (D-08, D-93).
   - Trạng thái: default / checked / focus-visible / disabled (khi đang gửi). Không có trạng thái lỗi: nút chính bị khóa mềm tới khi ô được tích, và lý do được đọc qua `aria-describedby`.
   - Thay đổi so với `ConsentBlock` cũ (đề xuất D-111): **tích ô không tự ghi nhận**. Ghi nhận chỉ xảy ra khi bấm nút "Đồng ý và tiếp tục", vì đây là đồng ý với bên thứ ba ở nước ngoài, cần một hành động có chủ đích riêng; đồng thời tránh ghi nhận do chạm nhầm.

4. **Nút**
   - **Đồng ý và tiếp tục** (primary, `lg`, full-width ở mobile). Khi ô chưa tích: kiểu vô hiệu qua `softDisabled` (`aria-disabled="true"`, vẫn focus được) + `aria-describedby` trỏ tới dòng `small` "Hãy đánh dấu ô đồng ý ở trên để tiếp tục." Khi đang gửi: loading "Đang ghi nhận…".
   - **Để sau** (ghost, → `/`). Dòng `small` `ink-muted` cạnh nút: "Nếu không đồng ý, bạn vẫn dùng được các phần khác của Try-on nhưng chưa thể thử đồ. Ảnh hồ sơ của bạn không bị gửi đi."
   - Enter trên ô đồng ý không gửi (Space đổi trạng thái); Enter trên nút chính gửi.

5. **Thông báo lỗi** (Alert `danger` `role="alert"` ngay trên nút chính, không dùng toast)
   | Tình huống | Hiển thị |
   |---|---|
   | Mạng lỗi, 500 `INTERNAL_ERROR`, 400 `VALIDATION_ERROR` | "Chưa ghi nhận được sự đồng ý của bạn, vui lòng thử lại." Ô vẫn tích, nút bật lại |
   | 429 `TOO_MANY_REQUESTS` | `warning`: "Bạn thao tác quá nhanh, vui lòng thử lại sau." + nút khóa theo `retryAfterSeconds` (thiếu thì 10 giây, D-34) |
   | 409 `PROFILE_INCOMPLETE` | Chuyển sang cổng hồ sơ G1 (hồ sơ vừa đổi ở tab khác) |
   | 401 | API client xử lý chung (về `/login`) |

### Hành vi khi thành công
- `POST /try-on/consent { accepted: true }` thành công: cổng biến mất, tải `GET /categories`, hiện phòng. Idempotent: bấm hai lần hoặc hai tab không lỗi.
- Focus chuyển vào `h1` "Phòng thử đồ" (hành động của người dùng), vùng live đọc "Đã ghi nhận sự đồng ý của bạn. Hãy chọn một danh mục." Toast `success` "Đã ghi nhận sự đồng ý" (4 giây, `role="status"`).
- **Không tự chọn danh mục** (D-72), **không sinh ảnh** cho tới khi người mua chọn.
- Khi người mua đồng ý lại sau khi `TRYON_CONSENT_VERSION` tăng (D-108): các ảnh cũ hiện lại qua `/result`.

### Trạng thái
| Trạng thái | Hiển thị |
|---|---|
| Mặc định | Ô chưa tích, nút chính khóa mềm |
| Đã tích | Nút chính bật |
| Đang gửi | Ô disabled, nút loading, "Để sau" disabled |
| Lỗi | Alert như bảng trên, giữ nguyên ô đã tích |
| Hồ sơ đổi (409) | G1 |
Cổng không có trạng thái "rỗng".

### Responsive
- **Mobile (< 640px):** card full-width (gutter 16px, padding 16px). Các dòng "điều cần biết" xếp dọc, icon cạnh tiêu đề. Nút chính full-width, "Để sau" là ghost full-width ngay dưới (đủ cao 44px). Không dùng thanh nút cố định đáy (nội dung dài, tránh che).
- **Tablet (640–1023px):** card `max-w-xl` căn giữa, padding 24px; nút xếp ngang, "Để sau" bên trái.
- **Desktop (≥ 1024px):** như tablet; có thể thêm cột trái minh họa SVG (silhouette gửi → AI → ảnh thử đồ, trang trí `aria-hidden`), không bắt buộc.

### Navigation
- Đến từ: `/try-on` khi `consent.accepted = false`; lỗi 403 `TRYON_CONSENT_REQUIRED` giữa chừng.
- Đi tới: Phòng thử đồ (đồng ý), Trang chủ `/` ("Để sau"), (không có liên kết riêng tới Hồ sơ trong cổng; lời nhắc rút đồng ý nằm ở danh sách điều cần biết).

### Trình đọc màn hình, focus, motion
- Card là `<section aria-labelledby>` của `h2`. Focus vào `h2` (`tabIndex=-1`) khi cổng hiện do thao tác điều hướng (RouteFocus đã chuyển vào `h1`; với cổng xuất hiện giữa chừng thì chuyển vào `h2`). Danh sách điều cần biết là `<ul>` thật. Không có modal, không cần trap focus.
- Alert mở đầu (rút/lỗi thời/giữa chừng): `role="status"` (hai kiểu đầu) hoặc `role="alert"` (giữa chừng).
- Card xuất hiện fade 200ms; reduced motion: không hiệu ứng.

### Ghi chú
- Không tích sẵn, không tự động hóa, không đưa ô vào luồng khác (đăng ký, Hồ sơ).
- Không dùng câu nào ngụ ý ảnh đã gửi có thể thu hồi. Chỉ dùng "dừng các lần gửi tiếp theo" và "xóa ảnh thử đồ lưu trên Try-on" khi nói về rút đồng ý.
- Chữ "FASHN" là tên bên nhận theo D-91. Khi đổi nhà cung cấp (adapter, D-89), nội dung này và `TRYON_CONSENT_VERSION` phải đổi cùng lúc: việc đổi bên nhận cần đồng ý lại (D-108 xử lý phía ảnh). Nên lấy tên bên nhận từ một hằng cấu hình để không quên.
- Trước khi ra mắt thật: người có chuyên môn pháp lý duyệt câu chữ và hồ sơ đánh giá tác động (D-96).
