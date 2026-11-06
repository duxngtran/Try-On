# Bảng mã lỗi → giao diện — Sprint 04

> Nguồn mã: `sprint-04/design/api.md` mục 2. Mọi chuỗi hiển thị lấy theo `error.code` (D-119), **không** dùng `error.message` của server. Số trong chữ lấy từ `details` (`maxQuantity`, `maxLines`, `retryAfterSeconds`), không viết cứng. Định dạng giá `199.000 ₫` (`Intl.NumberFormat('vi-VN')`), thời gian theo `Asia/Ho_Chi_Minh`.

## 1. Mã riêng của sprint

| HTTP | Mã | Endpoint | Màn hình | Giao diện | Chữ | Màn hình file |
|---|---|---|---|---|---|---|
| 400 | `VALIDATION_ERROR` (`recipient.*`) | `POST /orders` | `/checkout` | Lỗi dưới ô, focus ô đầu tiên sai | Họ tên: "Vui lòng nhập họ tên người nhận (2–100 ký tự)." · Điện thoại: "Số điện thoại không hợp lệ." · Địa chỉ: "Vui lòng nhập địa chỉ đầy đủ (10–300 ký tự)." | `checkout.md` |
| 400 | `VALIDATION_ERROR` (`idempotencyKey`, `cartFingerprint`) | `POST /orders` | `/checkout` | **Không có giao diện riêng**: là lỗi lập trình. Hiện Alert chung + **Tải lại trang** | "Chưa đặt được hàng. Vui lòng tải lại trang và thử lại." | `checkout.md` |
| 400 | `VALIDATION_ERROR` (`productId`) | `POST /cart/items` | `/try-on` | **Không có giao diện riêng** (FE lấy id từ dữ liệu server). Hiện như `INTERNAL_ERROR` | "Chưa thêm được vào giỏ. Vui lòng thử lại." | `add-to-cart.md` |
| 400 | `VALIDATION_ERROR` (`quantity`) | `PATCH /cart/items/:id` | `/cart` | **Không có giao diện riêng**: stepper không gửi số sai (`−` bị khóa ở 1). Hiện như lỗi cập nhật chung | "Chưa cập nhật được giỏ hàng. Vui lòng thử lại." | `cart.md` |
| 400 | `VALIDATION_ERROR` (`page`, `limit`) | `GET /orders`, `GET /admin/orders` | `/orders`, `/admin/orders` | **Không có giao diện**: FE chuẩn hóa `page` trước khi gọi; nếu vẫn 400 thì về trang 1 (replace) | — | `orders.md`, `admin-orders.md` |
| 404 | `NOT_FOUND` | `POST /cart/items` | `/try-on` | Alert `warning` dưới nút; nút soft-disabled; không tự chuyển sản phẩm (D-87) | "Sản phẩm này không còn bán." | `add-to-cart.md` |
| 404 | `NOT_FOUND` | `PATCH /cart/items/:id` | `/cart` | Tải lại `GET /cart`; nếu dòng mất → Alert `info`; nếu dòng ngừng bán → dòng chuyển "Không còn bán" + Alert `warning` | "Sản phẩm này không còn trong giỏ." / "{tên} vừa ngừng bán." | `cart.md` |
| 404 | `NOT_FOUND` | `DELETE /cart/items/:id` (id sai UUID) | `/cart` | **Không có giao diện**: id lấy từ dữ liệu server; DELETE idempotent nên dòng đã mất vẫn 200 | — | — |
| 404 | `NOT_FOUND` | `GET /orders/:id` | `/orders/:id` | Empty state + nút về `/orders`; không phân biệt đơn không có với đơn của người khác (E14) | "Không tìm thấy đơn hàng." | `orders.md` |
| 404 | `NOT_FOUND` | `GET /admin/orders/:id` | `/admin/orders/:id` | Empty state + nút về danh sách | "Không tìm thấy đơn hàng." | `admin-orders.md` |
| 409 | `CART_QUANTITY_LIMIT` | `POST /cart/items` | `/try-on` | Alert `warning` dưới nút + link "Xem giỏ hàng"; số trong giỏ giữ nguyên; nút soft-disabled khi đã biết `maxQuantity` | "Mỗi sản phẩm chỉ đặt tối đa {`maxQuantity`} món." | `add-to-cart.md` |
| 409 | `CART_QUANTITY_LIMIT` | `PATCH /cart/items/:id` | `/cart` | Lỗi dòng dưới stepper (`role="alert"`); `+` aria-disabled ở mức tối đa | "Mỗi sản phẩm chỉ đặt tối đa {`maxQuantity`} món." | `cart.md` |
| 409 | `CART_FULL` | `POST /cart/items` | `/try-on` | Alert `warning` dưới nút + link "Xem giỏ hàng" | "Giỏ hàng đã đầy (tối đa {`maxLines`} sản phẩm). Hãy bỏ bớt sản phẩm trong giỏ để thêm sản phẩm mới." | `add-to-cart.md` |
| 409 | `CART_EMPTY` | `POST /orders` | `/checkout` | Thay form bằng khối thông báo + **Xem Đơn của tôi** + link về giỏ; bỏ dữ liệu form | "Giỏ hàng đang trống. Nếu bạn vừa đặt hàng, hãy xem ở Đơn của tôi." | `checkout.md` |
| 409 | `CART_HAS_UNAVAILABLE` | `POST /orders` | `/checkout` → `/cart` | Chuyển `/cart`; Alert tĩnh của giỏ; nút Đặt hàng aria-disabled kèm lý do; form giữ trong `CheckoutDraft` | "Có {n} sản phẩm không còn bán. Hãy bỏ chúng khỏi giỏ để đặt hàng." | `checkout.md`, `cart.md` |
| 409 | `CART_CHANGED` | `POST /orders` | `/checkout` | Ở lại; Alert `warning` `role="alert"` + tổng cũ → mới + đánh dấu dòng thay đổi; focus Alert; **không tự gửi lại**; giữ form | "Giỏ hàng vừa thay đổi. Vui lòng kiểm tra lại rồi xác nhận." | `checkout.md` |
| 429 | `TOO_MANY_REQUESTS` | `POST /cart/items` | `/try-on` | Alert `warning` + nút aria-disabled đếm ngược | "Bạn thao tác quá nhanh, thử lại sau {N} giây." | `add-to-cart.md` |
| 429 | `TOO_MANY_REQUESTS` | `PATCH`, `DELETE`, `GET /cart` | `/cart` | Alert `warning`; stepper, Bỏ, Đặt hàng aria-disabled tới hết giờ | như trên | `cart.md` |
| 429 | `TOO_MANY_REQUESTS` | `POST /orders` | `/checkout` | Alert `warning`; nút aria-disabled; hiển thị phút khi ≥ 90 giây; giữ form | "Bạn thao tác quá nhanh, thử lại sau {N} giây." hoặc "…sau {M} phút." | `checkout.md` |
| 429 | `TOO_MANY_REQUESTS` | `GET /orders*` | `/orders*` | Alert `warning` + **Thử lại** aria-disabled tới hết giờ | như trên | `orders.md` |

Ghi chú: `GET /admin/orders*` không có rate limit (api.md mục 3) nên không có hàng 429 admin.

## 2. Mã dùng chung (kế thừa)

| HTTP | Mã | Giao diện | Chữ |
|---|---|---|---|
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED` | **Không có UI riêng.** API client về `/login`. Giỏ còn ở server; dữ liệu form `/checkout` mất (không lưu xuống trình duyệt) | — |
| 403 | `FORBIDDEN` | Cart, orders của người mua: **không có UI** (guard chuyển admin về `/admin`; không có nút nào cho admin). Admin API: trang 403 của `RequireAdmin` | — |
| 500, không có response | `INTERNAL_ERROR` | Theo màn hình, xem 3 | — |

## 3. Lỗi chung theo màn hình (500, mất mạng, hết giờ)

| Màn hình | Tình huống | Giao diện | Chữ |
|---|---|---|---|
| `/try-on` thêm giỏ | 500 / mất mạng | Alert `danger` dưới nút, nút dùng lại ngay, không tự gửi lại | "Chưa thêm được vào giỏ. Vui lòng thử lại." |
| `/cart` tải | Lỗi | Error state thay cả danh sách và tóm tắt; **không** hiện tổng cũ | "Không thể tải giỏ hàng. Vui lòng kiểm tra mạng và thử lại." + Thử lại |
| `/cart` thao tác | Lỗi | Alert `danger` đóng được; hiển thị lại số từ server | "Chưa cập nhật được giỏ hàng. Vui lòng thử lại." |
| `/checkout` tải | Lỗi | Error state, không form | "Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại." |
| `/checkout` gửi | 500 | Alert `danger`, nút dùng lại, **cùng khóa** | "Chưa đặt được hàng. Vui lòng thử lại." |
| `/checkout` gửi | Mất mạng / hết giờ, không biết đơn đã ghi chưa | Alert `warning`; nút đổi thành "Thử lại" (cùng khóa); link "Xem Đơn của tôi" | "Chưa rõ đơn đã được ghi hay chưa. Bấm Thử lại để kiểm tra, sẽ không tạo thêm đơn thứ hai." |
| `/orders`, `/orders/:id` | Lỗi | Error state + Thử lại | "Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại." |
| `/admin/orders*` | Lỗi | Error state + Thử lại | "Không thể tải đơn hàng. Vui lòng kiểm tra mạng và thử lại." |

## 4. Mã trong bảng API không có giao diện riêng, và lý do

| Mã / trường hợp | Lý do không có UI riêng |
|---|---|
| `VALIDATION_ERROR` của `productId`, `idempotencyKey`, `cartFingerprint`, `quantity`, `page`, `limit` | Giao diện tự sinh hoặc lấy các giá trị này từ dữ liệu server, và chuẩn hóa trước khi gửi, nên người dùng không thể gây ra. Nếu vẫn xảy ra là lỗi lập trình: hiện thông báo chung và ghi log dev; không có chữ riêng để người dùng sửa |
| `FORBIDDEN` trên API giỏ, đơn của người mua | Admin bị guard chuyển về `/admin` trước khi gọi, và không có nút nào gọi các API này |
| `NOT_FOUND` của `DELETE /cart/items/:id` | DELETE idempotent (dòng mất vẫn 200); id lấy từ dữ liệu server nên không sai định dạng |
| `UNAUTHORIZED`, `TOKEN_EXPIRED` | Xử lý một chỗ ở API client (CLAUDE.md), không có UI từng màn hình |
| 429 của `GET /admin/orders*` | Không có rate limit đọc cho admin |
