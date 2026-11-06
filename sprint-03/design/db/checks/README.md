# Kiểm tra SQL cục bộ

Hai script đã dùng để thử `005`, `006` ở bước 3. Kết quả ở [`../README.md`](../README.md#10-đã-kiểm-tra-những-gì). Không đụng Supabase, không phải test của dự án (T-75 chuyển các kịch bản sang `npm run verify:tryon`).

Chạy ở một thư mục **ngoài repo**, vì các gói này không nằm trong `package.json`:

```bash
mkdir /tmp/pgtest && cd /tmp/pgtest && npm init -y && npm pkg set type=module
npm i @electric-sql/pglite embedded-postgres pg
cp <repo>/sprint-03/design/db/checks/*.mjs .
node pglite-test.mjs "<repo>"
node concurrency-test.mjs "<repo>"
```

| Script | Môi trường | Kiểm gì |
|---|---|---|
| `pglite-test.mjs` | PGlite, một kết nối | Hành vi tuần tự của từng hàm, quyền theo role |
| `concurrency-test.mjs` | PostgreSQL thật, cổng 55432, dữ liệu trong thư mục tạm | Đua giữa các transaction, deadlock, sổ ngân sách |
