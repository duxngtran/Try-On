# Screen Descriptions — Thêm và sửa sản phẩm

> US-04 §4.2, §4.3, §4.5, §5, §6, AC-01 → AC-09, AC-14 · `POST /api/admin/products`, `GET/PATCH /api/admin/products/:id` (multipart) · D-47, D-48, D-49, D-50, D-51, D-52, D-55 · Flows: `design/flows/product-create.md`, `product-update.md`

Hai route dùng **một component form** (`ProductForm`), khác nhau ở dữ liệu ban đầu và các quy tắc nêu rõ bên dưới.

| Route | Chế độ | Tiêu đề `h1` | `document.title` |
|---|---|---|---|
| `/admin/products/new` | Thêm | "Thêm sản phẩm" | "Thêm sản phẩm — Try-on" |
| `/admin/products/:id/edit` | Sửa | "Sửa sản phẩm" | "Sửa sản phẩm — Try-on" |

### Mục đích
Nhập tên, giá, danh mục và một ảnh flat lay cho sản phẩm; sửa bất kỳ trường nào hoặc thay ảnh. Không có size, tồn kho, màu, mô tả, nhiều ảnh, bản nháp (D-52, US-04 §3).

### Quyền truy cập
Admin. Guest → `/login`; user thường → 403.

### Bố cục tổng
1. Link quay lại "← Sản phẩm" (`ArrowLeft`; về `state.from` hoặc `/admin/products`) + `h1`.
2. Form một card (hoặc hai cột ở desktop):
   - **Cột ảnh**: khung ảnh sản phẩm 1:1 + nút chọn/đổi ảnh + thông tin file + hướng dẫn flat lay.
   - **Cột thông tin**: Tên, Giá, Danh mục.
3. Thanh hành động: Alert lỗi chung (nếu có) → progress (khi tải ảnh) → nút **Hủy** + **Lưu**.

### Các thành phần chính

1. **Ô Tên sản phẩm** (TextField)
   - Label "Tên sản phẩm", bắt buộc (chữ "Bắt buộc" trong hint, không chỉ `*`), hint "2 đến 120 ký tự. Được trùng tên sản phẩm khác.", `autocomplete="off"`.
   - Chuẩn hóa NFC + trim + gộp khoảng trắng khi kiểm tra và khi gửi; lỗi "Tên sản phẩm phải từ 2 đến 120 ký tự." (rỗng, ngắn, dài, hoặc có ký tự điều khiển).
   - Trạng thái: default / hover / focus / error / disabled (khi đang lưu hoặc đang tải dữ liệu sửa) / readonly khi đang lưu.

2. **Ô Giá** (MoneyField, design-system 7.11)
   - Label "Giá", hint "Từ 1.000 đến 100.000.000 ₫", adornment "₫" bên phải, `inputmode="numeric"`, `autocomplete="off"`.
   - Nhận: `199000`, `199.000`, `199,000`, `199 000`; nhóm nghìn phải đúng 3 chữ số. **Từ chối**: `199.5`, `1.99`, `1,5`, chữ, số âm, rỗng → lỗi "Giá phải là số nguyên từ 1.000 đến 100.000.000 đồng." (cùng một câu cho mọi lỗi giá, theo US-04 §6.1). Không tự diễn giải.
   - Khi blur và hợp lệ: hiển thị lại `199.000`. Trong lúc gõ không định dạng lại (tránh nhảy con trỏ). Khi gửi: chuỗi chữ số thuần `199000`.
   - Chế độ sửa: điền sẵn `priceVnd` đã định dạng.

3. **Select Danh mục**
   - Label "Danh mục", tùy chọn đầu disabled "Chọn danh mục" (chế độ thêm, mặc định chọn nó; lỗi "Vui lòng chọn danh mục." nếu để trống). Các tùy chọn là danh mục từ `GET /api/admin/categories`, thứ tự cũ → mới.
   - Chế độ thêm: nếu mở từ danh sách đang lọc theo danh mục thì chọn sẵn danh mục đó (`state.categoryId`); ngược lại để trống. Chế độ sửa: chọn sẵn `product.category.id`.
   - **Đang tải danh mục**: Select disabled + spinner 16px, nút Lưu disabled.
   - **Lỗi tải danh mục**: Select disabled + lỗi nội tuyến "Không tải được danh mục." + "Thử lại"; nút Lưu disabled.
   - **Chưa có danh mục (E18)**: thay Select bằng Alert `warning` (icon `AlertTriangle`): "Cần tạo danh mục trước." kèm link "Tạo danh mục" tới `/admin/categories`; nút Lưu disabled. Trang không bị chặn, người dùng vẫn nhập được tên/giá/ảnh (giữ lại nếu quay lại bằng Back).
   - **`CATEGORY_NOT_FOUND`**: lỗi dưới Select "Danh mục không còn tồn tại, vui lòng chọn danh mục khác.", tải lại danh sách danh mục, bỏ chọn (về "Chọn danh mục"), giữ mọi trường khác và ảnh.

4. **Khung ảnh sản phẩm** (dropzone biến thể vuông, 7.5 + 7.11)
   - Là `<button>` mở file picker bọc `<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">`. Desktop có thêm kéo-thả (hover khi kéo: viền `ink`, nền `accent-soft`).
   - Trạng thái:
     | Trạng thái | Hiển thị |
     |---|---|
     | Thêm, chưa chọn | Khung 1:1 nét đứt, icon `ImagePlus` 32px, "Chọn ảnh sản phẩm", "JPG, PNG, WEBP · tối đa 10 MB" |
     | Đã chọn (hợp lệ ở FE) | Xem trước `object-contain`, `alt="Xem trước ảnh sản phẩm"`, dưới khung: tên file cắt `…`, "800 × 800 px · 1,2 MB" (`small`), nút secondary **Chọn ảnh khác** |
     | Sửa, chưa đổi ảnh | Ảnh hiện tại từ `image.url`, `alt` = tên sản phẩm, nút **Thay ảnh** |
     | Sửa, đã chọn ảnh mới | Xem trước ảnh mới, nhãn `caption` "ẢNH MỚI", nút **Chọn ảnh khác** và nút ghost **Giữ ảnh cũ** (bỏ ảnh mới, quay về ảnh hiện tại) |
     | Ảnh hiện tại không tải được (sửa) | Khung `surface-muted` + `ImageOff` + chữ "Không tải được ảnh hiện tại"; vẫn thay ảnh được |
     | Lỗi ảnh | Lỗi dưới khung (icon `AlertCircle`, `role="alert"` sau khi bấm Lưu, `aria-live="polite"` khi vừa chọn); khung chuyển viền `danger` 2px; ảnh xem trước (nếu đọc được) vẫn giữ |
     | Đang lưu | Xem trước mờ 60%, nút ảnh disabled |
   - Kiểm tra sơ bộ ở FE khi chọn file (BE vẫn kiểm tra lại toàn bộ, D-21): loại file theo MIME/đuôi, dung lượng ≤ 10 MB, giải mã ảnh để lấy kích thước (đã xoay theo EXIF), cạnh ngắn ≥ 512, cạnh dài ≤ 8000, dài/ngắn ≤ 3. Không thể kiểm tra magic bytes đầy đủ và không phát hiện flat lay (US-04 §6.2).
   - Chọn ảnh sai thì **không** thay ảnh đang có trong form (giữ ảnh xem trước trước đó nếu có), chỉ hiện lỗi.
   - Không có ảnh khi bấm Lưu (chế độ thêm): lỗi "Vui lòng chọn ảnh sản phẩm."

   Bảng thông báo lỗi ảnh (FE trước, BE sau; cùng một câu):
   | Nguồn | Mã | Thông báo |
   |---|---|---|
   | FE/BE | `FILE_REQUIRED` | "Vui lòng chọn ảnh sản phẩm." |
   | FE/BE | `INVALID_FILE_TYPE` | "Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP." |
   | FE (giải mã lỗi)/BE | `INVALID_IMAGE` | "Không đọc được ảnh, vui lòng chọn ảnh khác." |
   | FE/BE (413) | `FILE_TOO_LARGE` | "Ảnh tối đa 10 MB." |
   | FE/BE | `IMAGE_TOO_LARGE` | "Ảnh quá lớn, cạnh dài tối đa 8000 px." |
   | FE/BE | `IMAGE_TOO_SMALL` | "Ảnh sản phẩm cần tối thiểu 512 × 512 px." |
   | FE/BE | `INVALID_ASPECT_RATIO` | "Ảnh quá dài hoặc quá hẹp, cạnh dài tối đa gấp 3 lần cạnh ngắn." |
   | BE | `UPLOAD_FAILED` | "Tải ảnh thất bại, vui lòng thử lại." (hiển thị ở Alert lỗi chung, không gắn vào khung vì lỗi do hệ thống) |
   Với 413 Express/multer có thể ngắt kết nối trước khi gửi hết body: FE xử lý cả trường hợp nhận 413 và lỗi mạng mơ hồ khi file > 10 MB (đã chặn từ trước ở FE nên hiếm).

5. **Hướng dẫn ảnh flat lay** (checklist 7.10, nằm dưới khung ảnh; mobile thu gọn bằng `<details>` mở sẵn ở chế độ thêm, đóng ở chế độ sửa)
   - Tiêu đề "Ảnh flat lay: cách chụp". Mỗi dòng có icon khác hình, không chỉ màu:
     - `Check` Một sản phẩm, trải phẳng.
     - `X` Không có người mặc hoặc ma-nơ-canh.
     - `Check` Thấy trọn sản phẩm, không bị cắt hay che.
     - `Check` Nền trơn, sáng màu, đủ sáng, màu đúng thật.
     - `X` Không chữ, logo cửa hàng hay watermark chèn trên ảnh.
   - Chỉ để nhắc, không bắt buộc tích và không chặn lưu (cùng tinh thần D-35). Ghi chú nhỏ: "Ảnh được chuyển sang JPEG, tối đa 2048 px, nền trắng nếu có nền trong suốt."

6. **Thanh hành động**
   - **Lưu**: primary `lg` (full-width mobile). Chế độ thêm: enabled khi có danh mục và không đang lưu/chờ rate limit; bấm khi form sai thì hiện lỗi rồi focus ô lỗi đầu tiên (thứ tự thị giác: Tên → Giá → Danh mục → Ảnh) thay vì disabled sớm. Chế độ sửa: **disabled khi không có thay đổi** (so sánh tên đã chuẩn hóa, giá số, danh mục, có ảnh mới) và chỉ gửi trường đã đổi (US-04 §4.3). Loading: spinner, nhãn "Đang lưu…", `aria-busy`.
   - **Hủy**: secondary; về `state.from`/`/admin/products`. Nếu form có thay đổi chưa lưu → hộp thoại rời trang (mục 9).
   - Enter trong ô văn bản = Lưu.

7. **Tiến trình tải ảnh** (chỉ khi request có ảnh: luôn có ở chế độ thêm, chỉ khi có ảnh mới ở chế độ sửa)
   - Progress bar 7.5 `role="progressbar"` "Đang tải lên… 64%" (từ `onUploadProgress`). Khi bytes lên 100% mà chưa có response: "Đang xử lý ảnh…" với bar indeterminate shimmer (BE còn xử lý ảnh bằng sharp, tối đa vài giây). Sửa không đổi ảnh: không có progress, chỉ nút loading.
   - **Không có nút hủy tải** (khác Hồ sơ): thêm/sửa là một request ghi nguyên tử (D-50); hủy giữa chừng không biết server đã ghi hay chưa nên có thể tạo sản phẩm "ma" hoặc trùng. Xem đề xuất D-57.
   - Khi đang lưu: mọi ô readonly/disabled, nút Hủy disabled, link quay lại vẫn bấm được nhưng hiện cảnh báo rời trang (mục 9). `beforeunload` bật.

8. **Alert lỗi chung** (trên thanh hành động, `role="alert"`, icon + chữ):
   | Tình huống | Mã | Hiển thị | Sau đó |
   |---|---|---|---|
   | Hệ thống/DB | 500 `INTERNAL_ERROR` | `danger`: "Tải ảnh thất bại, vui lòng thử lại." nếu request có ảnh; không có ảnh: "Đã có lỗi xảy ra. Vui lòng thử lại sau." | Giữ form và xem trước; Lưu bật lại |
   | Storage | 500 `UPLOAD_FAILED` | `danger`: "Tải ảnh thất bại, vui lòng thử lại." | Như trên; sửa thì sản phẩm giữ nguyên |
   | Mất mạng | — | `danger`: "Mất kết nối, vui lòng thử lại." | Giữ form và ảnh xem trước (E17) |
   | Rate limit | 429 `TOO_MANY_REQUESTS` | `warning` (icon `Clock`): "Bạn thao tác quá nhanh, vui lòng thử lại sau." + đếm ngược "Thử lại sau 12:34" nếu có `details.retryAfterSeconds` (đếm theo giây, định dạng `mm:ss`, từ 1 giờ trở lên `h giờ mm phút`; chỉ thông báo cho trình đọc màn hình lúc bắt đầu và lúc kết thúc) | Lưu disabled tới hết giờ; hết giờ: Alert `info` "Bạn có thể lưu lại." và Lưu bật lại. Nếu thiếu `retryAfterSeconds`: chỉ hiện câu tĩnh, Lưu bật lại sau 10 giây (D-34) |
   | 400 `VALIDATION_ERROR` có `details` | `field` ∈ `name`/`priceVnd`/`categoryId`/`image` | Gán vào ô tương ứng (không dùng Alert chung); `details` không khớp ô nào thì dùng message chung của lỗi | Focus ô lỗi đầu tiên |
   | Sửa không có thay đổi | 400 `VALIDATION_ERROR` | Không thể xảy ra vì Lưu disabled; nếu gặp (sửa ở tab khác) thì Alert `info` "Chưa có thay đổi nào để lưu." | — |
   | Sản phẩm không còn (chế độ sửa) | 404 `NOT_FOUND` | Chuyển (replace) về `/admin/products` kèm toast lỗi "Sản phẩm không còn tồn tại." | Bỏ qua cảnh báo rời trang |
   | Hết phiên | 401 | Toàn cục: `/login` kèm `state.from` là trang hiện tại | Form mất (chấp nhận, D-05) |
   Thứ tự ưu tiên khi nhiều lỗi do BE quyết định (theo US-04 §5); FE chỉ hiển thị mã lỗi đầu tiên nhận được.

9. **Hộp thoại "Rời khỏi trang?"** (`Modal`, focus mặc định ở **Ở lại**)
   - Hiện khi chuyển trang trong ứng dụng (Hủy, "← Sản phẩm", `AdminNav`, nút Back) lúc form có thay đổi chưa lưu hoặc đang lưu. Nội dung "Thông tin chưa lưu sẽ mất." (đang lưu: "Sản phẩm đang được lưu. Rời đi bây giờ có thể không biết kết quả."). Nút **Ở lại** (primary) + **Rời đi** (secondary).
   - Đóng tab/tải lại: `beforeunload` của trình duyệt (chỉ khi có thay đổi chưa lưu hoặc đang lưu).
   - Không hỏi khi vừa lưu thành công (bỏ chặn trước khi điều hướng) hay form chưa động tới. Chế độ thêm "có thay đổi" = có chữ trong Tên/Giá, đã chọn danh mục hoặc ảnh.
   - Cần router dạng data router để chặn điều hướng nội bộ: xem đề xuất D-60.

### Chế độ sửa: tải dữ liệu
| Trạng thái | Hiển thị |
|---|---|
| Đang tải (`GET /api/admin/products/:id`) | Skeleton đúng khung: khung ảnh 1:1, 3 ô input cao 48px, hàng nút; `aria-busy`, `role="status"` ẩn "Đang tải sản phẩm"; Lưu disabled |
| Thành công | Form điền sẵn, focus vào `h1` |
| 404 `NOT_FOUND` (kể cả id sai định dạng, đã xóa) | Về danh sách (replace) + toast lỗi "Sản phẩm không còn tồn tại." |
| Lỗi mạng/500 | Error state thay form: "Không thể tải sản phẩm. Vui lòng kiểm tra mạng và thử lại." + **Thử lại** + link "← Sản phẩm" |
| 401 | Toàn cục |

### Kết quả thành công
- **Thêm** (201): chuyển sang `/admin/products` (không lọc, trang 1, sản phẩm mới đứng đầu) kèm `state.notice` "Đã thêm sản phẩm"; focus vào `h1` danh sách.
- **Sửa** (200): chuyển về `state.from` (giữ lọc và trang) hoặc `/admin/products`, kèm "Đã cập nhật sản phẩm". Ảnh mới có URL mới nên không bị cache ảnh cũ (US-04 §9).
- Thành công mà xóa file ảnh cũ lỗi (E16) vẫn hiện thành công bình thường.

### Responsive
- **Mobile 360px**: một cột, padding 16px, thứ tự: ảnh (khung `max-w-xs` căn giữa, nhưng nút chọn ảnh full-width) → hướng dẫn flat lay (`<details>`) → Tên → Giá → Danh mục → Alert/progress → Lưu (full-width, cao 48px) → Hủy (full-width, bên dưới). Hộp thoại là bottom sheet. Thanh Lưu **không** cố định đáy (tránh che ô khi bàn phím mở); form đủ ngắn để cuộn.
- **Tablet 768px**: card `max-w-2xl`; vẫn một cột nhưng ảnh nằm cạnh hướng dẫn (ảnh `w-60` trái, checklist phải); nút Hủy + Lưu cạnh nhau, căn phải.
- **Desktop 1280px**: hai cột trong vùng nội dung: trái `w-80` (ảnh, thông tin file, hướng dẫn), phải các ô Tên/Giá/Danh mục (`max-w-md`); hàng nút ở cuối cột phải, căn phải. Ô input cao 44px.

### Hiệu ứng
Xem trước ảnh cross-fade 200ms khi đổi ảnh; progress bar tăng bằng `scaleX`; lỗi nội tuyến xuất hiện fade 120ms; toast trượt-lên 200ms. Tất cả tắt/giảm khi `prefers-reduced-motion`.

### Navigation
- Đến từ: `/admin/products` (nút Thêm sản phẩm, Sửa, empty state), liên kết từ `/admin/categories` không có.
- Đi tới: `/admin/products` (sau lưu, Hủy, 404), `/admin/categories` (liên kết E18), `/login` (401).

### Accessibility
- `h1` theo chế độ; mỗi ô có `<label>` hiển thị; lỗi gắn `aria-describedby`, `aria-invalid="true"`; submit lỗi → focus ô lỗi đầu tiên (nếu lỗi ảnh: focus nút chọn ảnh).
- Nút chọn ảnh là `<button>` có `aria-describedby` trỏ tới hint định dạng và lỗi; input file `sr-only` nhưng vẫn thao tác qua nút. Kéo-thả chỉ là phần thêm, bàn phím dùng nút.
- Progress `role="progressbar"` có `aria-valuenow`; chuyển sang "Đang xử lý ảnh…" thì bỏ `aria-valuenow` và dùng `role="status"`.
- Alert lỗi chung `role="alert"`; kết quả thành công qua toast `role="status"` ở trang đích.
- Select là `<select>` gốc; MoneyField có `inputmode="numeric"`, chữ "₫" là adornment `aria-hidden` và đơn vị đã nằm trong hint để trình đọc màn hình nghe được.
- Checklist là `<ul>`; icon `Check`/`X` `aria-hidden`, ý nghĩa nằm ở chữ ("Không có...").
- Vùng chạm ≥ 44px; khoảng cách giữa các nút ≥ 8px; tương phản theo token.

### Ghi chú
- Form có một request duy nhất cho tên, giá, danh mục, ảnh (D-50): không bao giờ có trạng thái lưu một phần, nên mọi lỗi giữ nguyên dữ liệu trên server.
- Sửa cùng lúc: ghi sau đè ghi trước (D-55), không có cảnh báo xung đột; form sửa không cố gắng phát hiện.
- Đổi tên/giá/danh mục không đổi `image.version`; chỉ thay ảnh mới đổi (D-49). FE không hiển thị version.
- Không có nút xóa trên form sửa (xóa chỉ ở danh sách, US-04 §4.4) để giữ phạm vi.
