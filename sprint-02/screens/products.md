# Screen Descriptions — Danh sách sản phẩm

> US-04 §4.1, §4.4, AC-10, AC-11 · `GET /api/admin/products`, `DELETE /api/admin/products/:id` · D-42, D-44, D-52, D-53 · Flows: `design/flows/product-list.md`, `product-delete.md`

## Sản phẩm — `/admin/products`

### Mục đích
Admin xem sản phẩm (mới nhất trước), lọc theo danh mục, chuyển trang, đi tới thêm/sửa và xóa sản phẩm. Không có tìm kiếm, sắp xếp, chọn nhiều, ẩn/hiện (US-04 §3). Không hiển thị size, tồn kho, màu, mô tả (D-52).

### Quyền truy cập
Admin. Guest → `/login`; user thường → 403.

### Trạng thái URL
`/admin/products?categoryId=<uuid>&page=<n>`. Cả hai tùy chọn; giá trị mặc định (không có `categoryId`, `page=1`) thì bỏ khỏi URL. Tải lại trang giữ nguyên bộ lọc và trang. Đổi bộ lọc → `page` về 1 (bỏ khỏi URL). Mỗi lần đổi lọc hoặc trang là một mục lịch sử (nút Back quay lại trang trước). `limit` cố định 20, không có ô chọn.

### Bố cục tổng
1. Hàng tiêu đề: `h1` "Sản phẩm" + chú thích `small` `ink-muted` "25 sản phẩm" (theo `pagination.total`, ẩn khi đang tải lần đầu) + nút primary **Thêm sản phẩm** (icon `Plus`, link `/admin/products/new`).
2. Thanh lọc: **Select "Danh mục"** (label hiển thị).
3. `DataList` sản phẩm.
4. Phân trang.

### Các thành phần chính

1. **Select lọc danh mục**
   - Mô tả: label "Danh mục", tùy chọn đầu "Tất cả danh mục", tiếp theo các danh mục theo thứ tự cũ → mới (từ `GET /api/admin/categories`, không kèm số lượng trong tên để khỏi lệch khi tải lại).
   - Tương tác: chọn một danh mục cập nhật URL và tải lại danh sách ngay (không có nút Áp dụng). Nút phụ "Xóa bộ lọc" (link-button) hiện khi đang lọc.
   - Trạng thái: default / focus / disabled khi danh sách danh mục đang tải (kèm spinner 16px, danh sách sản phẩm vẫn tải bình thường). Nếu tải danh mục lỗi: Select disabled, dòng lỗi nhỏ "Không tải được danh mục." + "Thử lại"; danh sách sản phẩm vẫn hiện, chỉ mất khả năng đổi bộ lọc.
   - `categoryId` trên URL không còn trong danh sách (danh mục đã xóa): Select hiện một tùy chọn đã chọn, disabled, "Danh mục không còn tồn tại" và danh sách hiện trạng thái rỗng khi lọc (API trả `items: []`).
   - Chưa có danh mục nào: Select chỉ có "Tất cả danh mục".

2. **Dòng sản phẩm** (DataList)
   - Nội dung: **ảnh thu nhỏ** (khung vuông 56px mobile / 64px ≥ md, `object-contain` trên `surface-muted`, `loading="lazy"`, `width`/`height` khai báo, `alt` = tên sản phẩm) · **Tên** (`body` 600, tối đa 2 dòng, `…`) · **Danh mục** (`small` `ink-muted`) · **Giá** (`body` 600, `tabular-nums`, dạng `199.000 ₫` từ `Intl.NumberFormat('vi-VN')`) · nút **Sửa** (link tới `/admin/products/:id/edit`, secondary, icon `Pencil`, `aria-label="Sửa sản phẩm <tên>"`) · nút **Xóa** (ghost chữ `danger`, icon `Trash2`, `aria-label="Xóa sản phẩm <tên>"`).
   - Link Sửa mang theo vị trí danh sách (`state.from` = `location.search`) để lưu xong quay lại đúng bộ lọc và trang.
   - Ảnh lỗi tải: khung `surface-muted` + icon `ImageOff` 24px, `alt` giữ nguyên. Trong lúc ảnh đang tải: nền `surface-muted` (khung đã giữ kích thước, không nhảy layout).
   - Không hiển thị ngày tạo, id, `image.version`.

3. **Phân trang**
   - Dạng: `<nav aria-label="Phân trang">`: nút "Trước" · "Trang 2 / 2" · nút "Sau", kèm dòng tóm tắt `small` "Hiển thị 21–25 trên 25 sản phẩm".
   - Ẩn hoàn toàn khi `totalPages ≤ 1` (dòng "N sản phẩm" ở tiêu đề vẫn còn).
   - Tương tác: bấm đổi `page` trong URL, cuộn về đầu danh sách, focus vào `h1`. "Trước" disabled ở trang 1, "Sau" disabled ở trang cuối.

4. **Hộp thoại xác nhận xóa** (`Modal`, focus mặc định ở **Hủy**)
   - Tiêu đề "Xóa sản phẩm?"; nội dung "Xóa sản phẩm **<tên>**? Khách sẽ không còn thấy sản phẩm này. Không thể hoàn tác."; nút **Hủy** + **Xóa sản phẩm** (`danger`; loading "Đang xóa…"; khóa Esc/scrim khi đang xóa).
   - 200: đóng, toast "Đã xóa sản phẩm", làm mới danh sách (xem Ghi chú về trang cuối), focus về `h1`.
   - 404 `NOT_FOUND` (đã bị xóa từ tab khác): đóng, toast lỗi "Sản phẩm không còn tồn tại.", làm mới danh sách.
   - 500/mất mạng: Alert `danger` trong hộp thoại "Đã có lỗi xảy ra. Vui lòng thử lại sau." (mất mạng: "Mất kết nối, vui lòng thử lại."); giữ hộp thoại, nút Xóa dùng lại được.
   - Xóa không tính rate limit (D-51) nên không có trạng thái 429 ở đây; nếu vẫn nhận 429 thì hiển thị Alert `warning` chung "Bạn thao tác quá nhanh, vui lòng thử lại sau."

5. **Toast** (provider ở `AdminLayout`): hiện thông báo từ `location.state.notice` do form sản phẩm gửi sang ("Đã thêm sản phẩm" / "Đã cập nhật sản phẩm"; lỗi "Sản phẩm không còn tồn tại." khi form sửa gặp 404). Sau khi hiển thị, xóa `state.notice` (`replace`) để tải lại hoặc Back không hiện lại.

### Trạng thái màn hình

| Trạng thái | Hiển thị |
|---|---|
| Đang tải lần đầu | 5 dòng skeleton đúng cấu trúc dòng thật (khung ảnh vuông, 2 thanh chữ, thanh giá, 2 ô nút); `aria-busy="true"`; `role="status"` ẩn "Đang tải sản phẩm". Tiêu đề và nút Thêm sản phẩm hiện ngay |
| Đổi trang / đổi lọc | Giữ dòng cũ, giảm độ mờ 60%, `aria-busy="true"`, không bấm được nút trong dòng (`inert`); Select vẫn dùng được; spinner 16px cạnh chú thích tổng. Không dùng skeleton để tránh nhấp nháy |
| Có dữ liệu | Như trên |
| Rỗng, không lọc | Empty state: icon `Shirt` 40px, "Chưa có sản phẩm", "Thêm sản phẩm đầu tiên để bắt đầu.", CTA primary "Thêm sản phẩm" |
| Rỗng, đang lọc | Empty state: icon `SearchX`, "Không có sản phẩm trong danh mục này", CTA secondary "Xóa bộ lọc" và primary "Thêm sản phẩm" |
| Lỗi tải (mạng/500) | Error state trong vùng danh sách: "Không thể tải sản phẩm. Vui lòng kiểm tra mạng và thử lại." + **Thử lại**. Nếu đã có dữ liệu cũ (lỗi khi đổi trang): giữ dòng cũ + Alert `danger` phía trên + Thử lại |
| 400 `VALIDATION_ERROR` do URL sai (`page=0`, `limit`, `categoryId=abc`) | FE tự chuẩn hóa trước khi gọi: `page` không phải số nguyên ≥ 1 → coi là 1. `categoryId` không phải UUID → bỏ. Nếu BE vẫn trả 400: Error state "Bộ lọc không hợp lệ." + nút "Xóa bộ lọc" (về `/admin/products`) |
| `page` vượt `totalPages` (`items: []`, `total > 0`) | Tự chuyển (replace) sang trang cuối; nếu `total = 0` thì hiện trạng thái rỗng |
| 401 / `TOKEN_EXPIRED` | Xử lý toàn cục (`/login`, `session-expired`) |

### Responsive
- **Mobile 360px**: mỗi sản phẩm là một khối trong card: hàng trên = ảnh 56px + (tên, danh mục, giá xếp dọc); hàng dưới = hai nút Sửa / Xóa chia đôi (mỗi nút cao 44px). Select lọc full-width. Nút "Thêm sản phẩm" full-width dưới tiêu đề. Phân trang: "Trước" / "Sau" chia hai đầu, "Trang x / y" ở giữa; dòng tóm tắt đặt dưới.
- **Tablet 768px**: dòng là lưới `[ảnh 64px] [tên 1fr] [danh mục 140px] [giá 112px] [nút auto]`, có hàng tiêu đề cột (`caption`: "SẢN PHẨM", "DANH MỤC", "GIÁ"), nút Sửa/Xóa cạnh nhau bên phải. Select lọc `w-64` cạnh nút "Xóa bộ lọc". Nút "Thêm sản phẩm" nằm bên phải hàng tiêu đề.
- **Desktop 1280px**: như tablet trong cột nội dung `max-w-4xl` cạnh sidebar; cột tên rộng hơn; hover dòng đổi nền nhẹ; chuột có tooltip `title` cho tên bị cắt.

### Hiệu ứng
Dòng mờ 60% khi đổi trang (transition opacity 120ms); xóa xong, dòng biến mất bằng làm mới danh sách (không animation riêng); toast trượt-lên 200ms; skeleton shimmer 1,5s. Reduced-motion: tắt shimmer và trượt, giữ đổi độ mờ tức thì.

### Navigation
- Đến từ: `/admin` (card), `AdminNav`, `/admin/categories` (link số sản phẩm, "Xem sản phẩm"), form thêm/sửa (sau khi lưu hoặc Hủy).
- Đi tới: `/admin/products/new`, `/admin/products/:id/edit`, `/admin/categories` (không có link trực tiếp ở đây, qua `AdminNav`), `/login` (401).

### Accessibility
- `h1` "Sản phẩm". Danh sách là `<ul>` (hàng tiêu đề cột `aria-hidden="true"`); mỗi dòng là `<li>` có nút mang `aria-label` chứa tên sản phẩm.
- Select lọc có `<label for>` thật. Kết quả thay đổi sau khi lọc được thông báo bằng vùng `aria-live="polite"` ẩn: "Hiển thị 3 sản phẩm" / "Không có sản phẩm".
- Modal: như `categories.md`. Giá đọc là "199.000 đồng" cho trình đọc màn hình (`aria-label` trên phần tử giá hoặc chữ `sr-only`).
- Ảnh có `alt` là tên sản phẩm; ảnh lỗi vẫn có chữ thay thế.
- Phân trang `nav` có nhãn; trang hiện tại thông báo qua `aria-live`.

### Ghi chú
- Xóa sản phẩm cuối cùng của trang > 1 làm trang đó rỗng: làm mới sẽ nhận `items: []`, FE tự lùi (replace) về trang cuối hợp lệ.
- Danh sách có thể lệch nhẹ nếu admin thêm sản phẩm ở tab khác (offset pagination, mới nhất trước); chấp nhận ở MVP vì chỉ có 1 admin (D-32, D-55).
- Sản phẩm của danh mục đã xóa không tồn tại (chặn ở D-41), nên cột danh mục luôn có giá trị.
