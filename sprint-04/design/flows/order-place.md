# Luồng: Đặt hàng

> US-08 §4.3, R1, R5–R11, E4–E13, AC-04, AC-06 → AC-14, AC-16 → AC-18 · `POST /api/orders` · D-138, D-139, D-142, D-144, D-145

Phần trong khung DB là **một transaction** của `place_order`. Mọi bảo đảm về giá, đặt trùng, giỏ đổi nằm ở đây.

## 1. Trang đặt hàng và gửi

```mermaid
flowchart TD
  U0(["Mở /checkout"]) --> F1["GET /cart"]
  F1 --> F2{"Rỗng?"}
  F2 -- Có --> F3["Về /cart (E13)"]
  F2 -- Không --> F4{"hasUnavailable?"}
  F4 -- Có --> F5["Về /cart"]
  F4 -- Không --> F6["Hiện tóm tắt, tổng từ API<br/>Giữ fingerprint<br/>Sinh idempotencyKey MỘT LẦN"]
  F6 --> U1(["Nhập người nhận, số điện thoại, địa chỉ<br/>chỉ trong bộ nhớ trang"])
  U1 --> F7{"zod FE hợp lệ?"}
  F7 -- Sai --> F8["Lỗi dưới từng ô, focus ô đầu"]
  F7 -- OK --> F9["Khóa nút, POST /orders<br/>{ key, fingerprint, recipient }"]
  F9 --> B1[["auth + requireRole user"]]
  B1 --> B2{"Rate limit 20/giờ"}
  B2 -- Vượt --> E429["429, đếm ngược, giữ form"]
  B2 -- OK --> B3{"zod BE sau chuẩn hóa"}
  B3 -- Sai --> E400["400, field"]
  B3 -- OK --> DBREF[["place_order, xem mục 2"]]
  DBREF --> R{"out_status"}
  R -- ok --> OK1["201 Order"]
  R -- replayed --> OK2["200 Order đã có"]
  R -- cart_empty --> E1["409 CART_EMPTY<br/>link Đơn của tôi"]
  R -- cart_has_unavailable --> E2["409 CART_HAS_UNAVAILABLE<br/>về /cart"]
  R -- cart_changed --> E3["409 CART_CHANGED<br/>ở lại, GET /cart, fingerprint mới<br/>Giữ form, chờ người mua xác nhận lại<br/>KHÔNG tự gửi lại"]
  DBREF -- "Lỗi SQL" --> E500["Repository làm sạch lỗi: chỉ giữ mã<br/>500 INTERNAL_ERROR, giỏ không đổi"]
  OK1 --> F10["navigate /orders/:id, replace<br/>Số trên header về 0"]
  OK2 --> F10
  F9 -- "Mất response" --> F11["'Chưa rõ đơn đã ghi chưa'<br/>Thử lại với CÙNG khóa"]
  F11 --> F9
```

## 2. `place_order`, một transaction

```mermaid
flowchart TD
  D0([Vào transaction]) --> D1[("Khóa dòng users FOR NO KEY UPDATE<br/>Mọi add, set, remove, place của người này xếp hàng ở đây")]
  D1 --> D2{"Đã có đơn cùng<br/>(user_id, idempotency_key)?"}
  D2 -- Có --> X1["replayed + order id"]
  D2 -- Không --> D3[("Khóa các products trong giỏ FOR SHARE, theo id<br/>update_product và xóa mềm phải đợi tới hết transaction")]
  D3 --> D4[("get_cart: đọc SAU khi có khóa<br/>nên thấy giá mới nhất đã commit")]
  D4 --> D5{"line_count = 0?"}
  D5 -- Có --> X2[cart_empty]
  D5 -- Không --> D6{"Có dòng ngừng bán?"}
  D6 -- Có --> X3[cart_has_unavailable]
  D6 -- Không --> D7{"fingerprint gửi lên<br/>= fingerprint vừa tính?"}
  D7 -- Không --> X4[cart_changed]
  D7 -- Có --> D8[("insert orders<br/>total, item_count do DB tính, 3 trường nhận hàng")]
  D8 --> D9[("insert order_items<br/>chụp tên, giá từ products; thứ tự như giỏ")]
  D9 --> D10[("delete cart_items của người này")]
  D10 --> X5["ok + order id"]
```

**Lỗi ở bất kỳ bước ghi nào** (D8 → D10): cả transaction hoàn tác, không có đơn, giỏ giữ nguyên (AC-14).

## 3. Các tình huống tương tranh

| Tình huống | Điều xảy ra | Kết quả | AC |
|---|---|---|---|
| Bấm đúp, thử lại sau timeout, cùng khóa | Yêu cầu sau xếp hàng ở khóa `users`, thấy đơn đã có | 1 đơn, yêu cầu sau nhận đúng đơn đó | AC-10, AC-11 |
| Hai tab, khác khóa | Tab sau thấy giỏ đã rỗng | 1 đơn, tab sau 409 `CART_EMPTY` | AC-12 |
| Thêm món ở tab khác **trước** khi đặt | `fingerprint` lệch | 409 `CART_CHANGED`, không đơn | AC-13 |
| Thêm món ở tab khác **sau** khi đặt | Chờ khóa, rồi ghi vào giỏ đã rỗng | Món nằm ở giỏ mới, không mất | AC-13 |
| Admin đổi giá, commit **trước** | Đọc sau khóa thấy giá mới, `fingerprint` lệch | 409, người mua thấy giá mới | AC-06, AC-07 |
| Admin đổi giá **sau** khi có `FOR SHARE` | Admin đợi tới khi đơn commit | Đơn ở giá cũ người mua đã thấy | AC-07 |
| Admin xóa mềm, commit trước | Thấy dòng ngừng bán | 409 `CART_HAS_UNAVAILABLE` | AC-08 |
| Admin xóa mềm sau | Admin đợi, đơn vẫn ghi | Đơn hợp lệ, xóa diễn ra ngay sau | AC-09 |
| Hai người mua cùng sản phẩm | `FOR SHARE` không chặn nhau | Cả hai đều được | — |

## 4. Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Client không gửi tiền | Mọi số tiền lấy từ `products` trong transaction (AC-04) |
| Sau `CART_CHANGED` không tự gửi lại | Người mua phải thấy giá mới rồi mới đồng ý (D-144) |
| Khóa dùng lại được sau `CART_CHANGED`, `CART_HAS_UNAVAILABLE` | Khóa chỉ lưu khi có đơn |
| Khóa chỉ sống cùng form | Tải lại trang sinh khóa mới. An toàn: nếu lần trước đã đặt thì giỏ đã rỗng (`CART_EMPTY`) |
| Sinh khóa bằng `crypto.getRandomValues` | `crypto.randomUUID` không có trên HTTP thường (thử bằng điện thoại qua LAN) |
| `recipient` khác nhưng cùng khóa vẫn trả đơn cũ | Khóa xác định "lần đặt này". FE chuyển tới trang đơn, người mua thấy đúng địa chỉ đã lưu |
| Không ghi form xuống trình duyệt | Dữ liệu cá nhân (R9). Đánh đổi: hết phiên thì nhập lại |
| Làm sạch lỗi rpc | `errorHandler` dev log nguyên lỗi, lỗi ràng buộc chứa "Failing row contains" (AC-17) |
