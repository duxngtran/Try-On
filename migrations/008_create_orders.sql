-- 008_create_orders.sql
-- Sprint 04 · US-08, US-09 · Task T-110
-- Đơn hàng là bản chụp tại lúc đặt và chỉ thêm, không sửa: service_role chỉ có SELECT, INSERT trên hai bảng này.
-- Không có trạng thái, không có thanh toán (đề xuất D-138).
-- agent-coder: chép nguyên văn sang migrations/008_create_orders.sql.

create table public.orders (
  id               uuid        primary key default gen_random_uuid(),
  order_no         bigint      generated always as identity,
  user_id          uuid        not null references public.users (id) on delete restrict,
  idempotency_key  uuid        not null,
  total_vnd        bigint      not null,
  item_count       integer     not null,
  recipient_name   text        not null,
  recipient_phone  text        not null,
  shipping_address text        not null,
  created_at       timestamptz not null default now(),

  constraint orders_order_no_key             unique (order_no),
  constraint orders_user_idempotency_key     unique (user_id, idempotency_key),
  constraint orders_total_chk                check (total_vnd > 0),
  constraint orders_item_count_chk           check (item_count >= 1),
  constraint orders_recipient_name_chk       check (recipient_name = btrim(recipient_name) and char_length(recipient_name) between 2 and 100),
  -- Backend chuẩn hóa trước khi ghi: bỏ khoảng trắng, dấu chấm, gạch; +84 thành 0.
  constraint orders_recipient_phone_chk      check (recipient_phone ~ '^0[0-9]{9}$'),
  constraint orders_shipping_address_chk     check (shipping_address = btrim(shipping_address) and char_length(shipping_address) between 10 and 300)
);

comment on table  public.orders                  is 'Đơn hàng (US-08, US-09). Chỉ thêm, không sửa, không xóa. Chứa dữ liệu cá nhân: không ghi log.';
comment on column public.orders.order_no         is 'Số đơn cho người đọc; FE hiển thị DH + 6 chữ số. Có thể có khoảng trống.';
comment on column public.orders.idempotency_key  is 'Do client sinh cho mỗi lần mở form đặt hàng. Gửi lại cùng khóa trả đúng đơn cũ.';
comment on column public.orders.total_vnd        is 'Backend tính từ giá trong products lúc đặt. Client không gửi tổng tiền.';

-- Danh sách admin mới nhất trước (D-44); danh sách của người mua.
create index orders_created_idx      on public.orders (created_at desc, id desc);
create index orders_user_created_idx on public.orders (user_id, created_at desc, id desc);

create table public.order_items (
  order_id       uuid    not null references public.orders (id)   on delete restrict,
  line_no        integer not null,
  product_id     uuid    not null references public.products (id) on delete restrict,
  product_name   text    not null,
  unit_price_vnd integer not null,
  quantity       integer not null,
  line_total_vnd bigint  generated always as (unit_price_vnd::bigint * quantity) stored,

  primary key (order_id, line_no),
  constraint order_items_order_product_key unique (order_id, product_id),
  constraint order_items_line_no_chk       check (line_no >= 1),
  constraint order_items_price_chk         check (unit_price_vnd > 0),
  constraint order_items_quantity_chk      check (quantity >= 1)
);

comment on table  public.order_items                is 'Bản chụp từng dòng. Đổi giá, đổi tên, xóa mềm sản phẩm không ảnh hưởng (US-04 R8).';
comment on column public.order_items.product_id     is 'Chỉ để lấy ảnh trải phẳng hiện tại (D-42 giữ file). Tên và giá đọc từ bản chụp, không đọc từ products.';
comment on column public.order_items.product_name   is 'Bản chụp tên lúc đặt.';
comment on column public.order_items.unit_price_vnd is 'Bản chụp giá lúc đặt.';

-- FK restrict theo sản phẩm.
create index order_items_product_idx on public.order_items (product_id);

-- Đặt hàng, một transaction. Thứ tự khóa: users -> products -> orders, cart_items.
-- p_fingerprint là out_fingerprint của get_cart mà người mua đã xem. Lệch nghĩa là họ chưa thấy giỏ hiện tại.
-- out_status: 'ok' | 'replayed' | 'user_not_found' | 'cart_empty' | 'cart_has_unavailable' | 'cart_changed'
create or replace function public.place_order(
  p_user_id          uuid,
  p_idempotency_key  uuid,
  p_fingerprint      text,
  p_recipient_name   text,
  p_recipient_phone  text,
  p_shipping_address text
)
returns table (out_status text, out_order_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_order_id    uuid;
  v_fingerprint text;
  v_total       bigint;
  v_item_count  integer;
  v_line_count  integer;
  v_unavailable boolean;
begin
  -- Nối tiếp với mọi thao tác giỏ và mọi lần đặt hàng của user này.
  perform 1 from public.users u where u.id = p_user_id for no key update;
  if not found then
    return query select 'user_not_found'::text, null::uuid;
    return;
  end if;

  -- Gửi lại sau timeout: trả đơn cũ, kể cả khi giỏ đã có món mới.
  select o.id into v_order_id
    from public.orders o
   where o.user_id = p_user_id and o.idempotency_key = p_idempotency_key;
  if found then
    return query select 'replayed'::text, v_order_id;
    return;
  end if;

  -- FOR SHARE chặn update_product và xóa mềm tới hết transaction, nên giá và tên đọc ở lệnh dưới là giá và tên được ghi.
  -- Theo thứ tự id để hai đơn cùng sản phẩm và admin sửa không đan chéo.
  perform 1
    from public.products p
   where p.id in (select c.product_id from public.cart_items c where c.user_id = p_user_id)
   order by p.id
     for share;

  select g.out_fingerprint, g.out_total_vnd, g.out_item_count, g.out_line_count, g.out_has_unavailable
    into v_fingerprint, v_total, v_item_count, v_line_count, v_unavailable
    from public.get_cart(p_user_id) g;

  if v_line_count = 0 then
    return query select 'cart_empty'::text, null::uuid;
    return;
  end if;
  if v_unavailable then
    return query select 'cart_has_unavailable'::text, null::uuid;
    return;
  end if;
  if p_fingerprint is null or p_fingerprint <> v_fingerprint then
    return query select 'cart_changed'::text, null::uuid;
    return;
  end if;

  insert into public.orders (user_id, idempotency_key, total_vnd, item_count, recipient_name, recipient_phone, shipping_address)
  values (p_user_id, p_idempotency_key, v_total, v_item_count, p_recipient_name, p_recipient_phone, p_shipping_address)
  returning id into v_order_id;

  insert into public.order_items (order_id, line_no, product_id, product_name, unit_price_vnd, quantity)
  select v_order_id,
         row_number() over (order by c.created_at desc, c.product_id),
         c.product_id,
         p.name,
         p.price_vnd,
         c.quantity
    from public.cart_items c
    join public.products p on p.id = c.product_id
   where c.user_id = p_user_id;

  delete from public.cart_items c where c.user_id = p_user_id;

  return query select 'ok'::text, v_order_id;
end;
$$;

comment on function public.place_order(uuid, uuid, text, text, text, text) is 'Chỉ backend (service_role) gọi qua rpc. Xem flows/order-place.md.';

-- Bảo mật: giống D-27, thêm chỉ SELECT + INSERT để bản chụp không bị sửa từ backend.
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
revoke all on table public.orders      from anon, authenticated, service_role;
revoke all on table public.order_items from anon, authenticated, service_role;
grant select, insert on table public.orders      to service_role;
grant select, insert on table public.order_items to service_role;
revoke all on sequence public.orders_order_no_seq from anon, authenticated;

revoke execute on function public.place_order(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.place_order(uuid, uuid, text, text, text, text) to service_role;
