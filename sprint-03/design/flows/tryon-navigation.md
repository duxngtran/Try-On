# Luồng: Chuyển sản phẩm

> US-06 §4, R1–R10, E1–E10, AC-01, AC-02, AC-05, AC-06, AC-09 → AC-18 · D-44, D-84, D-86, D-87

## 1. Một lần chuyển

```mermaid
flowchart TD
  U0(["Mũi tên, vuốt ≥ 50 px, phím ← →"]) --> F1{"Có sản phẩm kế tiếp<br/>trong danh sách đã tải?"}
  F1 -- "Không, nextCursor khác null" --> F2["GET /products?after=nextCursor"]
  F2 -- Lỗi --> F3["Ở lại, 'Không tải được sản phẩm tiếp theo.' nút Thử lại"]
  F2 -- OK --> F4
  F1 -- "Không, hết danh sách" --> F5["Mũi tên tắt, 'Bạn đã xem hết danh mục này'<br/>lối sang Danh mục khác. Không vòng lại"]
  F1 -- Có --> F4["Ngay (≤ 200 ms): đổi tên, giá, vị trí, ảnh trải phẳng,<br/>cập nhật URL. Không khóa nút"]
  F4 --> F6["Hủy mọi timer của sản phẩm trước<br/>Ngừng poll job của sản phẩm trước"]
  F6 --> F7["GET /products/P/result"]
  F7 -- "404" --> E1["'Sản phẩm này không còn bán.'<br/>nút Xem sản phẩm tiếp theo<br/>KHÔNG tự chuyển, KHÔNG tự sinh<br/>tải lại danh sách ngầm"]
  F7 -- "403, 409" --> E2["Lời nhắc, gỡ ảnh try-on khỏi màn hình,<br/>dừng generate trước"]
  F7 -- ready --> F8["Hiện ảnh. Rồi xem tryon-prefetch"]
  F7 -- pending --> F9["Gắn vào job, poll"]
  F7 -- blocked --> F10["Hiện E14, E15. Mũi tên vẫn dùng được"]
  F7 -- none --> F11{"Vẫn ở P sau 400 ms?"}
  F11 -- Không --> F12["Không làm gì. AC-05"]
  F11 -- Có --> F13["POST /products/P/jobs { display }"]
```

Thứ tự: `GET /result` chạy ngay; đếm 400 ms bắt đầu từ lúc **chuyển tới**, không phải lúc có response.

## 2. Xử lý kết quả về khi đã đổi sản phẩm

```mermaid
flowchart TD
  R0([Có response hoặc kết quả poll]) --> R1{"productId + image.version<br/>có khớp sản phẩm đang xem?"}
  R1 -- Không --> R2["Bỏ khỏi giao diện. Kết quả vẫn nằm trong cache server (AC-06)"]
  R1 -- Có --> R3[Áp dụng vào màn hình]
```

## 3. Mở trang bằng URL, tải lại

```mermaid
flowchart TD
  L0(["/try-on?category=C&product=P"]) --> L1["GET /categories/C/products?at=P"]
  L1 -- "404" --> L2["'Danh mục không còn tồn tại.' về danh sách danh mục"]
  L1 --> L3{"anchor"}
  L3 -- "found, không xóa" --> L4["items[0] = P<br/>GET /products/P/result: gắn vào job đang chạy nếu có (AC-17)"]
  L3 -- "deleted" --> L5["E3, nút chuyển sang items[0]"]
  L3 -- "found = false" --> L6["Về sản phẩm đầu của danh mục, không báo lỗi (E6)"]
```

## 4. Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| Con trỏ `(created_at, id)`, không theo số thứ tự | Thêm, xóa sản phẩm không làm lặp hay bỏ sót (AC-11) |
| Con trỏ của sản phẩm đã xóa vẫn dùng được | Hàm so vị trí, không yêu cầu dòng còn hiệu lực. Tìm được sản phẩm kế tiếp sau khi xóa (AC-12) |
| Sản phẩm mới chỉ hiện khi chọn lại danh mục | Vị trí đang xem không nhảy (E7) |
| Lỗi nằm tại sản phẩm đó | Mũi tên không khóa (AC-14) |
| Hết lượt vẫn lướt được | Ảnh đã có hiện bình thường (E2, AC-15) |
| Khóa bộ nhớ tạm ở FE có `image.version` | Không hiện ảnh cũ sau khi đổi ảnh sản phẩm (R9) |
| Signed URL chỉ trong bộ nhớ trang | US-06 mục 9. URL của trang chỉ có id, không có URL ảnh |
| Tải trước ảnh liền kề | Chỉ `GET /result` + `<img>`, không bao giờ `POST /jobs` (R10) |
| Sản phẩm đang xem bị xóa mà không thao tác | Giữ ảnh tới lần gọi API kế tiếp, không cập nhật thời gian thực (E4) |
