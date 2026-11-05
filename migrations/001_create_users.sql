-- 001_create_users.sql
-- Sprint 01 · US-01 · Task T-10
-- Bảng tài khoản đăng nhập (email/mật khẩu + role). Chỉ backend truy cập bằng service role key (D-02).
-- agent-coder: chép nguyên văn sang migrations/001_create_users.sql.

-- Hàm dùng chung: tự cập nhật updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.users (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null,
  password_hash text        not null,
  role          text        not null default 'user',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint users_email_key            unique (email),
  -- Email luôn lưu dạng đã chuẩn hóa (trim + lowercase) — backend chuẩn hóa trước khi ghi
  constraint users_email_normalized_chk check (email = lower(btrim(email))),
  constraint users_email_length_chk     check (char_length(email) between 3 and 254),
  constraint users_role_chk             check (role in ('user', 'admin')),
  -- Chỉ nhận hash bcrypt chuẩn 60 ký tự ($2a/$2b/$2y$<cost>$...) — chặn lỡ lưu mật khẩu thô
  constraint users_password_hash_chk    check (password_hash ~ '^\$2[aby]\$[0-9]{2}\$.{53}$')
);

comment on table  public.users               is 'Tài khoản đăng nhập. Không chứa dữ liệu nhạy cảm (ảnh, số đo nằm ở profiles).';
comment on column public.users.email         is 'Đã trim + lowercase; unique (US-01 E2, E8).';
comment on column public.users.password_hash is 'bcrypt, cost >= BCRYPT_COST (D-06). Không bao giờ trả về API.';
comment on column public.users.role          is 'user | admin. Admin chỉ tạo bằng seed (D-07).';

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Bảo mật: bật RLS và KHÔNG tạo policy → anon/authenticated (Data API) bị chặn hoàn toàn.
-- service_role (backend) bỏ qua RLS. Revoke thêm để phòng thủ nhiều lớp.
alter table public.users enable row level security;
revoke all on table public.users from anon, authenticated;
grant select, insert, update, delete on table public.users to service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
