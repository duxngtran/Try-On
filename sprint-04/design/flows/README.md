# Sprint 04 — Luồng nghiệp vụ

Mỗi file là một luồng (Mermaid flowchart). Các bên: **Người mua hoặc Admin → Frontend → Backend (Express) → Supabase (Postgres)**. API ở [`../api.md`](../api.md), DB ở [`../db/README.md`](../db/README.md). **Không luồng nào có dịch vụ AI** (D-146).

| File | Luồng | Story | Endpoint / hàm |
|---|---|---|---|
| [cart-add.md](cart-add.md) | Thêm vào giỏ từ phòng thử đồ | US-07 | `POST /cart/items`, `add_cart_item` |
| [cart-view.md](cart-view.md) | Xem giỏ, đổi giá, ngừng bán, sửa số lượng, bỏ dòng | US-08 | `GET /cart`, `PATCH`, `DELETE /cart/items/:id` |
| [order-place.md](order-place.md) | Đặt hàng, đặt trùng, giỏ đổi giữa chừng | US-08 | `POST /orders`, `place_order` |
| [order-view.md](order-view.md) | Đơn của tôi | US-08 | `GET /orders`, `GET /orders/:id` |
| [admin-orders.md](admin-orders.md) | Admin xem đơn | US-09 | `GET /admin/orders`, `GET /admin/orders/:id` |

**Kế thừa, không vẽ lại:** [`auth-middleware`](../../../sprint-01/design/flows/auth-middleware.md) (401/403), [`session-restore`](../../../sprint-01/design/flows/session-restore.md) (API client xử lý 401), [`tryon-navigation`](../../../sprint-03/design/flows/tryon-navigation.md) (chuyển sản phẩm), [`product-update`](../../../sprint-02/design/flows/product-update.md), [`product-delete`](../../../sprint-02/design/flows/product-delete.md).

Quy ước trong sơ đồ:
- Mọi route bắt đầu bằng `auth + requireRole`, thất bại trả 401/403 theo `auth-middleware`.
- Hình thoi = điểm quyết định; hình trụ = thao tác DB.
- Log chỉ chứa `orderId`, `userId`, mã lỗi. **Không** có họ tên, số điện thoại, địa chỉ.
