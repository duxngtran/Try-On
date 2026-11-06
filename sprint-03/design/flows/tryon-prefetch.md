# Luồng: Generate trước

> US-06 §4.3, R5, R6, AC-03, AC-04, AC-08 · D-85, D-90, D-94

Chỉ chạy khi có `TRYON_PREFETCH_ENABLED=true`. Ảnh chưa được chuyển tới thì người mua không thấy.

```mermaid
flowchart TD
  A0(["Ảnh sản phẩm hiện tại đã sẵn sàng"]) --> A1{"Dừng ≥ 1 giây?"}
  A1 -- "Không, đã chuyển đi" --> Z[Không làm gì]
  A1 -- Có --> A2{"Điều kiện phía FE"}
  A2 -- "Cuối danh sách; ảnh hiện tại lỗi; tab ẩn;<br/>tiết kiệm dữ liệu; prefetchAllowed = false;<br/>còn ≤ 3 lượt theo state gần nhất" --> Z
  A2 -- Đạt --> A3["GET /products/P+1/result"]
  A3 -- "ready, pending, blocked" --> Z2["Không tạo job"]
  A3 -- "404, 403, 409" --> Z3["Bỏ qua, im lặng"]
  A3 -- none --> A4["POST /products/P+1/jobs { prefetch }"]
  A4 --> B{"Backend tự kiểm lại toàn bộ"}
  B -- "skipped" --> Z4["Bỏ qua, im lặng"]
  B -- "lỗi 4xx, 5xx" --> Z4
  B -- pending --> C["Poll job này"]
  C --> D{"Kết quả"}
  D -- succeeded --> E["Tải sẵn ảnh trong trình duyệt"]
  D -- "failed" --> F["Im lặng. Chỉ báo khi người mua thật sự chuyển tới"]
```

## Phân chia trách nhiệm

| Điều kiện | FE | BE | Vì sao |
|---|---|---|---|
| Dừng ≥ 1 giây, ảnh hiện tại sẵn sàng hoặc lỗi | Có | — | Chỉ FE biết |
| Tab ẩn, tiết kiệm dữ liệu | Có | — | Chỉ FE biết |
| Cuối danh sách | Có | — | FE đang giữ danh sách |
| Ảnh kế tiếp đã có, đang chạy, bị chặn | Có | **Có** | |
| Còn ≤ 3 lượt | Có | **Có** | Client không ép được (US-06 mục 6) |
| Đã có 2 job của người này | — | **Có** | |
| Hệ thống bận (`queued + running ≥ 6`) | — | **Có** | |
| Từ 80% ngân sách | Có | **Có** | |
| Quyền, consent, hồ sơ, sản phẩm | — | **Có** | |

## Chuyển tới khi generate trước đang chạy

```mermaid
flowchart LR
  A["Chuyển tới P+1"] --> B["GET /result: pending"]
  B --> C["POST /jobs { display } sau 400 ms:<br/>cùng job, nâng purpose thành display"]
  C --> D["Poll, hiện ảnh khi xong"]
```

Nâng `purpose` để job còn `queued` đi trước và không bị job hiển thị khác hủy. Khi nâng, ảnh này được tính là người mua đã xem.

## Đo hiệu quả

US-06 mục 9: nếu ảnh generate trước được xem dưới 50% thì báo lại để cân nhắc tắt. `npm run tryon:report` tính từ `tryon_jobs.purpose = 'prefetch'` và `tryon_images.first_viewed_at`.
