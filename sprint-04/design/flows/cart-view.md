# Luồng: Xem giỏ, đổi số lượng, bỏ dòng

> US-08 §4.1, §4.2, R1–R4, E1–E3, E15, AC-01 → AC-03, AC-05, AC-08 · `GET /api/cart`, `PATCH`, `DELETE /api/cart/items/:productId` · D-42, D-142, D-143

## 1. Xem giỏ

```mermaid
flowchart TD
  U0(["Mở /cart"]) --> G0{"Role?"}
  G0 -- admin --> G1["Chuyển về /admin (như D-38)"]
  G0 -- user --> B0["GET /cart"]
  B0 -- "Lỗi" --> E1["Thông báo + Thử lại<br/>không hiện tổng cũ (E15)"]
  B0 --> D1[("get_cart: một lệnh SQL<br/>giá, tên từ products, không từ cart_items")]
  D1 --> F0{"itemCount = 0?"}
  F0 -- Có --> F1["Giỏ trống, lối về /try-on, không có nút đặt"]
  F0 -- Không --> F2["Mỗi dòng:"]
  F2 --> F3{"available?"}
  F3 -- Không --> F4["'Không còn bán', không giá, không +/−, có nút bỏ<br/>Không tính vào tổng (D-143)"]
  F3 -- Có --> F5{"priceChangedFrom khác null?"}
  F5 -- Có --> F6["Đơn giá mới + 'Giá đã đổi từ X'"]
  F5 -- Không --> F7["Đơn giá, số lượng, thành tiền"]
  F4 --> F8{"hasUnavailable?"}
  F6 --> F8
  F7 --> F8
  F8 -- Có --> F9["Tắt nút Đặt hàng, ghi rõ lý do"]
  F8 -- Không --> F10["Bật nút Đặt hàng → /checkout"]
```

## 2. Đổi số lượng, bỏ dòng

```mermaid
flowchart TD
  U0(["Bấm −, + hoặc Bỏ"]) --> F1["Khóa điều khiển của dòng đó<br/>Không tự tính lại tổng"]
  F1 --> R{"Thao tác"}
  R -- "−, +" --> P0["PATCH { quantity: số tuyệt đối }"]
  R -- Bỏ --> D0["DELETE"]
  P0 --> P1{"zod: số nguyên ≥ 1?"}
  P1 -- Sai --> E400["400 VALIDATION_ERROR"]
  P1 -- OK --> P2[("set_cart_item_quantity<br/>Khóa users, kiểm dòng, còn bán, giới hạn")]
  P2 -- not_in_cart, unavailable --> E404["404 NOT_FOUND<br/>tải lại GET /cart"]
  P2 -- quantity_limit --> E409["409 CART_QUANTITY_LIMIT"]
  P2 -- ok --> OK
  D0 --> D1[("remove_cart_item<br/>Khóa users. Dòng đã mất vẫn ok")]
  D1 --> OK["200 Cart: tổng, fingerprint mới"]
  OK --> F2["Hiện theo response, cập nhật số trên header"]
```

## 3. Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| FE không bao giờ tự tính tổng, kể cả cập nhật lạc quan | Backend là nguồn duy nhất của tiền (R1) |
| `PATCH` gửi số tuyệt đối | Gửi lại không cộng dồn (AC-03) |
| Dòng ngừng bán giữ nguyên trong giỏ | Không có món nào biến mất không giải thích (D-143) |
| Ảnh dòng ngừng bán vẫn hiện | D-42 giữ file |
| Hai tab: không đồng bộ thời gian thực | `fingerprint` bắt được ở lúc đặt hàng; tab cũ tự đúng lại khi có response tiếp theo |
| Đổi giá báo cả khi giảm | Người mua nên biết số tiền đã đổi |
