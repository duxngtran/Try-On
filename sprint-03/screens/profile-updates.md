# Screen Descriptions — Hồ sơ: bản cập nhật Sprint 03

> Cập nhật của [`sprint-01/screens/profile.md`](../../sprint-01/screens/profile.md) (route `/profile`, US-02). US-05 §5.5, §13, AC-08, AC-09, AC-10 · `GET /api/try-on/state`, `DELETE /api/try-on/consent`, `PUT`/`DELETE /api/profile/photo` · D-79, D-93, D-102, D-108 · **Chỉ nêu phần thay đổi;** mọi thứ không nhắc tới giữ nguyên như Sprint 01.

## Hồ sơ — `/profile` (bản cập nhật)

### Tóm tắt thay đổi
| # | Vị trí | Thay đổi |
|---|---|---|
| 1 | Modal xác nhận xóa ảnh | Thêm câu về ảnh thử đồ và câu "không thu hồi được"; bỏ chữ "vĩnh viễn" |
| 2 | Bước xem trước khi **thay** ảnh | Thêm ghi chú ảnh thử đồ cũ bị xóa và tốn lượt |
| 3 | Modal "Cách chúng tôi dùng ảnh của bạn" | Viết lại cho khớp D-93 |
| 4 | Nhãn ô consent lưu ảnh | Bỏ cụm "gửi ảnh tới dịch vụ AI" (đề xuất D-115; giữ `PHOTO_CONSENT_VERSION = 1`, D-102) |
| 5 | Mục mới "Thử đồ bằng AI" | Hiện trạng thái consent gửi ảnh; nút **Rút đồng ý** + hộp thoại hậu quả |
| 6 | Banner khi hồ sơ đầy đủ, toast sau thay ảnh | CTA "Vào phòng thử đồ"; toast nêu ảnh cũ đã xóa |

### 1. Modal xác nhận xóa ảnh (thay thế mục 8 của Sprint 01)
- Dùng `Modal` hiện có. Tiêu đề: "Xóa ảnh?".
- Nội dung (hai đoạn, `body`):
  - "Ảnh toàn thân sẽ bị xóa khỏi Try-on. Các ảnh thử đồ đã tạo từ ảnh này cũng sẽ bị xóa, và bạn sẽ không thể dùng phòng thử đồ cho đến khi tải ảnh mới."
  - `small` `ink-muted`: "Việc xóa không thu hồi được những ảnh đã được gửi tới dịch vụ AI trước đây."
- Nút: **Hủy** (secondary, nhận focus khi mở) + **Xóa ảnh** (danger; loading "Đang xóa…", cả hai disabled, Esc/scrim bị khóa). Giữ nguyên hành vi Sprint 01.
- Lý do bỏ "vĩnh viễn": từ này ngụ ý xóa hoàn toàn mọi nơi, trong khi phần đã gửi cho bên thứ ba không xóa được.
- Câu "không thu hồi" chỉ hiện khi người mua **đã từng đồng ý gửi ảnh** (`consent.acceptedAt` hoặc `withdrawnAt` khác null theo `/try-on/state`); chưa từng đồng ý thì bỏ đoạn đó (vì chưa có gì gửi đi). Nếu không đọc được `/state`, hiện đoạn đó (an toàn hơn).
- Toast sau khi xóa: "Đã xóa ảnh. Các ảnh thử đồ của bạn cũng đã được xóa." (`role="status"`).

### 2. Thay ảnh: ghi chú ở bước xem trước
- Khi đã có ảnh lưu và người mua chọn **Thay ảnh** (có preview ảnh mới, trước nút **Lưu ảnh**): thêm `Alert` `info` (`role="status"`, không phải hộp thoại để khỏi thêm một bước) ngay trên nút Lưu ảnh:
  "Khi bạn lưu ảnh mới, các ảnh thử đồ cũ sẽ bị xóa và phải tạo lại. Việc này dùng lượt tạo ảnh của bạn."
- Nút **Lưu ảnh** có `aria-describedby` trỏ tới Alert này. Không hiện ở lần tải ảnh đầu tiên (chưa có ảnh nào để xóa).
- Toast sau khi lưu: "Đã cập nhật ảnh. Các ảnh thử đồ cũ đã được xóa." Phần còn lại của luồng (progress, cross-fade, trả focus về nút Thay ảnh) giữ nguyên Sprint 01.
- Không sinh lại hàng loạt (D-79): ảnh mới chỉ được tạo khi người mua xem đúng sản phẩm đó trong phòng thử đồ.

### 3. Modal "Cách chúng tôi dùng ảnh của bạn" (viết lại)
Mở từ liên kết "Xem chi tiết" cạnh ô consent lưu ảnh. `Modal` hiện có, tiêu đề giữ nguyên, nút duy nhất **Đã hiểu**. Nội dung `<ul>` (`small`):
1. "Ảnh toàn thân của bạn được lưu riêng tư trên Try-on. Bạn xem lại qua liên kết tạm thời, hết hạn sau 15 phút."
2. "Quản trị viên cửa hàng không có chức năng xem ảnh của bạn."
3. "Ảnh chỉ được gửi tới FASHN (dịch vụ AI tạo ảnh thử đồ) và các đơn vị hạ tầng của họ, có thể ở ngoài Việt Nam, **sau khi bạn đồng ý riêng** ở Phòng thử đồ. Nếu bạn chưa đồng ý, ảnh không được gửi đi."
4. "Chiều cao, cân nặng, email và tên của bạn không được gửi tới dịch vụ AI."
5. "Ảnh thử đồ tạo ra được lưu riêng tư tối đa 90 ngày kể từ lần bạn xem gần nhất, rồi tự xóa."
6. "Bạn có thể xóa ảnh hoặc rút đồng ý gửi ảnh bất cứ lúc nào. Việc này dừng các lần gửi tiếp theo và xóa ảnh thử đồ trên Try-on, nhưng không xóa được phần đã được gửi và xử lý trước đó."
- Bỏ câu cũ "Ảnh được gửi tới dịch vụ AI để tạo ảnh bạn mặc thử sản phẩm" và câu "chỉ bạn xem được qua liên kết tạm thời" đứng một mình (gây hiểu nhầm là ảnh không đi đâu khác, D-93).
- Giữ nguyên hành vi modal (trap focus, Esc, trả focus về liên kết "Xem chi tiết").

### 4. Nhãn ô consent lưu ảnh (đề xuất, xem D-115)
- Nhãn cũ: "Tôi đồng ý cho Try-on lưu trữ và sử dụng ảnh này để tạo ảnh thử đồ, bao gồm việc gửi ảnh tới dịch vụ AI xử lý ảnh."
- Nhãn mới: "Tôi đồng ý cho Try-on lưu trữ ảnh này để dùng trong hồ sơ của tôi và tạo ảnh thử đồ. Ảnh chỉ được gửi tới dịch vụ AI khi tôi đồng ý riêng ở Phòng thử đồ."
- Lý do: nhãn cũ nói đã đồng ý gửi ảnh, trong khi D-93 tách việc gửi ra consent riêng; hai chỗ nói khác nhau sẽ làm người mua tưởng chỉ cần đồng ý một lần. `PHOTO_CONSENT_VERSION` giữ 1 (D-102): nhãn mới hẹp hơn nhãn cũ nên không cần buộc người đã đồng ý đồng ý lại. Cần agent-coder/agent-ba xác nhận không có test hoặc tài liệu nào so khớp đúng chuỗi cũ.

### 5. Mục mới: "Thử đồ bằng AI" (`id="try-on-ai"`)

#### Mục đích
Cho người mua thấy mình đã đồng ý gửi ảnh cho dịch vụ AI hay chưa, và rút đồng ý ngay tại Hồ sơ (nơi D-93 quy định), không phải vào phòng thử đồ.

#### Vị trí và dữ liệu
- Card thứ ba, **sau** Card ② Số đo (desktop: cột phải dưới Số đo; mobile: dưới Số đo). Theo mẫu card của Hồ sơ: eyebrow `caption` "QUYỀN RIÊNG TƯ", `h2` "Thử đồ bằng AI".
- Dữ liệu: `GET /api/try-on/state` (chỉ dùng `consent`), gọi độc lập với `GET /profile` (api.md §8: hai consent không gộp vào API hồ sơ). Hiện cho role `user`.
- Mô tả cố định `small` `ink-muted`: "Để tạo ảnh bạn mặc thử sản phẩm, ảnh toàn thân của bạn được gửi tới FASHN, một dịch vụ AI bên thứ ba có thể xử lý ở ngoài Việt Nam. Việc này chỉ diễn ra khi bạn đồng ý."

#### Trạng thái
| Trạng thái | Điều kiện | Hiển thị |
|---|---|---|
| Đang tải | Chờ `/state` | Skeleton 2 dòng + nút giả; `aria-busy="true"` |
| **Đã đồng ý** | `consent.accepted = true` | Badge success (icon `CheckCircle2`) "Đã đồng ý" + `small` "Từ ngày 06/11/2026." (định dạng `vi-VN`, giờ Việt Nam) + nút **Rút đồng ý** (secondary, chữ `danger`, icon `Undo2`, cao 44px) |
| Chưa đồng ý | `consent.accepted = false`, `acceptedAt = null`, `withdrawnAt = null` | Badge neutral "Chưa đồng ý" + `small` "Bạn sẽ được hỏi khi vào Phòng thử đồ." + link `accent-strong` "Vào phòng thử đồ" → `/try-on` |
| Đã rút | `withdrawnAt` có giá trị | Badge neutral "Đã rút đồng ý" + `small` "Từ ngày 06/11/2026. Ảnh thử đồ cũ đã được xóa. Bạn sẽ được hỏi lại khi vào Phòng thử đồ." + link "Vào phòng thử đồ" |
| Điều khoản đã cập nhật | `acceptedAt` có giá trị, `version < requiredVersion` | Badge `warning` "Cần đồng ý lại" + `small` "Điều khoản gửi ảnh đã cập nhật. Ảnh thử đồ đã tạo vẫn được giữ và sẽ hiện lại sau khi bạn đồng ý lại." + link "Vào phòng thử đồ". Vẫn có nút **Rút đồng ý** để người mua xóa các ảnh thử đồ đang được giữ (hộp thoại như dưới) |
| Lỗi tải `/state` | Mạng, 500 | `small` "Không tải được trạng thái đồng ý." + nút **Thử lại**. Các phần khác của Hồ sơ vẫn dùng được |
Chưa có ảnh/hồ sơ chưa đủ: mục vẫn hiện bình thường (consent độc lập với ảnh).

#### Hộp thoại "Rút đồng ý gửi ảnh?" (Modal hiện có)
- Tiêu đề: "Rút đồng ý gửi ảnh?"
- Nội dung: `body` "Nếu bạn rút đồng ý:" + danh sách:
  - "Chúng tôi dừng gửi ảnh của bạn tới dịch vụ AI."
  - "Mọi ảnh thử đồ đã tạo của bạn sẽ bị xóa khỏi Try-on."
  - "Ảnh hồ sơ và số đo của bạn được giữ nguyên."
  - "Bạn sẽ không thể thử đồ cho tới khi đồng ý lại."
- Đoạn lưu ý `Alert` `warning` (`role` không đặt, là nội dung tĩnh trong dialog): "Không thu hồi được phần đã gửi: những ảnh đã được gửi tới FASHN trước đó không thể xóa từ phía Try-on. Nếu một ảnh đang được tạo, ảnh đó có thể vẫn hoàn tất ở phía họ; kết quả sẽ bị bỏ, không hiển thị cho bạn, và lượt tạo ảnh đó vẫn bị tính."
- Nút: **Hủy** (secondary, focus mặc định) + **Rút đồng ý** (danger; loading "Đang rút…"; cả hai disabled; Esc/scrim bị khóa khi đang chạy).
- Thành công (`DELETE /try-on/consent` 200, idempotent): đóng hộp thoại, mục chuyển sang "Đã rút", toast `success` "Đã rút đồng ý. Các ảnh thử đồ của bạn đang được xóa." Focus chuyển về `h2` của mục (nút Rút đã biến mất; `tabIndex=-1`). Tab phòng thử đồ khác (nếu có) sẽ gặp E9 ở lần gọi kế tiếp.
- Lỗi: `Alert` `danger` `role="alert"` trong hộp thoại "Chưa rút được đồng ý, vui lòng thử lại." (500, mạng, 400); 429: `warning` "Bạn thao tác quá nhanh, vui lòng thử lại sau." với nút khóa theo `retryAfterSeconds`. Hộp thoại vẫn mở, nút Rút bật lại. Không dùng "Đã rút" khi chưa chắc.
- Hiệu ứng: modal dùng animation sẵn có (toast-in 200ms), reduced motion tắt.

#### Trình đọc màn hình
Card là `<section aria-labelledby>`; badge có chữ (không chỉ màu); nút **Rút đồng ý** có `aria-label` "Rút đồng ý gửi ảnh cho dịch vụ AI"; thành công thông báo qua toast `role="status"`.

### 6. Banner và toast
- Banner "Hồ sơ đã đầy đủ" (Alert success) đổi nút: thay "Về trang chủ" bằng **Vào phòng thử đồ** (primary, → `/try-on`). Sprint 01 ghi sẵn "Epic 3 sẽ đổi CTA".
- Nút phụ trong banner "Chưa đầy đủ" giữ nguyên.
- Banner không nhắc consent AI: consent đó hỏi ở phòng thử đồ.

### Responsive
- Mobile (< 640px): Mục mới là card một cột, nút **Rút đồng ý** full-width dưới mô tả. Hộp thoại là bottom sheet (Modal hiện có).
- Tablet (640–1023px): như mobile, nút `auto` width căn trái.
- Desktop (≥ 1024px): cột phải dưới Card ②, nút căn trái cùng hàng với badge nếu đủ chỗ.

### Navigation
- Đến từ: Header, Banner Trang chủ (như Sprint 01), "Đến Hồ sơ" ở cổng hồ sơ (neo `#photo` hoặc `#measurements`), "Đổi ảnh hồ sơ" ở S8 `TRYON_PHOTO_UNUSABLE` (neo `#photo`).
- Đi tới: `/try-on` (link trong mục mới, nút trong banner).
- Neo `#photo`, `#measurements`: cuộn tới card và focus vào `h2` của card (hoặc nút "Chọn ảnh"/ô Chiều cao). Cần thêm `id` cho hai card (hiện chưa có).

### Ghi chú
- Hai consent hiển thị ở hai nơi khác nhau với tên khác nhau: "Đồng ý sử dụng ảnh" (lưu, D-22) và "Thử đồ bằng AI" (gửi đi, D-93). Mô tả của mục mới nói rõ bên nhận để không bị nhầm.
- Sau khi người mua rút consent rồi mở lại Hồ sơ trong phiên: `/state` được gọi lại mỗi lần vào trang để số liệu không cũ.
- Thay ảnh khi `PhotoCard` ở lỗi 409/429 (US-02): giữ nguyên thông báo Sprint 01.
