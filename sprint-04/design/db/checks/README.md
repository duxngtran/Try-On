# Kiểm tra SQL cục bộ

Hai script đã dùng để thử `007`, `008` ở bước 3. Kết quả ở [`../README.md`](../README.md#9-đã-kiểm-tra-những-gì). Không đụng Supabase, không phải test của dự án (T-114 chuyển các kịch bản sang `npm run verify:orders`).

Chạy ở một thư mục **ngoài repo**, vì các gói này không nằm trong `package.json`. `service_role` được tạo với `bypassrls` như trên Supabase.

```bash
mkdir /tmp/pgtest && cd /tmp/pgtest && npm init -y && npm pkg set type=module
npm i @electric-sql/pglite embedded-postgres pg
cp <repo>/sprint-04/design/db/checks/*.mjs .
node pglite-test.mjs "<repo>"
node concurrency-test.mjs "<repo>"
```

Muốn chạy trên PostgreSQL 17 như Supabase: cài `embedded-postgres@17.11.0-beta.19` ở một thư mục khác, chỉ cần `concurrency-test.mjs`.

| Script | Môi trường | Kiểm gì |
|---|---|---|
| `pglite-test.mjs` | PGlite, một kết nối | Hành vi tuần tự của từng hàm, ràng buộc, quyền theo role |
| `concurrency-test.mjs` | PostgreSQL thật, cổng 55433, dữ liệu trong thư mục tạm | Đua giữa các transaction, xen kẽ tất định, deadlock, tải hỗn hợp |

Số lần mỗi bên thắng ở phép C → F thay đổi giữa các lần chạy. Không đạt yêu cầu chỉ khi có `FAIL`.
