# Luồng: Lưu chiều cao / cân nặng

> US-02 §5.3, §7.2, AC-07, AC-08 · `PUT /api/profile/measurements` · D-13

```mermaid
flowchart TD
  U([User nhập chiều cao, cân nặng, bấm Lưu thông tin]) --> F1["Parse: trim, ',' → '.'<br/>Number(); rỗng/chữ/NaN → lỗi"]
  F1 --> F2{"zod: height int 100–250<br/>weight 30–250, ≤1 chữ số thập phân"}
  F2 -- Lỗi --> F2a[Lỗi dưới ô, không gửi]
  F2 -- OK --> F3["Khóa nút, PUT {heightCm, weightKg} (number)"]
  F3 --> B1[[auth + requireRole user]]
  B1 --> B2{"zod strict kiểu number<br/>(string '165' → lỗi), strip trường thừa"}
  B2 -- Lỗi --> B2a["400 VALIDATION_ERROR + details<br/>dữ liệu cũ không đổi"]
  B2 -- OK --> B3[("UPDATE profiles SET height_cm, weight_kg<br/>WHERE user_id = req.user.id<br/>(CHECK ở DB là chốt chặn cuối)")]
  B3 -- "Lỗi CHECK 23514" --> B2a
  B3 -- Lỗi khác --> B3a[500 INTERNAL_ERROR]
  B3 -- OK --> B4["Đọc lại hồ sơ như profile-get.md<br/>(kèm signed URL nếu có ảnh)"]
  B4 --> B5["200 {profile}"]
  B5 --> F4["'Đã lưu thông tin'<br/>cập nhật profileCompleted trong AuthProvider"]
  B2a --> F5[Map details → lỗi từng ô]
  B3a --> F6[Lỗi chung, giữ giá trị đã nhập]
```

## Ghi chú
- Kiểm tra "≤ 1 chữ số thập phân": `Number.isInteger(Math.round(w * 10 * 1e6) / 1e6)` hoặc so `Math.abs(w*10 - Math.round(w*10)) < 1e-9` — **không** dùng `toFixed`. `52.5` ✓, `52.55` ✗ (AC-08).
- Lưu độc lập với ảnh; luôn gửi cả 2 trường (không cho cập nhật một nửa — DB có CHECK "cả hai cùng null hoặc cùng có").
- Không log body của request này (pino `redact`: `req.body.heightCm`, `req.body.weightKg`).
