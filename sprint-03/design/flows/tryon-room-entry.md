# Luồng: Vào phòng thử đồ

> US-05 §5.1, E1–E5, E10, AC-01, AC-02, AC-21 · `GET /api/try-on/state` · D-09, D-71, D-72, D-93, D-95

```mermaid
flowchart TD
  U0(["Người mua mở /try-on"]) --> G1{"Guard: đã đăng nhập?"}
  G1 -- Không --> L[Về Đăng nhập]
  G1 -- "Có, role admin" --> A["Về /admin (như D-38)"]
  G1 -- "Có, role user" --> F1["GET /try-on/state"]
  F1 --> B1[["auth + requireRole user"]]
  B1 --> B2[("Đọc profile + get_tryon_usage")]
  B2 --> F2{"profile.completed?"}
  F2 -- Không --> F3["'Hoàn thiện hồ sơ để bắt đầu thử đồ'<br/>liệt kê phần thiếu, nút tới Hồ sơ"]
  F2 -- Có --> F4{"consent.accepted?"}
  F4 -- Không --> F5["Khối consent, ô không tích sẵn<br/>xem tryon-consent"]
  F4 -- Có --> F6["GET /try-on/categories"]
  F6 --> F7{"Có danh mục?"}
  F7 -- Không --> F8["'Cửa hàng chưa có sản phẩm để thử.'"]
  F7 -- Có --> F9["Hiện danh mục<br/>KHÔNG tự chọn, KHÔNG sinh ảnh"]
  F9 --> F10{"generation.available?"}
  F10 -- Không --> F11["Thêm 'Tính năng tạo ảnh đang tạm dừng.'<br/>Ảnh đã có vẫn xem được"]
  F10 -- Có --> F12([Chờ người mua chọn])
  F11 --> F12
```

## Quy tắc quan trọng

| Quy tắc | Lý do |
|---|---|
| `GET /state` không chặn, chỉ báo trạng thái | Một chỗ để FE quyết định màn hình. Chốt thật nằm ở backend khi tạo job (D-71) |
| Không tự chọn danh mục | Tránh tốn lượt ngoài ý muốn (D-72) |
| Không có URL ảnh nào trong `/state` | Không ký URL khi chưa cần |
| Số đo vẫn là điều kiện dù model không dùng | D-95. Nói rõ ở màn hình nếu cần, xử lý ở bước 4 |
