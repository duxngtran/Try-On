-- 004_create_products.sql
-- Sprint 02 · US-03, US-04 · Task T-35
-- Bảng sản phẩm + các hàm cần tính nguyên tử (supabase-js không có transaction).
-- Hàm của danh mục nằm ở đây vì phải đọc bảng products.
-- agent-coder: chép nguyên văn sang migrations/004_create_products.sql.

create table public.products (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  price_vnd     integer     not null,
  category_id   uuid        not null references public.categories (id) on delete restrict,
  image_path    text        not null,
  image_version integer     not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint products_name_trimmed_chk  check (name = btrim(name)),
  constraint products_name_length_chk   check (char_length(name) between 2 and 120),
  constraint products_price_chk         check (price_vnd between 1000 and 100000000),
  -- Đường dẫn do server sinh: <product_id>/<uuid>.jpg
  constraint products_image_path_chk    check (
    image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and left(image_path, 37) = id::text || '/'
  ),
  constraint products_image_version_chk check (image_version >= 1)
);

comment on table  public.products               is 'Sản phẩm (US-04). Mọi truy vấn nghiệp vụ phải lọc deleted_at is null.';
comment on column public.products.price_vnd     is 'Giá hiện tại, đơn vị đồng, số nguyên. Đơn hàng Epic 4 phải lưu bản sao giá lúc đặt.';
comment on column public.products.image_path    is 'Object name trong bucket public product-images. API trả URL, không trả đường dẫn này.';
comment on column public.products.image_version is 'Tăng khi đổi ảnh; Epic 3 dùng làm một phần khóa cache try-on (tương tự D-24).';
comment on column public.products.deleted_at    is 'Xóa mềm: giữ dòng và file ảnh cho giỏ hàng, đơn hàng, cache try-on ở sprint sau.';

-- Danh sách admin: mới nhất trước, có thể lọc theo danh mục
create index products_active_created_idx
  on public.products (created_at desc, id desc)
  where deleted_at is null;

create index products_active_category_created_idx
  on public.products (category_id, created_at desc, id desc)
  where deleted_at is null;

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Danh sách danh mục còn hiệu lực kèm số sản phẩm còn hiệu lực.
create or replace function public.list_categories_with_counts()
returns table (
  id            uuid,
  name          text,
  created_at    timestamptz,
  updated_at    timestamptz,
  product_count integer
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, c.created_at, c.updated_at,
         (select count(*)::integer
            from public.products p
           where p.category_id = c.id and p.deleted_at is null)
    from public.categories c
   where c.deleted_at is null
   order by c.created_at asc, c.id asc;
$$;

-- Xóa mềm danh mục. Khóa dòng danh mục rồi mới đếm sản phẩm,
-- nên không thể lọt sản phẩm mới vào danh mục đang bị xóa.
-- out_status: 'ok' | 'not_found' | 'has_products'
create or replace function public.soft_delete_category(p_id uuid)
returns table (out_status text, out_product_count integer)
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform 1 from public.categories c
    where c.id = p_id and c.deleted_at is null
    for update;
  if not found then
    return query select 'not_found'::text, 0;
    return;
  end if;

  select count(*)::integer into v_count
    from public.products p
   where p.category_id = p_id and p.deleted_at is null;

  if v_count > 0 then
    return query select 'has_products'::text, v_count;
    return;
  end if;

  update public.categories c set deleted_at = now() where c.id = p_id;
  return query select 'ok'::text, 0;
end;
$$;

-- Tạo sản phẩm. FOR SHARE giữ danh mục không bị xóa mềm cho tới khi transaction kết thúc.
-- p_id do backend sinh vì đường dẫn ảnh chứa id và ảnh được tải lên trước.
-- out_status: 'ok' | 'category_not_found'
create or replace function public.create_product(
  p_id          uuid,
  p_name        text,
  p_price_vnd   integer,
  p_category_id uuid,
  p_image_path  text
)
returns table (out_status text)
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.categories c
    where c.id = p_category_id and c.deleted_at is null
    for share;
  if not found then
    return query select 'category_not_found'::text;
    return;
  end if;

  insert into public.products (id, name, price_vnd, category_id, image_path)
  values (p_id, p_name, p_price_vnd, p_category_id, p_image_path);

  return query select 'ok'::text;
end;
$$;

-- Sửa sản phẩm nguyên tử. Tham số null = giữ nguyên giá trị cũ.
-- Trả đường dẫn ảnh cũ để backend xóa file sau khi ghi DB thành công (giống D-25).
-- out_status: 'ok' | 'not_found' | 'category_not_found'
create or replace function public.update_product(
  p_id             uuid,
  p_name           text,
  p_price_vnd      integer,
  p_category_id    uuid,
  p_new_image_path text
)
returns table (out_status text, out_old_image_path text)
language plpgsql
set search_path = ''
as $$
declare
  v_old_path text;
  v_category uuid;
begin
  select p.image_path, p.category_id into v_old_path, v_category
    from public.products p
   where p.id = p_id and p.deleted_at is null
   for update;
  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  if p_category_id is not null and p_category_id <> v_category then
    perform 1 from public.categories c
      where c.id = p_category_id and c.deleted_at is null
      for share;
    if not found then
      return query select 'category_not_found'::text, null::text;
      return;
    end if;
  end if;

  update public.products p
     set name          = coalesce(p_name, p.name),
         price_vnd     = coalesce(p_price_vnd, p.price_vnd),
         category_id   = coalesce(p_category_id, p.category_id),
         image_path    = coalesce(p_new_image_path, p.image_path),
         image_version = p.image_version + (case when p_new_image_path is null then 0 else 1 end)
   where p.id = p_id;

  return query select 'ok'::text,
    case when p_new_image_path is null then null::text else v_old_path end;
end;
$$;

comment on function public.soft_delete_category(uuid) is 'Chỉ backend (service_role) gọi qua rpc. Xem flows/category-delete.md.';
comment on function public.create_product(uuid, text, integer, uuid, text) is 'Chỉ backend (service_role) gọi qua rpc. Xem flows/product-create.md.';
comment on function public.update_product(uuid, text, integer, uuid, text) is 'Chỉ backend (service_role) gọi qua rpc. Xem flows/product-update.md.';

-- Bảo mật: giống users/profiles (D-27)
alter table public.products enable row level security;
revoke all on table public.products from anon, authenticated;
grant select, insert, update, delete on table public.products to service_role;

revoke execute on function public.list_categories_with_counts()                   from public, anon, authenticated;
revoke execute on function public.soft_delete_category(uuid)                      from public, anon, authenticated;
revoke execute on function public.create_product(uuid, text, integer, uuid, text) from public, anon, authenticated;
revoke execute on function public.update_product(uuid, text, integer, uuid, text) from public, anon, authenticated;
grant  execute on function public.list_categories_with_counts()                   to service_role;
grant  execute on function public.soft_delete_category(uuid)                      to service_role;
grant  execute on function public.create_product(uuid, text, integer, uuid, text) to service_role;
grant  execute on function public.update_product(uuid, text, integer, uuid, text) to service_role;
