# Screen Descriptions — Quản lý danh mục

> US-03 (§4–§6, AC-01 → AC-10) · `GET/POST /api/admin/categories`, `PATCH/DELETE /api/admin/categories/:id` · D-41, D-42, D-43, D-44, D-45, D-54 · Flows: `design/flows/category-*.md`

## Danh mục — `/admin/categories`

### Mục đích
Admin xem, thêm, đổi tên và xóa danh mục sản phẩm. Trang không có danh mục cha/con, ảnh, mô tả, slug, sắp xếp tay (US-03 §3) và chưa có "loại trang phục" (D-45).

### Quyền truy cập
Admin. Guest → `/login`; user thường → 403.

### Bố cục tổng
`AdminLayout` (xem `admin.md`) + vùng nội dung:
1. Hàng tiêu đề: `h1` "Danh mục" (`display` mobile `title`) + chú thích `small` "Có N danh mục" + nút primary **Thêm danh mục** (icon `Plus`).
2. Vùng thông báo nội tuyến (Alert, chỉ khi cần: lỗi làm mới danh sách).
3. `DataList` các danh mục.

### Các thành phần chính

1. **Nút "Thêm danh mục"**
   - Mô tả: primary, cao 44px. Mobile: full-width dưới tiêu đề; ≥ sm: nằm bên phải hàng tiêu đề.
   - Tương tác: mở hộp thoại "Thêm danh mục" (mục 4).
   - Trạng thái: default / hover / focus / disabled (khi danh sách đang tải lần đầu hoặc lỗi tải: chưa có dữ liệu để kiểm tra, nhưng vẫn **không** disabled khi lỗi tải; xem Ghi chú).
   - Hiệu ứng: theo Button chuẩn.

2. **Danh sách danh mục (DataList)**
   - Thứ tự: cũ → mới (D-44), giữ nguyên thứ tự server trả, không sắp lại ở FE.
   - Mỗi dòng: **Tên** (`body` 600, tối đa 2 dòng, cắt `…`, `title` đầy đủ khi bị cắt) · **Số sản phẩm** (`small`) · nút **Sửa** · nút **Xóa**.
   - Số sản phẩm: `0` → chữ "0 sản phẩm" (`ink-muted`, không phải link); `N ≥ 1` → link "N sản phẩm" (`accent-strong`, gạch chân) tới `/admin/products?categoryId=<id>`.
   - Nút Sửa: secondary `sm`→ trên mobile cao 44px, icon `Pencil`, `aria-label="Sửa danh mục <tên>"`. Nút Xóa: ghost chữ `danger`, icon `Trash2`, `aria-label="Xóa danh mục <tên>"`. Khoảng cách giữa hai nút ≥ 8px.
   - Trạng thái dòng: default / hover (nền `surface-muted` nhạt, chỉ desktop) / vừa thêm hoặc vừa đổi tên (nền `accent-soft` 2 giây rồi mờ dần; dòng được cuộn vào tầm nhìn nếu nằm ngoài màn hình).
   - Tên hiển thị dạng văn bản thuần (React tự escape; không render HTML).

3. **Trạng thái danh sách**
   | Trạng thái | Hiển thị |
   |---|---|
   | Đang tải lần đầu | 3 dòng skeleton cùng chiều cao dòng thật (cột tên 40% rộng, cột số 20%, hai ô nút), `aria-busy="true"` trên vùng danh sách, `role="status"` ẩn "Đang tải danh mục". Nút "Thêm danh mục" vẫn dùng được |
   | Có dữ liệu | Như trên |
   | Rỗng (đã xóa hết, R4) | Empty state: icon `Tags` 40px, tiêu đề "Chưa có danh mục", mô tả "Tạo danh mục để bắt đầu thêm sản phẩm.", CTA primary "Thêm danh mục" (nút thứ hai cùng chức năng, vì nút trên đầu trang vẫn còn) |
   | Lỗi tải (E8, mạng/500) | Error state trong vùng danh sách: icon `WifiOff`, "Không thể tải danh mục. Vui lòng kiểm tra mạng và thử lại." + nút **Thử lại** (loading "Đang thử lại…"). Nút "Thêm danh mục" ẩn (không biết danh sách hiện tại, tránh trùng tên không cảnh báo) |
   | Đang làm mới sau khi ghi | Giữ danh sách cũ, không hiện skeleton |
   | Làm mới lỗi sau khi ghi thành công | Giữ danh sách cũ + Alert `warning` "Đã lưu nhưng chưa cập nhật được danh sách." + nút "Tải lại" |

4. **Hộp thoại "Thêm danh mục" / "Sửa danh mục"** (dùng `Modal` 7.9, một component, hai chế độ)
   - Tiêu đề: "Thêm danh mục" / "Đổi tên danh mục". Nội dung: một ô **Tên danh mục** (TextField, label hiển thị, `autocomplete="off"`, `maxLength` không đặt cứng để người dùng thấy lỗi thay vì bị cắt im lặng), hint "2 đến 50 ký tự." Chế độ sửa điền sẵn tên hiện tại, chọn toàn bộ chữ khi mở.
   - Nút: **Hủy** (secondary) + **Lưu** (primary; loading "Đang lưu…"). Enter trong ô tên = Lưu.
   - Focus khi mở: ô Tên (khác với modal xác nhận xóa, vì đây là form). Đóng bằng Esc/scrim/Hủy, trả focus về nút đã mở. Khi đang lưu: Esc/scrim bị khóa, mọi nút và ô tên disabled/readonly.
   - Validation FE (cùng bộ zod với BE, D-21): chuẩn hóa NFC + trim + gộp khoảng trắng trước khi kiểm; kiểm khi bấm Lưu và khi blur nếu đã chạm.
   | Tình huống | Hiển thị |
   |---|---|
   | Rỗng / chỉ khoảng trắng | Lỗi dưới ô: "Vui lòng nhập tên danh mục." |
   | < 2 hoặc > 50 ký tự | "Tên danh mục phải từ 2 đến 50 ký tự." |
   | Có ký tự điều khiển | "Tên danh mục không hợp lệ." |
   | Trùng tên ngay ở FE (so sánh không phân biệt hoa thường, có phân biệt dấu, với danh sách đang hiện, bỏ qua chính danh mục đang sửa) | Chặn trước khi gửi: "Danh mục này đã tồn tại." (BE vẫn là nơi quyết định) |
   | 409 `CATEGORY_NAME_EXISTS` (trùng, hoặc race 2 tab) | Lỗi dưới ô: "Danh mục này đã tồn tại.", giữ hộp thoại và nội dung, focus ô tên, tải lại danh sách ngầm |
   | 400 `VALIDATION_ERROR` có `details` | Gán `details[].message` vào ô `name` |
   | 404 `NOT_FOUND` (chế độ sửa, danh mục đã bị xóa) | Đóng hộp thoại, toast lỗi "Không tìm thấy danh mục.", tải lại danh sách |
   | 401 | Xử lý toàn cục (về `/login`, `session-expired`) |
   | 500 / mất mạng | Alert `danger` `role="alert"` trong hộp thoại, trên hàng nút: "Đã có lỗi xảy ra. Vui lòng thử lại sau." (mất mạng: "Mất kết nối, vui lòng thử lại."). Giữ tên đang nhập |
   | 429 (nếu có) | Alert `warning`: "Bạn thao tác quá nhanh, vui lòng thử lại sau." + đếm ngược nếu có `retryAfterSeconds`; nút Lưu disabled tới hết giờ (D-34) |
   - Lưu thành công: đóng hộp thoại; thêm → toast "Đã thêm danh mục", dòng mới cuối danh sách được tô và cuộn tới; sửa → toast "Đã đổi tên danh mục", dòng cập nhật. Focus trả về nút đã mở (Thêm danh mục / Sửa của dòng đó).
   - Chế độ sửa, tên (sau chuẩn hóa) không đổi: bấm Lưu thì đóng hộp thoại, không gọi API, không toast (BE cho phép nhưng vô ích).
   - Không có ảnh, mô tả, trường thứ hai nào ngoài tên.

5. **Hộp thoại xác nhận xóa** (`Modal`, nút an toàn nhận focus đầu tiên)
   - Điều kiện mở: FE đã có `productCount` từ danh sách.
   - **`productCount = 0`**: tiêu đề "Xóa danh mục?", nội dung "Xóa danh mục **<tên>**? Không thể hoàn tác.", nút **Hủy** (focus mặc định) + **Xóa danh mục** (`danger`; loading "Đang xóa…"). Khi đang xóa khóa Esc/scrim.
   - **`productCount ≥ 1`** (FE biết trước, **không gọi API xóa**; cùng giao diện cho 409 `CATEGORY_HAS_PRODUCTS`, N lấy từ `details.productCount` nếu có, không thì từ danh sách): hộp thoại **chế độ chặn**: tiêu đề "Chưa thể xóa danh mục", icon `Info`, nội dung "Danh mục đang có N sản phẩm. Hãy chuyển hoặc xóa các sản phẩm này trước.", nút primary **Xem sản phẩm** (link tới `/admin/products?categoryId=<id>`) + **Đóng** (secondary, focus mặc định). Không có nút Xóa.
   - 409 `CATEGORY_HAS_PRODUCTS` xuất hiện khi đang xác nhận xóa (sản phẩm vừa được thêm từ tab khác): hộp thoại đổi nội dung sang chế độ chặn ở trên (không đóng rồi mở lại), danh sách tải lại ngầm để cập nhật số.
   - 404 `NOT_FOUND`: đóng hộp thoại, toast lỗi "Không tìm thấy danh mục.", tải lại danh sách.
   - 500/mất mạng: Alert `danger` trong hộp thoại "Đã có lỗi xảy ra. Vui lòng thử lại sau." (nút Xóa bật lại để thử lại).
   - 200: đóng hộp thoại, toast "Đã xóa danh mục", dòng biến mất (fade-out 200ms), focus chuyển về `h1`. Thêm lại cùng tên được (R3) vì tên đã xóa dùng lại được.

6. **Toast**: `role="status"`; lỗi `role="alert"` (design-system 7.4). Thành công 4s, lỗi 6s có nút đóng.

### Responsive
- **Mobile 360px**: dòng danh mục dạng khối dọc: tên (trên cùng, có thể 2 dòng) → "N sản phẩm" → hàng hai nút Sửa / Xóa chia đôi chiều ngang (mỗi nút cao 44px). Hộp thoại là bottom sheet (bo góc trên 16px), nút xếp dọc (hành động chính trên cùng, `flex-col-reverse` như Modal hiện có đặt Hủy dưới).
- **Tablet 768px**: dòng là lưới 3 cột `[tên 1fr] [số sản phẩm 140px] [nút auto]`, nút cạnh nhau bên phải. Hộp thoại căn giữa `max-w-md`.
- **Desktop 1280px**: như tablet trong cột nội dung `max-w-4xl` cạnh sidebar. Hàng tiêu đề cột (`caption`: "TÊN", "SẢN PHẨM") hiện từ `md`. Hover dòng đổi nền nhẹ.

### Hiệu ứng
Tô dòng mới/đổi tên 2s (opacity, tắt khi reduced-motion); dòng xóa fade-out 200ms; hộp thoại `animate-toast-in` sẵn có (200ms); skeleton shimmer 1,5s. Reduced-motion: tắt shimmer, fade, tô dòng (thay bằng toast + focus).

### Navigation
- Đến từ: `/admin` (card), `AdminNav`, form sản phẩm (liên kết "Cần tạo danh mục trước", E18).
- Đi tới: `/admin/products?categoryId=<id>` (link số sản phẩm, "Xem sản phẩm"), `/login` (401).

### Accessibility
- `h1` "Danh mục"; danh sách là `<ul>`, mỗi `<li>` có tên làm nhãn cho cặp nút (nhờ `aria-label` đã nêu).
- Modal: `role="dialog"`, `aria-modal`, `aria-labelledby` (tiêu đề) và `aria-describedby` (nội dung); trap focus; trả focus.
- Lỗi ô tên có `id`, gắn `aria-describedby`, `aria-invalid="true"`; lỗi sau gửi `role="alert"`, lỗi blur `aria-live="polite"`; sau lỗi focus ô tên.
- Không dùng màu đơn thuần: chế độ chặn có icon `Info` + tiêu đề; trạng thái lỗi có icon `AlertCircle`.
- Vùng chạm ≥ 44x44px; chữ ≥ 14px (trừ `caption` 12px chỉ làm tiêu đề cột).

### Ghi chú
- Nút "Thêm danh mục" vẫn dùng được khi danh sách rỗng và lúc đang tải; khi lỗi tải thì ẩn (D-58 đề xuất).
- Trùng tên kiểm tra ở FE chỉ là phản hồi nhanh; race giữa hai tab xử lý bằng 409.
- Không có chức năng khôi phục danh mục đã xóa (D-42); nội dung hộp thoại phải nói rõ "Không thể hoàn tác".
- Danh mục seed (Áo thun, Váy, Quần Jeans) không có dấu hiệu đặc biệt: xóa được như danh mục khác (R4).
- Chưa có ô "loại trang phục" (D-45). Nếu Epic 3 thêm thì chỉ thêm một ô vào hộp thoại này.
