-- 003_create_categories.sql
-- Sprint 02 · US-03 · Task T-35
-- Danh mục sản phẩm. Xóa mềm bằng deleted_at; tên không trùng trong các danh mục còn hiệu lực.
-- agent-coder: chép nguyên văn sang migrations/003_create_categories.sql.

create table public.categories (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  -- Backend chuẩn hóa tên (NFC, trim, gộp khoảng trắng) trước khi ghi
  constraint categories_name_trimmed_chk check (name = btrim(name)),
  constraint categories_name_length_chk  check (char_length(name) between 2 and 50)
);

comment on table  public.categories            is 'Danh mục sản phẩm (US-03). Mọi truy vấn nghiệp vụ phải lọc deleted_at is null.';
comment on column public.categories.deleted_at is 'Xóa mềm. Không có chức năng khôi phục; sản phẩm đã xóa mềm vẫn trỏ về dòng này.';

-- Không phân biệt hoa thường; danh mục đã xóa không giữ chỗ tên.
-- Đã kiểm tra lower() xử lý đúng tiếng Việt trên Supabase dev (en_US.UTF-8, PG 17).
create unique index categories_name_active_key
  on public.categories (lower(name))
  where deleted_at is null;

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- Seed 3 danh mục trong PB. Chỉ chạy một lần cùng migration; admin xóa đi sẽ không tự xuất hiện lại.
-- created_at lệch nhau để thứ tự hiển thị (created_at tăng dần) đúng như PB.
insert into public.categories (name, created_at, updated_at) values
  ('Áo thun',    now(),                     now()),
  ('Váy',        now() + interval '1 second', now()),
  ('Quần Jeans', now() + interval '2 second', now());

-- Bảo mật: giống users/profiles (D-27)
alter table public.categories enable row level security;
revoke all on table public.categories from anon, authenticated;
grant select, insert, update, delete on table public.categories to service_role;
