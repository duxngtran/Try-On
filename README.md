# Try-on

Try-on là web app thương mại điện tử thời trang có tính năng thử đồ ảo (GenAI): người mua chọn danh mục và xem ảnh chính mình mặc sản phẩm, lướt qua lại để xem các sản phẩm tiếp theo. Frontend React + Vite + Tailwind, backend Node.js + Express, dữ liệu và ảnh lưu trên Supabase.

## Yêu cầu

- Node.js 24
- Tài khoản Supabase (Postgres + Storage)

## Cài đặt

```bash
cd backend && npm install
cd ../frontend && npm install
```

Tạo file cấu hình (điền giá trị thật, không commit):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp .mcp.json.example .mcp.json   # tùy chọn, cấu hình MCP (chứa token)
```

### Phòng thử đồ (sprint 03)

Biến `TRYON_*`, `FASHN_*` có trong `backend/.env.example`. **`TRYON_PROVIDER=fake` là mặc định**: không gọi dịch vụ AI thật, không gửi ảnh ra ngoài. Chỉ đặt `fashn` (kèm `FASHN_API_KEY`) khi chủ dự án cho phép; server từ chối khởi động nếu thiếu key, và từ chối `fashn` khi `NODE_ENV=test`. Worker xử lý job chạy trong tiến trình Express (`npm run dev`).

## Lệnh thường dùng

Chạy trong `backend/` hoặc `frontend/`:

| Việc | Lệnh |
|---|---|
| Dev server | `npm run dev` (backend cổng 4000, frontend cổng 5173) |
| Test | `npm test` |
| Lint | `npm run lint` |
| Format | `npm run format` / `npm run format:check` |
| Build | `npm run build` (chỉ frontend) |
| Migrate DB | `npm run migrate` (chỉ backend, cần `DATABASE_URL`) |
| Tạo bucket Storage | `npm run setup:storage` (chỉ backend; 3 bucket: ảnh hồ sơ, ảnh sản phẩm, ảnh thử đồ) |
| Kiểm tra thật phòng thử đồ | `npm run verify:tryon` (chỉ backend, chạy trên Supabase dev bằng adapter giả, tự dọn) |

## Tài liệu

- [PB.md](PB.md): product backlog
- [PROGRESS.md](PROGRESS.md): tiến độ dự án
- [DECISIONS.md](DECISIONS.md): các quyết định nghiệp vụ và thuật toán
- [sprint-01/](sprint-01/): tài liệu sprint hiện tại
- [CLAUDE.md](CLAUDE.md): quy trình phát triển và lệnh chi tiết
