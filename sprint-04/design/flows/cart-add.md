# Luồng: Thêm vào giỏ từ phòng thử đồ

> US-07 §4, R1–R8, E1–E10, AC-01 → AC-13 · `POST /api/cart/items` · D-52, D-87, D-119, D-140, D-146

Nhánh này **độc lập với máy trạng thái ảnh**: không đọc, không đổi, không chờ job. Đó là lý do nút dùng được khi ảnh đang chờ, lỗi, bị chặn, hết lượt.

```mermaid
flowchart TD
  U0(["Bấm Thêm vào giỏ ở sân khấu G4"]) --> F1{"Request của chính<br/>sản phẩm này đang chạy?"}
  F1 -- Có --> F2["Bỏ qua lần bấm (AC-06)"]
  F1 -- Không --> F3["Lấy productId và tên TẠI LÚC BẤM<br/>Trạng thái đang gửi chỉ trên nút<br/>Ảnh, mũi tên, poll chạy tiếp"]
  F3 --> B0["POST /cart/items { productId }"]
  B0 --> B1[["auth + requireRole user"]]
  B1 --> B2{"Rate limit 120/phút"}
  B2 -- Vượt --> E429["429 TOO_MANY_REQUESTS"]
  B2 -- OK --> B3{"zod: UUID?"}
  B3 -- Sai --> E400["400 VALIDATION_ERROR"]
  B3 -- OK --> DB

  subgraph DB ["add_cart_item, một transaction"]
    D1[("Khóa dòng users FOR NO KEY UPDATE<br/>nối tiếp với mọi thao tác giỏ, đơn của người này")]
    D1 --> D2{"Sản phẩm còn bán?"}
    D2 -- Có --> D3{"Đã có dòng?"}
    D3 -- Có --> D4{"quantity đã đạt tối đa?"}
    D4 -- Không --> D5[("quantity + 1<br/>added_price_vnd = giá hiện tại")]
    D3 -- Không --> D6{"Đã đủ 30 dòng?"}
    D6 -- Không --> D7[("Thêm dòng, quantity 1")]
  end

  D2 -- Không --> E404["404 NOT_FOUND<br/>'Sản phẩm này không còn bán.'<br/>Không tự chuyển (D-87)"]
  D4 -- Có --> E409A["409 CART_QUANTITY_LIMIT"]
  D6 -- Có --> E409B["409 CART_FULL"]
  D5 --> R1["get_cart, 200 Cart"]
  D7 --> R1
  R1 --> F4["Cập nhật giỏ trong provider, số trên header"]
  F4 --> F5{"priceVnd trong response<br/>khác giá đang hiện?"}
  F5 -- Có --> F6["Thông báo kèm 'Giá hiện tại: X' (AC-11)"]
  F5 -- Không --> F7["'Đã thêm tên vào giỏ'"]
  F6 --> F8(["Ở lại phòng, không đổi sản phẩm, không đổi ảnh"])
  F7 --> F8
```

## Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Không gọi `/try-on/*` nào, không đọc `tryon_*` | Không tốn lượt, ngân sách (AC-03) |
| `productId` và tên chụp lúc bấm, thông báo dùng tên đó | `ProductStage` mount lại khi đổi sản phẩm; response về muộn vẫn đúng sản phẩm (AC-05) |
| Trạng thái request giữ ở `CartProvider`, không ở `ProductStage` | Đổi sản phẩm không hủy request, không mất thông báo |
| Khóa theo từng sản phẩm, không khóa toàn cục | Lướt sang sản phẩm khác vẫn thêm được ngay |
| Nhiều request chồng nhau: khi hết request gọi `GET /cart` một lần | Response có thể về khác thứ tự gửi; không để số trên header lệch |
| Đổi số trong giỏ không làm đổi `key` của `ProductStage` | Không mất ảnh, không dừng poll (AC-02) |
| Không tự gửi lại khi lỗi mạng | `POST` không idempotent. Nếu thực tế đã ghi, người mua thấy và sửa được ở `/cart` |
| Cổng G1, G2 hiện thì không có nút, nhưng giỏ vẫn còn | Giỏ không phụ thuộc hồ sơ, consent (R6) |
