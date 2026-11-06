# Screen Descriptions — Trạng thái sân khấu thử đồ và bảng lỗi

> Bổ sung cho [`try-on-room.md`](try-on-room.md). US-05 §4, §6; US-06 §5; `design/api.md` §2, §6 · D-74, D-76, D-83, D-84, D-86, D-87, D-93, D-97, D-98

Tài liệu này là **nguồn chuẩn cho câu chữ và ánh xạ mã lỗi**. Frontend lấy chuỗi theo `error.code` và `state`, **không hiển thị `error.message` của server** (đề xuất D-119).

## 1. Quy ước hiển thị

- **Mọi trạng thái đều giữ**: khung 3:4 cùng kích thước, tên, giá, vị trí, hai mũi tên (trừ khi nêu khác). Ảnh trải phẳng của sản phẩm vẫn hiện trong khung ở mọi lỗi sinh ảnh (US-05 §6), trừ trạng thái "Sản phẩm đã xóa" và "Ảnh thử đồ lỗi tải".
- **Lớp phủ trạng thái (StageOverlay):** thẻ nằm **trong khung ảnh**, sát đáy, cách mép 12px, nền `surface`, viền `line`, radius `lg`, `shadow-card`, padding 12px 16px; tối đa 45% chiều cao khung. Có hai kiểu:
  - *Chờ* (gọn): một hàng gồm Spinner 20px + một dòng `small`. Không có nút.
  - *Lỗi / thông báo*: icon 20px + tiêu đề `small` 600 (nếu có) + nội dung `small` + hàng nút (tối đa 2, cao 44px, `Button` secondary hoặc primary; xếp dọc full-width ở 360px nếu không đủ chỗ). Có `role="alert"` (lỗi) hoặc `role="status"` (thông tin, hết lượt, tạm dừng). Biến thể màu theo `Alert`: `danger`, `warning`, `info`; icon luôn đi kèm chữ.
  - Phía sau lớp phủ, ảnh trải phẳng giữ nguyên độ sáng (không làm tối) để vẫn nhận ra sản phẩm.
- Khi ở các cổng G1, G2, G3 không có sân khấu nên không có lớp phủ.

## 2. Bảng trạng thái sân khấu

Cột "Mũi tên" mô tả việc **chuyển sản phẩm**; mọi trạng thái đều cho phép chuyển trừ khi ghi khác (US-06 E1, AC-14).

| ID | Trạng thái | Điều kiện | Khung ảnh | Lớp phủ (câu chữ) | Hành động | Thông báo cho trình đọc màn hình |
|---|---|---|---|---|---|---|
| S0 | Chưa chọn danh mục | Vào phòng, không có `category` trên URL (D-72) | Silhouette SVG + "Chọn một danh mục" | Không | Chọn chip | Không (tiêu đề đã đọc khi focus) |
| S1 | Đang tải sản phẩm đầu | Vừa chọn danh mục | Skeleton 3:4 | Không | Chip vẫn dùng được | "Đang tải sản phẩm" (`role="status"` trong skeleton) |
| S2 | Đang xác định ảnh | Vừa chuyển tới sản phẩm, `GET /result` chưa về (thường < 300 ms) | Ảnh trải phẳng + nhãn "ẢNH SẢN PHẨM" | *Chờ:* "Đang tải ảnh…" (hiện trong ≤ 200 ms, D-74) | Không | Không (chờ kết quả) |
| S3 | Ảnh sẵn sàng | `result.state = ready`, hoặc job `succeeded` ở đúng sản phẩm | Ảnh thử đồ; cross-fade nếu trước đó là trải phẳng | Không. Dưới khung hiện nhãn AI (D-83) | Không | "Ảnh bạn mặc <tên> đã sẵn sàng" |
| S4 | Đang tạo (0–15 giây) | `result.state = none` rồi `POST /jobs` (sau 400 ms) trả 202, hoặc `result.state = pending` | Ảnh trải phẳng | *Chờ:* "Đang tạo ảnh bạn mặc sản phẩm này…" | Không | "Đang tạo ảnh bạn mặc <tên>" (một lần) |
| S4b | Đang tạo (15–60 giây) | Chờ quá 15 giây | Ảnh trải phẳng | *Chờ mở rộng* (hai dòng): "Đang tạo ảnh bạn mặc sản phẩm này…" / "Vẫn đang tạo, có thể lâu hơn một chút. Bạn có thể xem sản phẩm khác trong lúc chờ." | Không | "Vẫn đang tạo, có thể lâu hơn một chút" (một lần) |
| S5 | Quá 60 giây | `TRYON_TIMEOUT` (60 s của FE, hoặc job `failed` mã `TRYON_TIMEOUT` ở 120 s của BE) | Ảnh trải phẳng | *Lỗi `warning`:* tiêu đề "Việc tạo ảnh lâu hơn dự kiến" / "Bạn có thể thử lại hoặc xem sản phẩm khác rồi quay lại. Nếu ảnh hoàn thành, nó sẽ tự hiện." | **Thử lại** (primary) | `role="alert"` đọc nội dung |
| S6 | Lỗi tạm thời | job `failed`, `TRYON_FAILED` (đã tự thử lại 1 lần, D-76) hoặc `POST /jobs` 500 | Ảnh trải phẳng | *Lỗi `danger`:* "Chưa tạo được ảnh, vui lòng thử lại." | **Thử lại** (primary) | `role="alert"` |
| S7 | Bị bộ lọc an toàn | `result.state = blocked` với `errorCode = TRYON_BLOCKED`, hoặc job `failed` mã `TRYON_BLOCKED` | Ảnh trải phẳng | *Thông tin `info`, icon `Ban`:* "Không thể tạo ảnh thử đồ với sản phẩm này." / `small` "Bạn vẫn xem được thông tin sản phẩm và các sản phẩm khác." | **Không có Thử lại** (R9) | `role="status"` |
| S8 | Ảnh người chưa phù hợp | `result.state = blocked` với `errorCode = TRYON_PHOTO_UNUSABLE`, hoặc job `failed` mã đó | Ảnh trải phẳng | *Lỗi `warning`, icon `UserRoundX`:* "Ảnh của bạn chưa phù hợp để thử đồ. Hãy dùng ảnh đứng thẳng, thấy toàn thân." | **Đổi ảnh hồ sơ** (primary) → `/profile#photo` | `role="alert"` |
| S9 | Tạm dừng | `POST /jobs` 503, hoặc job `failed` mã `TRYON_UNAVAILABLE`, hoặc `generation.available = false` mà sản phẩm chưa có ảnh | Ảnh trải phẳng | *Thông tin `warning`:* "Tính năng tạo ảnh đang tạm dừng. Bạn vẫn xem được các ảnh đã tạo. Vui lòng thử lại sau." | **Kiểm tra lại** (secondary): làm mới `/state`; nếu `generation.available` thì tạo job, nếu không thì giữ nguyên | `role="status"` |
| S10 | Hết lượt (ngày) | `429 TRYON_QUOTA_EXCEEDED`, `scope = day` | Ảnh trải phẳng | *`warning`:* "Bạn đã dùng hết lượt tạo ảnh hôm nay. Lượt mới có sau 00:00 ngày 07/11. Các ảnh đã tạo vẫn xem được." | Không | `role="status"` |
| S10b | Hết lượt (tháng) | `scope = month` | Ảnh trải phẳng | *`warning`:* "Bạn đã dùng hết lượt tạo ảnh tháng này. Lượt mới có sau 00:00 ngày 01/12. Các ảnh đã tạo vẫn xem được." | Không | `role="status"` |
| S10c | Lượt cuối đang được giữ | `scope = pending` | Ảnh trải phẳng | *`info`:* "Lượt tạo ảnh cuối của bạn đang dùng cho một ảnh khác. Bạn có thể thử lại sau ít giây." | **Thử lại** bị khóa theo đếm ngược 15 giây ("Thử lại sau 15 giây"), rồi bật | `role="status"`, thông báo lúc bắt đầu và lúc nút bật (không đọc từng giây) |
| S11 | Thao tác quá nhanh | `429 TOO_MANY_REQUESTS` (rate limit hoặc quá nhiều job, D-97) | Ảnh trải phẳng | *`warning`:* "Bạn thao tác quá nhanh, vui lòng thử lại sau." | **Thử lại**, khóa theo `details.retryAfterSeconds` (thiếu thì 10 giây, D-34) | Như S10c |
| S12 | Ảnh thử đồ lỗi tải | `GET /result` trả 500 (không ký được URL), hoặc `<img>` lỗi sau khi đã làm mới URL một lần (E20, E22) | Ảnh trải phẳng | *`danger`:* "Không tải được ảnh thử đồ." | **Tải lại ảnh** (gọi lại `/result`, không tốn lượt) | `role="alert"` |
| S13 | Mất kết nối | Mất mạng hoặc 3 lần poll liên tiếp lỗi (E21) | Giữ nguyên nội dung hiện tại | *Dải `warning` mỏng đầu khung:* "Mất kết nối. Đang thử lại khi có mạng…" | Không (tự thử lại, giãn 2 → 4 → 8 → 10 giây; có mạng lại thì xóa dải) | `role="status"` |
| S14 | Sản phẩm đã xóa | `GET /result` hoặc `POST /jobs` trả `404 NOT_FOUND` (E8, US-06 E3) | Nền `surface-muted` + icon `PackageX` 40px (không dùng ảnh) | *`warning`:* "Sản phẩm này không còn bán." | **Xem sản phẩm tiếp theo** (primary; nếu không còn: "Danh mục khác"). Không tự chuyển (D-87) | `role="alert"` |
| S15 | Tải sản phẩm tiếp theo lỗi | `GET /products?after=` / `before=` lỗi 500 hoặc mạng (US-06 E8) | Giữ **sản phẩm hiện tại** nguyên vẹn | *Dải `danger` ở khối thông tin (không đè ảnh):* "Không tải được sản phẩm tiếp theo." | **Thử lại** | `role="alert"` |
| S16 | Chuyển sang cổng hồ sơ / consent | 409 `PROFILE_INCOMPLETE`, 403 `TRYON_CONSENT_REQUIRED` ở bất kỳ API ảnh (US-06 E9, AC-16) | Sân khấu **gỡ khỏi màn hình** (xóa mọi ảnh try-on khỏi DOM và bộ nhớ trang) | Cổng G1 hoặc G2 có banner "đã thay đổi" | Theo cổng | `role="alert"` + focus vào `h2` của cổng |

### Chi tiết bổ sung

- **S4 → S3, ở đúng sản phẩm:** ảnh tự hiện, không cần thao tác (D-74). Ở sản phẩm khác: bỏ qua (US-06 R7).
- **S5 chỉ là lỗi hiển thị.** Job vẫn chạy ở backend. Poll **không dừng** sau 60 giây; nếu job `succeeded` khi lớp phủ S5 đang hiện, tự chuyển sang S3 và đọc "Ảnh … đã sẵn sàng". Bấm **Thử lại** ở S5: gọi `POST /jobs`, backend gắn vào đúng job đang chạy (AC-15), đồng hồ chờ **bắt đầu lại từ 0** (đề xuất D-113).
- **S6 và S12 khác nhau:** S6 nghĩa là sinh ảnh thất bại (Thử lại gọi `POST /jobs`, có thể tốn một lượt khi thành công); S12 nghĩa là ảnh đã có nhưng không tải được (Tải lại ảnh chỉ gọi `GET /result`, không tốn lượt, E22).
- **S7, S8 ghi nhớ theo khóa** (R9, R14): chuyển đi rồi quay lại vẫn hiện đúng trạng thái đó ngay từ `GET /result` (`state: blocked`), không `POST` lại, không chờ 400 ms. Sau khi thay ảnh hồ sơ (khóa đổi), quay lại sản phẩm: `/result` trả `none`, 400 ms sau tự `POST /jobs` (người mua vẫn đang chủ động xem sản phẩm đó) và tính một lượt khi thành công; có lời nhắc trong Hồ sơ (xem `profile-updates.md`).
- **S9 khi chưa gọi:** nếu `/state` đã báo `generation.available = false` và `GET /result` trả `none`, FE hiện S9 **không** `POST /jobs` (tiết kiệm lệnh gọi; backend vẫn là nơi quyết định). Ảnh đã có (`ready`) vẫn xem bình thường.
- **S10, S10b, S11:** sản phẩm đã có ảnh vẫn hiện ảnh bình thường (US-06 AC-15); lớp phủ chỉ xuất hiện ở sản phẩm chưa có. Chuyển sang sản phẩm có ảnh: lớp phủ biến mất; sang sản phẩm chưa có ảnh khi đã hết lượt: FE dựa vào `quota.remaining = 0` đã biết để **không `POST`** và hiện luôn S10/S10b, tránh tạo lỗi 429 và tránh đếm vào rate limit.
- **Đếm ngược** (S10c, S11): hiển thị trong nhãn nút ("Thử lại sau 12 giây"), cập nhật mỗi giây bằng chữ nhưng **chỉ đọc cho trình đọc màn hình khi bắt đầu và khi kết thúc** (design system §8.8). Nút khóa dùng `aria-disabled` + `aria-describedby` trỏ tới dòng giải thích.
- **Định dạng thời điểm hết lượt:** từ `details.resetsAt` (ISO) hoặc `quota.*ResetsAt`, hiển thị "00:00 ngày 07/11" theo giờ Việt Nam (`timeZone: 'Asia/Ho_Chi_Minh'`), không phụ thuộc múi giờ máy.

## 3. Đồng hồ chờ (D-74)

| Mốc | Tính từ | Việc |
|---|---|---|
| 0 | Lúc người mua **bắt đầu chờ ở sản phẩm đó**: chuyển tới sản phẩm đang có job, hoặc bấm Thử lại. Không tính từ `job.createdAt` (api.md §6.3) | Hiện lớp phủ chờ |
| ≤ 200 ms | Thao tác | Ảnh trải phẳng, tên, giá, lớp phủ S2 phải có mặt, không đợi API |
| 400 ms | Lúc chuyển tới | `POST /jobs` nếu vẫn ở sản phẩm (D-86) |
| 15 s | Mốc 0 | S4 → S4b |
| 60 s | Mốc 0 | S4b → S5 (FE), job vẫn chạy |
| 120 s | Backend | Job `failed` `TRYON_TIMEOUT` (poll thấy thì cũng hiện S5; đổi nội dung không đổi) |

Rời sản phẩm: hủy mọi timer. Quay lại: mốc 0 đặt lại. Không có phần trăm tiến trình. Mỗi lần poll (2 giây) làm mới dấu "còn người theo dõi" phía backend (api.md §1), nên **không** poll khi sản phẩm không còn được xem; tab bị ẩn thì job đang hiển thị vẫn được poll (trình duyệt có thể làm chậm).

## 4. Bảng mã lỗi → trạng thái giao diện

Nguồn: `design/api.md` §1, §2, §6 và US-05 §6, US-06 §5.

### 4.1 Lỗi HTTP

| HTTP | `error.code` | Endpoint thường gặp | Trạng thái giao diện | Ghi chú xử lý |
|---|---|---|---|---|
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED` | Mọi endpoint | Về `/login` (API client xử lý chung) | Không có UI riêng. Hủy poll, xóa ảnh khỏi bộ nhớ trang |
| 403 | `FORBIDDEN` | Mọi endpoint (admin gọi) | Chuyển `/admin` | Chỉ xảy ra khi role đổi; guard route đã chặn từ đầu |
| 403 | `TRYON_CONSENT_REQUIRED` | `/result`, `POST /jobs` | **S16 → cổng consent G2** | Gồm cả "đồng ý lỗi thời" (D-108) và "đã rút". Ngừng generate trước. Phân biệt câu mở đầu theo `consent` của `/state` vừa làm mới |
| 409 | `PROFILE_INCOMPLETE` (`details.missing`) | `/result`, `POST /jobs` | **S16 → cổng hồ sơ G1** | Liệt kê theo `details.missing` |
| 404 | `NOT_FOUND` | `/categories/:id/products` | `Alert` "Danh mục không còn tồn tại." + tải lại danh mục (E7); rỗng thì G3 | |
| 404 | `NOT_FOUND` | `/products/:id/result`, `POST /jobs` | **S14 Sản phẩm đã xóa** | Không tạo job, không tính lượt (AC-12) |
| 404 | `NOT_FOUND` | `GET /jobs/:id` | Coi như job `discarded`: gọi `/result` để biết lý do | Job hết hạn dọn, hoặc của người khác. Không hiện lỗi |
| 429 | `TRYON_QUOTA_EXCEEDED`, `scope: day` | `POST /jobs` (display) | **S10** | Làm mới `/state` |
| 429 | `TRYON_QUOTA_EXCEEDED`, `scope: month` | `POST /jobs` (display) | **S10b** | |
| 429 | `TRYON_QUOTA_EXCEEDED`, `scope: pending` | `POST /jobs` (display) | **S10c** | `retryAfterSeconds: 15`, `resetsAt: null` |
| 429 | `TOO_MANY_REQUESTS` | Mọi endpoint try-on | **S11** (khi từ `POST /jobs` hoặc `/result` của sản phẩm đang xem) | Khi từ poll job: giãn nhịp poll theo `retryAfterSeconds`, không hiện lỗi. Khi từ `POST /consent` hoặc `DELETE /consent`: Alert `warning` trong cổng/hộp thoại |
| 503 | `TRYON_UNAVAILABLE` | `POST /jobs` (display) | **S9** | Ảnh đã có không bị ảnh hưởng (backend kiểm sau cache) |
| 400 | `VALIDATION_ERROR` | `/categories/:id/products` (con trỏ, `limit`, nhiều tham số vị trí) | Không hiển thị cho người mua ở lần đầu: FE tự khôi phục bằng cách tải lại danh sách từ sản phẩm hiện tại (`?at=`). Lỗi lần hai → **S15** | FE không tự dựng con trỏ nên đây là lỗi lập trình hoặc con trỏ hỏng |
| 400 | `VALIDATION_ERROR` | `POST /jobs` (`purpose`), `POST /consent` (`accepted`) | Không có UI riêng. Hiện thông báo chung cùng kiểu S6 "Chưa tạo được ảnh, vui lòng thử lại." hoặc "Chưa ghi nhận được sự đồng ý của bạn, vui lòng thử lại." | FE luôn gửi giá trị hợp lệ; chỉ xảy ra khi có lỗi lập trình |
| 500 | `INTERNAL_ERROR` | `/state` | Error state phòng + **Thử lại** | |
| 500 | `INTERNAL_ERROR` | `/categories`, `/products` | Danh mục: Alert `danger` "Không tải được danh mục." + Thử lại. Sản phẩm: **S15** (hoặc S1-lỗi nếu là lần tải đầu) | |
| 500 | `INTERNAL_ERROR` | `/result` | **S12** (không ký được URL, E22) | |
| 500 | `INTERNAL_ERROR` | `POST /jobs` | **S6** | |
| 500 | `INTERNAL_ERROR` | `/jobs/:id` | Như lỗi mạng: **S13** sau 3 lần liên tiếp | |

### 4.2 Trạng thái trong body 200

| Nguồn | Giá trị | Trạng thái |
|---|---|---|
| `/result`, `POST /jobs` | `state: "ready"` | S3 |
| | `state: "pending"` | S4 → S4b → S5; poll `GET /jobs/:id` |
| | `state: "blocked"`, `errorCode: TRYON_BLOCKED` | S7 |
| | `state: "blocked"`, `errorCode: TRYON_PHOTO_UNUSABLE` | S8 (xem mâu thuẫn số 4) |
| | `state: "none"` | Chờ 400 ms rồi `POST /jobs`, hoặc S9/S10 nếu đã biết không tạo được |
| `POST /jobs` | `state: "skipped"` (`low_quota`, `busy`, `budget`, `disabled`) | **Không có UI** theo thiết kế (chỉ xảy ra với `purpose: prefetch`, im lặng, api.md §6.2) |
| `POST /jobs` (display) trả `skipped` | Không phải hợp đồng; nếu xảy ra, xử lý như S6 | |
| `GET /jobs/:id` | `status: queued`, `running` | S4 / S4b |
| | `status: succeeded` (`image`) | S3 nếu đúng sản phẩm, ngược lại bỏ (R7) |
| | `status: failed`, `error.code` | Theo 4.3 |
| | `status: canceled` | Gọi `/result` để biết lý do; đang xem và kết quả `none` thì `POST /jobs` lại **một lần**; vẫn `canceled` thì S6 (tránh vòng lặp) |
| | `status: discarded` | Gọi `/result`: 403 → G2, 409 → G1, 404 → S14, `none` → tạo lại một lần như trên |

### 4.3 `job.error.code`

| `code` | Trạng thái | Nút | Ghi chú |
|---|---|---|---|
| `TRYON_FAILED` | **S6** | Thử lại | Gồm lỗi dịch vụ, từ chối đầu vào, lưu lỗi, server khởi động lại. Không phân biệt trên giao diện (không lộ chi tiết) |
| `TRYON_TIMEOUT` | **S5** | Thử lại | Cùng giao diện dù đến từ mốc 60 giây của FE hay 120 giây của BE |
| `TRYON_BLOCKED` | **S7** | Không | Ghi nhớ theo khóa |
| `TRYON_PHOTO_UNUSABLE` | **S8** | Đổi ảnh hồ sơ | Ghi nhớ theo khóa |
| `TRYON_UNAVAILABLE` | **S9** | Kiểm tra lại | api.md ghi "Thử lại: Có, sau" |

### 4.4 Mã/tình huống trong api.md KHÔNG có giao diện riêng

| Mục | Lý do |
|---|---|
| `VALIDATION_ERROR` do `purpose`, `accepted` sai | Client luôn gửi đúng; chỉ dùng thông báo chung (bảng 4.1) |
| `VALIDATION_ERROR` do con trỏ/`limit`/nhiều tham số vị trí | FE khôi phục im lặng một lần, rồi dùng S15 |
| `state: "skipped"` | Chỉ của generate trước, im lặng theo thiết kế |
| `job.status = canceled` / `discarded` | Là trạng thái trung gian, FE tự hỏi lại `/result`; chỉ hiển thị kết quả cuối |
| `TOO_MANY_REQUESTS` từ poll job | Giãn nhịp poll, không hiện |
| `FORBIDDEN` | Không bao giờ thấy trong luồng bình thường (guard route) |
| `TRYON_UNAVAILABLE` sinh từ job (hết credit, sai key, E18) | Dùng chung giao diện S9 vì người mua không cần và không được biết lý do |

Các mã còn lại (`TRYON_CONSENT_REQUIRED`, `PROFILE_INCOMPLETE`, `NOT_FOUND`, `TRYON_QUOTA_EXCEEDED` ba scope, `TOO_MANY_REQUESTS`, `TRYON_UNAVAILABLE`, `TRYON_FAILED`, `TRYON_TIMEOUT`, `TRYON_BLOCKED`, `TRYON_PHOTO_UNUSABLE`, `INTERNAL_ERROR`, `UNAUTHORIZED`, `TOKEN_EXPIRED`) đều có giao diện ở bảng trên.

## 5. Quy tắc phụ

- **Làm mới URL ảnh (E20):** khi `<img>` của ảnh try-on lỗi hoặc còn ≤ 60 giây tới `expiresAt`, gọi `GET /result` đổi `src` khi ảnh mới đã `decode()` xong, không nhấp nháy. Một lần mỗi URL. Lỗi lần hai → S12.
- **Bộ nhớ ảnh ở FE:** khóa `(productId, image.version)`; giá trị `{ url, expiresAt, width, height }`; chỉ trong bộ nhớ trang. **Xóa sạch** khi: thay hoặc xóa ảnh hồ sơ trong cùng phiên, rút consent, đăng xuất, nhận 403/409 (US-06 R9, AC-16). Mỗi lần chuyển sản phẩm vẫn gọi `GET /result` để xác nhận (ảnh trong bộ nhớ hiện ngay, đổi nếu `/result` khác).
- **Sản phẩm đã xóa → "Xem sản phẩm tiếp theo":** gọi `GET /products?at=<id đã xóa>`; `anchor.deleted = true` và `items[0]` là sản phẩm kế tiếp theo con trỏ; không có `items` thì hiện "Bạn đã xem hết danh mục này". Đồng thời làm mới danh sách ngầm để mũi tên Sau không dẫn lại vào sản phẩm đã xóa.
- **Sản phẩm đang xem bị xóa mà người mua không thao tác (E4):** giữ nguyên ảnh đang hiện đến lần gọi API kế tiếp. Không có cập nhật thời gian thực, không có thông báo.
- **Generate trước bị lỗi:** im lặng (US-06 §4.3). Khi người mua chuyển tới, hiển thị theo trạng thái thật (`/result` + job), kể cả lỗi, có Thử lại.
- **Không hiển thị:** đường dẫn Storage, id nhà cung cấp, số tiền, ngân sách, tên model (api.md §1).
