-- 007_create_cart.sql
-- Sprint 04 · US-07, US-08 · Task T-99
-- Giỏ hàng lưu ở server, mỗi user một giỏ. Mọi thao tác ghi giỏ nối tiếp nhau theo từng user bằng khóa dòng users,
-- để đặt hàng (008) không bỏ sót hay đánh mất dòng được thêm cùng lúc.
-- agent-coder: chép nguyên văn sang migrations/007_create_cart.sql.

create table public.cart_items (
  user_id         uuid        not null references public.users (id)    on delete cascade,
  product_id      uuid        not null references public.products (id) on delete cascade,
  quantity        integer     not null,
  added_price_vnd integer     not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (user_id, product_id),
  -- Giới hạn nghiệp vụ truyền từ env vào hàm; đây chỉ là chốt chặn dữ liệu sai.
  constraint cart_items_quantity_chk check (quantity between 1 and 999),
  constraint cart_items_added_price_chk check (added_price_vnd > 0)
);

comment on table  public.cart_items                 is 'Giỏ hàng (US-07, US-08). Không có size, màu, tồn kho (D-52): mỗi sản phẩm tối đa một dòng.';
comment on column public.cart_items.added_price_vnd is 'Giá lúc bấm thêm gần nhất. CHỈ để báo giá đã đổi, KHÔNG BAO GIỜ dùng để tính tiền.';

-- FK cascade theo sản phẩm; (user_id, product_id) đã có ở khóa chính.
create index cart_items_product_idx on public.cart_items (product_id);

create trigger trg_cart_items_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

-- Ảnh chụp giỏ của một user trong một lệnh SQL. Giá lấy từ products, không lấy từ cart_items.
-- out_fingerprint đổi khi đổi dòng, số lượng, giá, tên, trạng thái còn bán. Giỏ rỗng: null.
-- out_total_vnd không tính dòng đã ngừng bán. out_item_count tính mọi dòng, để số trên header dẫn người mua vào xử lý.
create or replace function public.get_cart(p_user_id uuid)
returns table (
  out_fingerprint     text,
  out_total_vnd       bigint,
  out_item_count      integer,
  out_line_count      integer,
  out_has_unavailable boolean,
  out_items           jsonb
)
language sql
stable
set search_path = ''
as $$
  with lines as (
    select c.product_id,
           c.quantity,
           c.added_price_vnd,
           c.created_at,
           p.name,
           p.price_vnd,
           p.image_path,
           p.image_version,
           (p.deleted_at is null) as available,
           cat.id   as category_id,
           cat.name as category_name
      from public.cart_items c
      join public.products   p   on p.id = c.product_id
      join public.categories cat on cat.id = p.category_id
     where c.user_id = p_user_id
  )
  select
    case when count(*) = 0 then null else
      md5((jsonb_agg(jsonb_build_array(l.product_id, l.quantity, l.price_vnd, l.name, l.available)
                     order by l.product_id))::text)
    end,
    coalesce(sum(case when l.available then l.price_vnd::bigint * l.quantity else 0 end), 0)::bigint,
    coalesce(sum(l.quantity), 0)::integer,
    count(*)::integer,
    coalesce(bool_or(not l.available), false),
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',      l.product_id,
      'quantity',        l.quantity,
      'added_price_vnd', l.added_price_vnd,
      'price_vnd',       l.price_vnd,
      'name',            l.name,
      'image_path',      l.image_path,
      'image_version',   l.image_version,
      'available',       l.available,
      'category_id',     l.category_id,
      'category_name',   l.category_name,
      'line_total_vnd',  case when l.available then l.price_vnd::bigint * l.quantity else 0 end
    ) order by l.created_at desc, l.product_id), '[]'::jsonb)
  from lines l;
$$;

-- Thêm vào giỏ: chưa có thì tạo dòng số lượng 1, có rồi thì +1. Không chạm bảng tryon_*: không gọi GenAI, không tốn lượt.
-- Thêm lại cập nhật added_price_vnd: người mua vừa thấy giá hiện tại trên màn hình.
-- out_status: 'ok' | 'user_not_found' | 'not_found' | 'quantity_limit' | 'cart_full'
create or replace function public.add_cart_item(
  p_user_id      uuid,
  p_product_id   uuid,
  p_max_quantity integer,
  p_max_lines    integer
)
returns table (out_status text, out_quantity integer)
language plpgsql
set search_path = ''
as $$
declare
  v_price    integer;
  v_quantity integer;
  v_lines    integer;
begin
  -- FOR NO KEY UPDATE: nối tiếp thao tác giỏ của user, không chặn FK của tryon_jobs, cart_items, orders (FOR KEY SHARE).
  perform 1 from public.users u where u.id = p_user_id for no key update;
  if not found then
    return query select 'user_not_found'::text, 0;
    return;
  end if;

  select p.price_vnd into v_price
    from public.products p
   where p.id = p_product_id and p.deleted_at is null;
  if not found then
    return query select 'not_found'::text, 0;
    return;
  end if;

  select c.quantity into v_quantity
    from public.cart_items c
   where c.user_id = p_user_id and c.product_id = p_product_id;

  if found then
    if v_quantity >= p_max_quantity then
      return query select 'quantity_limit'::text, v_quantity;
      return;
    end if;
    update public.cart_items c
       set quantity = c.quantity + 1, added_price_vnd = v_price
     where c.user_id = p_user_id and c.product_id = p_product_id
    returning c.quantity into v_quantity;
    return query select 'ok'::text, v_quantity;
    return;
  end if;

  select count(*)::integer into v_lines from public.cart_items c where c.user_id = p_user_id;
  if v_lines >= p_max_lines then
    return query select 'cart_full'::text, 0;
    return;
  end if;

  insert into public.cart_items (user_id, product_id, quantity, added_price_vnd)
  values (p_user_id, p_product_id, 1, v_price);
  return query select 'ok'::text, 1;
end;
$$;

-- Đặt số lượng tuyệt đối: gửi lại không cộng dồn, hai tab thì ghi sau đè ghi trước.
-- out_status: 'ok' | 'user_not_found' | 'not_in_cart' | 'unavailable' | 'quantity_limit'
create or replace function public.set_cart_item_quantity(
  p_user_id      uuid,
  p_product_id   uuid,
  p_quantity     integer,
  p_max_quantity integer
)
returns table (out_status text)
language plpgsql
set search_path = ''
as $$
declare
  v_available boolean;
begin
  perform 1 from public.users u where u.id = p_user_id for no key update;
  if not found then
    return query select 'user_not_found'::text;
    return;
  end if;

  if p_quantity < 1 or p_quantity > p_max_quantity then
    return query select 'quantity_limit'::text;
    return;
  end if;

  select (p.deleted_at is null) into v_available
    from public.cart_items c
    join public.products p on p.id = c.product_id
   where c.user_id = p_user_id and c.product_id = p_product_id;
  if not found then
    return query select 'not_in_cart'::text;
    return;
  end if;
  if not v_available then
    return query select 'unavailable'::text;
    return;
  end if;

  update public.cart_items c
     set quantity = p_quantity
   where c.user_id = p_user_id and c.product_id = p_product_id;
  return query select 'ok'::text;
end;
$$;

-- Bỏ khỏi giỏ. Idempotent: dòng đã mất (tab khác vừa xóa, vừa đặt hàng) vẫn là 'ok'. Xóa được cả dòng đã ngừng bán.
-- out_status: 'ok' | 'user_not_found'
create or replace function public.remove_cart_item(p_user_id uuid, p_product_id uuid)
returns table (out_status text)
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.users u where u.id = p_user_id for no key update;
  if not found then
    return query select 'user_not_found'::text;
    return;
  end if;

  delete from public.cart_items c
   where c.user_id = p_user_id and c.product_id = p_product_id;
  return query select 'ok'::text;
end;
$$;

comment on function public.get_cart(uuid) is 'Chỉ backend (service_role) gọi qua rpc. Xem flows/cart-view.md.';
comment on function public.add_cart_item(uuid, uuid, integer, integer) is 'Chỉ backend (service_role) gọi qua rpc. Xem flows/cart-add.md.';
comment on function public.set_cart_item_quantity(uuid, uuid, integer, integer) is 'Chỉ backend (service_role) gọi qua rpc. Xem flows/cart-view.md.';
comment on function public.remove_cart_item(uuid, uuid) is 'Chỉ backend (service_role) gọi qua rpc. Xem flows/cart-view.md.';

-- Bảo mật: giống D-27
alter table public.cart_items enable row level security;
revoke all on table public.cart_items from anon, authenticated;
grant select, insert, update, delete on table public.cart_items to service_role;

revoke execute on function public.get_cart(uuid)                                  from public, anon, authenticated;
revoke execute on function public.add_cart_item(uuid, uuid, integer, integer)     from public, anon, authenticated;
revoke execute on function public.set_cart_item_quantity(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.remove_cart_item(uuid, uuid)                    from public, anon, authenticated;
grant  execute on function public.get_cart(uuid)                                  to service_role;
grant  execute on function public.add_cart_item(uuid, uuid, integer, integer)     to service_role;
grant  execute on function public.set_cart_item_quantity(uuid, uuid, integer, integer) to service_role;
grant  execute on function public.remove_cart_item(uuid, uuid)                    to service_role;
