-- 006_create_tryon.sql
-- Sprint 03 · US-05, US-06 · Task T-62
-- Cache ảnh try-on, job bất đồng bộ, ngân sách, hàng đợi xóa file.
-- Lý do thiết kế: sprint-03/design/db/README.md. Thứ tự khóa: profile -> product -> job -> budget.
-- agent-coder: chép nguyên văn sang migrations/006_create_tryon.sql.

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------

create table public.tryon_images (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.users (id) on delete cascade,
  product_id     uuid        not null references public.products (id) on delete cascade,
  photo_version  integer     not null,
  image_version  integer     not null,
  storage_path   text        not null,
  width          integer     not null,
  height         integer     not null,
  model_name     text        not null,
  created_at     timestamptz not null default now(),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz not null default now(),

  -- Khóa cache D-49
  constraint tryon_images_cache_key unique (user_id, photo_version, product_id, image_version),
  constraint tryon_images_path_key  unique (storage_path),
  -- Đường dẫn do server sinh: <user_id>/<uuid>.jpg (D-78)
  constraint tryon_images_path_chk  check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and left(storage_path, 37) = user_id::text || '/'
  ),
  constraint tryon_images_size_chk  check (width > 0 and height > 0)
);

comment on table  public.tryon_images                is 'Ảnh try-on đã sinh. Dữ liệu nhạy cảm (D-03, D-78). Xóa dòng thì trigger tự đưa file vào tryon_file_deletions.';
comment on column public.tryon_images.storage_path   is 'Object name trong bucket private tryon-images. Không trả về API, không log.';
comment on column public.tryon_images.model_name     is 'Model đã sinh ảnh. Không thuộc khóa cache (D-89); chỉ để xóa có chọn lọc khi đổi model.';
comment on column public.tryon_images.first_viewed_at is 'Null = chưa ai xem. Dùng đo tỉ lệ ảnh generate trước được xem (US-06 mục 9).';
comment on column public.tryon_images.last_viewed_at is 'Mốc tính 90 ngày không được xem (D-81).';

create table public.tryon_jobs (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references public.users (id) on delete cascade,
  product_id          uuid        not null references public.products (id) on delete cascade,
  photo_version       integer     not null,
  image_version       integer     not null,
  consent_generation  integer     not null,
  purpose             text        not null,
  status              text        not null default 'queued',
  error_code          text,
  provider            text        not null,
  model_name          text        not null,
  provider_job_id     text,
  attempts            smallint    not null default 0,
  cost_micro_usd      integer     not null,
  budget_month        date        not null,
  next_run_at         timestamptz not null default now(),
  deadline_at         timestamptz not null,
  last_seen_at        timestamptz not null default now(),
  submitted_at        timestamptz,
  pending_result_path text,
  charged_at          timestamptz,
  cost_incurred       boolean     not null default false,
  finished_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint tryon_jobs_purpose_chk  check (purpose in ('display', 'prefetch')),
  constraint tryon_jobs_status_chk   check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled', 'discarded')),
  constraint tryon_jobs_error_chk    check (
    error_code is null
    or error_code in ('TRYON_FAILED', 'TRYON_TIMEOUT', 'TRYON_BLOCKED', 'TRYON_PHOTO_UNUSABLE', 'TRYON_UNAVAILABLE')
  ),
  constraint tryon_jobs_failed_chk   check ((status = 'failed') = (error_code is not null)),
  constraint tryon_jobs_finished_chk check ((status in ('queued', 'running')) = (finished_at is null)),
  -- Lượt chỉ tính khi dịch vụ sinh thành công, gồm cả kết quả bị bỏ (US-05 R11)
  constraint tryon_jobs_charged_chk  check (charged_at is null or status in ('succeeded', 'discarded')),
  constraint tryon_jobs_attempts_chk check (attempts >= 0),
  constraint tryon_jobs_cost_chk     check (cost_micro_usd > 0)
);

comment on table  public.tryon_jobs                     is 'Job sinh ảnh (D-75). Worker trong backend xử lý; trạng thái nằm ở DB nên khởi động lại không mất job.';
comment on column public.tryon_jobs.purpose             is 'display | prefetch (D-90: display ưu tiên hơn).';
comment on column public.tryon_jobs.provider_job_id     is 'Id phía nhà cung cấp. Cần khi yêu cầu FASHN xóa bản ghi request (chỉ làm được qua email).';
comment on column public.tryon_jobs.next_run_at         is 'queued: lúc được nhận. running: lúc poll tiếp hoặc hạn lease của bước gửi.';
comment on column public.tryon_jobs.last_seen_at        is 'Lần cuối client theo dõi. Job queued không còn ai theo dõi bị hủy (US-06 R4b).';
comment on column public.tryon_jobs.pending_result_path is 'Ghi trước khi upload, để chết giữa chừng vẫn biết file nào cần xóa.';
comment on column public.tryon_jobs.charged_at          is 'Mốc tính lượt ngày/tháng theo giờ Việt Nam.';
comment on column public.tryon_jobs.cost_incurred       is 'Đã, hoặc có thể đã, mất tiền ở nhà cung cấp. Ngân sách tính kể cả khi người mua không bị tính lượt.';

-- D-75: mỗi khóa cache tối đa 1 job đang chạy
create unique index tryon_jobs_one_active_per_key
  on public.tryon_jobs (user_id, photo_version, product_id, image_version)
  where status in ('queued', 'running');

-- Worker nhận job và poll
create index tryon_jobs_active_run_idx
  on public.tryon_jobs (status, next_run_at)
  where status in ('queued', 'running');

-- Đếm job đang chạy của một người
create index tryon_jobs_user_active_idx
  on public.tryon_jobs (user_id, status)
  where status in ('queued', 'running');

-- Đếm lượt ngày/tháng
create index tryon_jobs_user_charged_idx
  on public.tryon_jobs (user_id, charged_at)
  where charged_at is not null;

-- Ghi nhớ kết quả bị chặn theo khóa (D-76)
create index tryon_jobs_blocked_key_idx
  on public.tryon_jobs (user_id, photo_version, product_id, image_version, model_name)
  where error_code in ('TRYON_BLOCKED', 'TRYON_PHOTO_UNUSABLE');

-- Hủy job của một sản phẩm khi sản phẩm đổi; FK cascade
create index tryon_jobs_product_idx on public.tryon_jobs (product_id);

-- Dọn job cũ
create index tryon_jobs_finished_idx
  on public.tryon_jobs (finished_at)
  where finished_at is not null;

-- Xóa ảnh theo sản phẩm (D-80). Xóa theo người dùng đã có khóa cache làm index.
create index tryon_images_product_idx on public.tryon_images (product_id);
-- Dọn 90 ngày (D-81)
create index tryon_images_last_viewed_idx on public.tryon_images (last_viewed_at);
-- Xóa cache khi đổi model (D-89)
create index tryon_images_model_idx on public.tryon_images (model_name);

create trigger trg_tryon_jobs_updated_at
  before update on public.tryon_jobs
  for each row execute function public.set_updated_at();

create table public.tryon_budget_months (
  month            date        primary key,
  spent_micro_usd  bigint      not null default 0,
  reserved_micro_usd bigint    not null default 0,
  warned_at        timestamptz,
  updated_at       timestamptz not null default now(),

  constraint tryon_budget_first_day_chk check (extract(day from month) = 1),
  constraint tryon_budget_spent_chk     check (spent_micro_usd >= 0),
  constraint tryon_budget_reserved_chk  check (reserved_micro_usd >= 0)
);

comment on table public.tryon_budget_months is 'Ngân sách toàn hệ thống theo tháng giờ Việt Nam (D-94). Ước tính theo giá công bố, không phải số dư thật ở nhà cung cấp.';

create trigger trg_tryon_budget_updated_at
  before update on public.tryon_budget_months
  for each row execute function public.set_updated_at();

create table public.tryon_file_deletions (
  storage_path    text        primary key,
  attempts        integer     not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

comment on table public.tryon_file_deletions is 'Hàng đợi xóa file ở bucket tryon-images. Ghi cùng transaction với việc xóa dòng, nên lỗi Storage không làm mất dấu file (D-79, D-80).';

create index tryon_file_deletions_due_idx on public.tryon_file_deletions (next_attempt_at);

-- ---------------------------------------------------------------------------
-- Hàm nội bộ & trigger
-- ---------------------------------------------------------------------------

-- Mọi đường xóa dòng ảnh (hủy hiệu lực, cascade, SQL tay) đều đưa file vào hàng đợi.
create or replace function public.tryon_images_enqueue_file_deletion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.tryon_file_deletions (storage_path)
  values (old.storage_path)
  on conflict (storage_path) do nothing;
  return old;
end;
$$;

create trigger trg_tryon_images_enqueue_deletion
  after delete on public.tryon_images
  for each row execute function public.tryon_images_enqueue_file_deletion();

-- Trả phần giữ chỗ; p_incurred = true thì cộng vào đã chi.
create or replace function public.tryon_budget_settle(p_month date, p_cost integer, p_incurred boolean)
returns void
language sql
set search_path = ''
as $$
  update public.tryon_budget_months b
     set reserved_micro_usd = greatest(b.reserved_micro_usd - p_cost, 0),
         spent_micro_usd    = b.spent_micro_usd + (case when p_incurred then p_cost else 0 end)
   where b.month = p_month;
$$;

-- Hủy các job chưa gửi của một người hoặc một sản phẩm, trả giữ chỗ. Một lệnh duy nhất:
-- khóa xong mọi job rồi mới chạm dòng ngân sách, nên không ngược thứ tự khóa job -> budget.
-- Job đang chạy (đã gửi) không hủy được; lúc có kết quả, complete_tryon_job sẽ bỏ kết quả.
create or replace function public.tryon_cancel_queued(p_user_id uuid, p_product_id uuid, p_purpose text)
returns void
language sql
set search_path = ''
as $$
  with canceled as (
    update public.tryon_jobs j
       set status = 'canceled', finished_at = now()
     where j.status = 'queued'
       and (p_user_id is null or j.user_id = p_user_id)
       and (p_product_id is null or j.product_id = p_product_id)
       and (p_purpose is null or j.purpose = p_purpose)
    returning j.budget_month, j.cost_micro_usd
  ),
  totals as (
    select c.budget_month, sum(c.cost_micro_usd) as total from canceled c group by c.budget_month
  )
  update public.tryon_budget_months b
     set reserved_micro_usd = greatest(b.reserved_micro_usd - t.total, 0)
    from totals t
   where b.month = t.budget_month;
$$;

-- Thay/xóa ảnh hồ sơ (D-79). Trigger bảo đảm không đường ghi nào bỏ sót, kể cả SQL tay.
create or replace function public.tryon_on_profile_photo_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.tryon_images i where i.user_id = new.user_id;
  perform public.tryon_cancel_queued(new.user_id, null, null);
  return null;
end;
$$;

create trigger trg_profiles_tryon_invalidate
  after update of photo_version on public.profiles
  for each row
  when (old.photo_version is distinct from new.photo_version)
  execute function public.tryon_on_profile_photo_changed();

-- Thay ảnh hoặc xóa mềm sản phẩm (D-80). Giữ dòng sản phẩm và ảnh gốc (D-42).
create or replace function public.tryon_on_product_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.tryon_images i where i.product_id = new.id;
  perform public.tryon_cancel_queued(null, new.id, null);
  return null;
end;
$$;

create trigger trg_products_tryon_invalidate
  after update of image_version, deleted_at on public.products
  for each row
  when (
    old.image_version is distinct from new.image_version
    or (old.deleted_at is null and new.deleted_at is not null)
  )
  execute function public.tryon_on_product_changed();

-- Job còn hợp lệ so với dữ liệu hiện tại? Dùng chung cho kiểm tra trước khi gửi và khi có kết quả.
create or replace function public.tryon_job_key_is_current(
  p_user_id            uuid,
  p_product_id         uuid,
  p_photo_version      integer,
  p_image_version      integer,
  p_consent_generation integer,
  p_consent_version    integer
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles pr
      join public.products pd on pd.id = p_product_id
     where pr.user_id = p_user_id
       and pr.profile_completed
       and pr.photo_version = p_photo_version
       and pr.tryon_consent_generation = p_consent_generation
       and pr.tryon_consent_at is not null
       and pr.tryon_consent_withdrawn_at is null
       and pr.tryon_consent_version = p_consent_version
       and pd.deleted_at is null
       and pd.image_version = p_image_version
  );
$$;

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------

-- Đồng ý, idempotent: đã đúng phiên bản thì giữ nguyên thời điểm.
create or replace function public.accept_tryon_consent(p_user_id uuid, p_version integer)
returns table (out_status text)
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles p
     set tryon_consent_at = now(),
         tryon_consent_version = p_version,
         tryon_consent_withdrawn_at = null
   where p.user_id = p_user_id
     and (p.tryon_consent_at is null
          or p.tryon_consent_withdrawn_at is not null
          or p.tryon_consent_version is distinct from p_version);
  return query select 'ok'::text;
end;
$$;

-- Rút consent (D-93): xóa ảnh try-on, hủy job chưa gửi, giữ ảnh hồ sơ. Idempotent.
-- out_status: 'ok' | 'not_active'
create or replace function public.withdraw_tryon_consent(p_user_id uuid)
returns table (out_status text)
language plpgsql
set search_path = ''
as $$
begin
  update public.profiles p
     set tryon_consent_withdrawn_at = now(),
         tryon_consent_generation = p.tryon_consent_generation + 1
   where p.user_id = p_user_id
     and p.tryon_consent_at is not null
     and p.tryon_consent_withdrawn_at is null;

  if not found then
    return query select 'not_active'::text;
    return;
  end if;

  delete from public.tryon_images i where i.user_id = p_user_id;
  perform public.tryon_cancel_queued(p_user_id, null, null);
  return query select 'ok'::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Danh sách sản phẩm cho người mua (D-44, US-06 R2)
-- ---------------------------------------------------------------------------

-- Con trỏ dùng created_at dạng text để giữ độ chính xác micro giây (Date của JS chỉ tới mili giây).
-- p_direction: 'next' = cũ hơn con trỏ, 'prev' = mới hơn con trỏ. p_inclusive: gồm cả dòng tại con trỏ.
-- Con trỏ có thể là vị trí của sản phẩm đã xóa, để vẫn tìm được sản phẩm kế tiếp.
create or replace function public.list_tryon_products(
  p_category_id       uuid,
  p_limit             integer,
  p_cursor_created_at timestamptz,
  p_cursor_id         uuid,
  p_direction         text,
  p_inclusive         boolean
)
returns table (
  id             uuid,
  name           text,
  price_vnd      integer,
  image_path     text,
  image_version  integer,
  created_at     timestamptz,
  created_at_raw text,
  category_name  text,
  row_position   integer,
  total          integer
)
language sql
stable
set search_path = ''
as $$
  with c as (
    select cat.id, cat.name
      from public.categories cat
     where cat.id = p_category_id and cat.deleted_at is null
  ),
  active as (
    select p.*
      from public.products p
      join c on c.id = p.category_id
     where p.deleted_at is null
  ),
  page as (
    select a.*
      from active a
     where p_cursor_id is null
        or (p_direction = 'next' and (a.created_at, a.id) <  (p_cursor_created_at, p_cursor_id))
        or (p_direction = 'prev' and (a.created_at, a.id) >  (p_cursor_created_at, p_cursor_id))
        or (p_inclusive and a.created_at = p_cursor_created_at and a.id = p_cursor_id)
     order by
       case when p_direction = 'prev' then a.created_at end asc,
       case when p_direction = 'prev' then a.id end asc,
       a.created_at desc,
       a.id desc
     limit p_limit
  )
  select pg.id, pg.name, pg.price_vnd, pg.image_path, pg.image_version, pg.created_at,
         pg.created_at::text,
         (select c.name from c),
         (select count(*)::integer + 1
            from active newer
           where (newer.created_at, newer.id) > (pg.created_at, pg.id)),
         (select count(*)::integer from active)
    from page pg
   order by pg.created_at desc, pg.id desc;
$$;

-- ---------------------------------------------------------------------------
-- Tạo job (D-71, D-75, D-77, D-90, D-94)
-- ---------------------------------------------------------------------------

-- Một transaction: khóa profile (nối tiếp theo người mua) -> khóa sản phẩm -> cache -> job trùng
-- -> nhớ bị chặn -> giới hạn -> ngân sách -> insert.
-- out_status:
--   ready, attached, created, blocked, profile_incomplete, consent_required, not_found,
--   quota_day, quota_month, quota_pending, busy, budget_exceeded,
--   skipped_low_quota, skipped_busy, skipped_budget
create or replace function public.create_tryon_job(
  p_user_id                uuid,
  p_product_id             uuid,
  p_purpose                text,
  p_consent_version        integer,
  p_provider               text,
  p_model_name             text,
  p_daily_limit            integer,
  p_monthly_limit          integer,
  p_max_running_per_user   integer,
  p_max_active_per_user    integer,
  p_system_concurrency     integer,
  p_cost_micro_usd         integer,
  p_budget_limit_micro_usd bigint,
  p_prefetch_min_remaining integer,
  p_budget_warn_percent    integer,
  p_deadline_seconds       integer
)
returns table (
  out_status              text,
  out_job_id              uuid,
  out_job_status          text,
  out_storage_path        text,
  out_error_code          text,
  out_retry_after_seconds integer,
  out_budget_warning      boolean
)
language plpgsql
set search_path = ''
as $$
declare
  v_profile      public.profiles%rowtype;
  v_image_ver    integer;
  v_job          public.tryon_jobs%rowtype;
  v_path         text;
  v_blocked      text;
  v_local        timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_day_start    timestamptz := date_trunc('day', v_local) at time zone 'Asia/Ho_Chi_Minh';
  v_month_start  timestamptz := date_trunc('month', v_local) at time zone 'Asia/Ho_Chi_Minh';
  v_next_day     timestamptz := (date_trunc('day', v_local) + interval '1 day') at time zone 'Asia/Ho_Chi_Minh';
  v_next_month   timestamptz := (date_trunc('month', v_local) + interval '1 month') at time zone 'Asia/Ho_Chi_Minh';
  v_month        date := date_trunc('month', v_local)::date;
  v_used_day     integer;
  v_used_month   integer;
  v_active       integer;
  v_remaining    integer;
  v_budget       public.tryon_budget_months%rowtype;
  v_committed    bigint;
  v_warn         boolean := false;
  v_new_id       uuid;
begin
  select * into v_profile from public.profiles p where p.user_id = p_user_id for update;
  if not found or not v_profile.profile_completed then
    return query select 'profile_incomplete'::text, null::uuid, null::text, null::text, null::text, null::integer, false;
    return;
  end if;

  if v_profile.tryon_consent_at is null
     or v_profile.tryon_consent_withdrawn_at is not null
     or v_profile.tryon_consent_version is distinct from p_consent_version then
    return query select 'consent_required'::text, null::uuid, null::text, null::text, null::text, null::integer, false;
    return;
  end if;

  select pd.image_version into v_image_ver
    from public.products pd
   where pd.id = p_product_id and pd.deleted_at is null
   for share;
  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text, null::text, null::integer, false;
    return;
  end if;

  -- Ảnh đã có: xem được kể cả khi hết lượt, hết ngân sách (D-94)
  update public.tryon_images i
     set last_viewed_at = now(),
         first_viewed_at = coalesce(i.first_viewed_at, now())
   where i.user_id = p_user_id
     and i.photo_version = v_profile.photo_version
     and i.product_id = p_product_id
     and i.image_version = v_image_ver
   returning i.storage_path into v_path;
  if found then
    return query select 'ready'::text, null::uuid, null::text, v_path, null::text, null::integer, false;
    return;
  end if;

  -- Đang có job cùng khóa: dùng chung (D-75). Generate trước được xem thật thì nâng ưu tiên.
  select * into v_job
    from public.tryon_jobs j
   where j.user_id = p_user_id
     and j.photo_version = v_profile.photo_version
     and j.product_id = p_product_id
     and j.image_version = v_image_ver
     and j.status in ('queued', 'running')
   for update;
  if found then
    update public.tryon_jobs j
       set last_seen_at = now(),
           purpose = case when p_purpose = 'display' then 'display' else j.purpose end
     where j.id = v_job.id;
    return query select 'attached'::text, v_job.id, v_job.status, null::text, null::text, null::integer, false;
    return;
  end if;

  -- Bị chặn theo khóa thì không gọi dịch vụ nữa (D-76). Đổi model thì được thử lại.
  select j.error_code into v_blocked
    from public.tryon_jobs j
   where j.user_id = p_user_id
     and j.photo_version = v_profile.photo_version
     and j.product_id = p_product_id
     and j.image_version = v_image_ver
     and j.model_name = p_model_name
     and j.error_code in ('TRYON_BLOCKED', 'TRYON_PHOTO_UNUSABLE')
   order by j.created_at desc
   limit 1;
  if found then
    return query select 'blocked'::text, null::uuid, null::text, null::text, v_blocked, null::integer, false;
    return;
  end if;

  -- Generate trước nhường chỗ: job hiển thị mới hủy generate trước chưa gửi của chính người này (US-06 R6).
  select count(*)::integer into v_active
    from public.tryon_jobs j
   where j.user_id = p_user_id and j.status in ('queued', 'running');

  if p_purpose = 'display' and v_active >= p_max_running_per_user then
    perform public.tryon_cancel_queued(p_user_id, null, 'prefetch');
    select count(*)::integer into v_active
      from public.tryon_jobs j
     where j.user_id = p_user_id and j.status in ('queued', 'running');
  end if;

  if p_purpose = 'prefetch' and v_active >= p_max_running_per_user then
    return query select 'skipped_busy'::text, null::uuid, null::text, null::text, null::text, null::integer, false;
    return;
  end if;
  if p_purpose = 'display' and v_active >= p_max_active_per_user then
    return query select 'busy'::text, null::uuid, null::text, null::text, null::text, 5, false;
    return;
  end if;

  -- Lượt: đã tính + đang giữ chỗ (D-77). Khóa profile ở trên làm phép đếm này không bị lọt khi song song.
  select count(*) filter (where j.charged_at >= v_day_start)::integer,
         count(*) filter (where j.charged_at >= v_month_start)::integer
    into v_used_day, v_used_month
    from public.tryon_jobs j
   where j.user_id = p_user_id and j.charged_at is not null;

  if v_used_day >= p_daily_limit then
    return query select 'quota_day'::text, null::uuid, null::text, null::text, null::text,
      ceil(extract(epoch from v_next_day - now()))::integer, false;
    return;
  end if;
  if v_used_month >= p_monthly_limit then
    return query select 'quota_month'::text, null::uuid, null::text, null::text, null::text,
      ceil(extract(epoch from v_next_month - now()))::integer, false;
    return;
  end if;

  v_remaining := least(p_daily_limit - v_used_day, p_monthly_limit - v_used_month) - v_active;
  if v_remaining <= 0 then
    if p_purpose = 'prefetch' then
      return query select 'skipped_low_quota'::text, null::uuid, null::text, null::text, null::text, null::integer, false;
    else
      return query select 'quota_pending'::text, null::uuid, null::text, null::text, null::text, 15, false;
    end if;
    return;
  end if;
  if p_purpose = 'prefetch' and v_remaining <= p_prefetch_min_remaining then
    return query select 'skipped_low_quota'::text, null::uuid, null::text, null::text, null::text, null::integer, false;
    return;
  end if;

  -- Hệ thống bận thì không generate trước
  if p_purpose = 'prefetch' and (
    select count(*) from public.tryon_jobs j where j.status in ('queued', 'running')
  ) >= p_system_concurrency then
    return query select 'skipped_busy'::text, null::uuid, null::text, null::text, null::text, null::integer, false;
    return;
  end if;

  -- Ngân sách: giữ chỗ trên một dòng có khóa, nên song song cũng không vượt (D-94)
  insert into public.tryon_budget_months (month) values (v_month) on conflict (month) do nothing;
  select * into v_budget from public.tryon_budget_months b where b.month = v_month for update;
  v_committed := v_budget.spent_micro_usd + v_budget.reserved_micro_usd;

  if p_purpose = 'prefetch'
     and (v_committed + p_cost_micro_usd) * 100 >= p_budget_limit_micro_usd * p_budget_warn_percent then
    return query select 'skipped_budget'::text, null::uuid, null::text, null::text, null::text, null::integer, false;
    return;
  end if;
  if v_committed + p_cost_micro_usd > p_budget_limit_micro_usd then
    return query select 'budget_exceeded'::text, null::uuid, null::text, null::text, null::text, null::integer, false;
    return;
  end if;

  if v_budget.warned_at is null
     and (v_committed + p_cost_micro_usd) * 100 >= p_budget_limit_micro_usd * p_budget_warn_percent then
    v_warn := true;
  end if;

  update public.tryon_budget_months b
     set reserved_micro_usd = b.reserved_micro_usd + p_cost_micro_usd,
         warned_at = case when v_warn then now() else b.warned_at end
   where b.month = v_month;

  insert into public.tryon_jobs (
    user_id, product_id, photo_version, image_version, consent_generation, purpose,
    provider, model_name, cost_micro_usd, budget_month, deadline_at
  ) values (
    p_user_id, p_product_id, v_profile.photo_version, v_image_ver, v_profile.tryon_consent_generation, p_purpose,
    p_provider, p_model_name, p_cost_micro_usd, v_month, now() + make_interval(secs => p_deadline_seconds)
  )
  returning id into v_new_id;

  return query select 'created'::text, v_new_id, 'queued'::text, null::text, null::text, null::integer, v_warn;
end;
$$;

-- ---------------------------------------------------------------------------
-- Đọc trạng thái
-- ---------------------------------------------------------------------------

-- Trạng thái sản phẩm với người mua, không tạo job.
-- out_state: ready | pending | blocked | none | profile_incomplete | consent_required | not_found
create or replace function public.get_tryon_result(
  p_user_id         uuid,
  p_product_id      uuid,
  p_consent_version integer,
  p_model_name      text
)
returns table (
  out_state        text,
  out_storage_path text,
  out_width        integer,
  out_height       integer,
  out_job_id       uuid,
  out_job_status   text,
  out_error_code   text
)
language plpgsql
set search_path = ''
as $$
declare
  v_profile   public.profiles%rowtype;
  v_image_ver integer;
  v_image     public.tryon_images%rowtype;
  v_job       public.tryon_jobs%rowtype;
  v_blocked   text;
begin
  select * into v_profile from public.profiles p where p.user_id = p_user_id;
  if not found or not v_profile.profile_completed then
    return query select 'profile_incomplete'::text, null::text, null::integer, null::integer, null::uuid, null::text, null::text;
    return;
  end if;
  if v_profile.tryon_consent_at is null
     or v_profile.tryon_consent_withdrawn_at is not null
     or v_profile.tryon_consent_version is distinct from p_consent_version then
    return query select 'consent_required'::text, null::text, null::integer, null::integer, null::uuid, null::text, null::text;
    return;
  end if;

  select pd.image_version into v_image_ver
    from public.products pd where pd.id = p_product_id and pd.deleted_at is null;
  if not found then
    return query select 'not_found'::text, null::text, null::integer, null::integer, null::uuid, null::text, null::text;
    return;
  end if;

  select * into v_image
    from public.tryon_images i
   where i.user_id = p_user_id and i.photo_version = v_profile.photo_version
     and i.product_id = p_product_id and i.image_version = v_image_ver;
  if found then
    -- Mốc 90 ngày không cần chính xác tới phút; giảm ghi khi lướt qua lại
    if v_image.first_viewed_at is null or v_image.last_viewed_at < now() - interval '1 day' then
      update public.tryon_images i
         set last_viewed_at = now(),
             first_viewed_at = coalesce(i.first_viewed_at, now())
       where i.id = v_image.id;
    end if;
    return query select 'ready'::text, v_image.storage_path, v_image.width, v_image.height, null::uuid, null::text, null::text;
    return;
  end if;

  select * into v_job
    from public.tryon_jobs j
   where j.user_id = p_user_id and j.photo_version = v_profile.photo_version
     and j.product_id = p_product_id and j.image_version = v_image_ver
     and j.status in ('queued', 'running');
  if found then
    update public.tryon_jobs j set last_seen_at = now() where j.id = v_job.id;
    return query select 'pending'::text, null::text, null::integer, null::integer, v_job.id, v_job.status, null::text;
    return;
  end if;

  select j.error_code into v_blocked
    from public.tryon_jobs j
   where j.user_id = p_user_id and j.photo_version = v_profile.photo_version
     and j.product_id = p_product_id and j.image_version = v_image_ver
     and j.model_name = p_model_name
     and j.error_code in ('TRYON_BLOCKED', 'TRYON_PHOTO_UNUSABLE')
   order by j.created_at desc limit 1;
  if found then
    return query select 'blocked'::text, null::text, null::integer, null::integer, null::uuid, null::text, v_blocked;
    return;
  end if;

  return query select 'none'::text, null::text, null::integer, null::integer, null::uuid, null::text, null::text;
end;
$$;

-- Client theo dõi job. Chỉ chủ job đọc được (không có dòng = 404).
-- out_current = false: job còn chạy nhưng đã hết hiệu lực, kết quả sẽ bị bỏ.
create or replace function public.get_tryon_job(p_job_id uuid, p_user_id uuid, p_consent_version integer)
returns table (
  out_id           uuid,
  out_product_id   uuid,
  out_purpose      text,
  out_status       text,
  out_error_code   text,
  out_created_at   timestamptz,
  out_current      boolean,
  out_storage_path text,
  out_width        integer,
  out_height       integer
)
language plpgsql
set search_path = ''
as $$
declare
  v_job public.tryon_jobs%rowtype;
begin
  update public.tryon_jobs j
     set last_seen_at = now()
   where j.id = p_job_id and j.user_id = p_user_id and j.status in ('queued', 'running');

  select * into v_job from public.tryon_jobs j where j.id = p_job_id and j.user_id = p_user_id;
  if not found then
    return;
  end if;

  return query
    select v_job.id, v_job.product_id, v_job.purpose, v_job.status, v_job.error_code, v_job.created_at,
           public.tryon_job_key_is_current(v_job.user_id, v_job.product_id, v_job.photo_version,
             v_job.image_version, v_job.consent_generation, p_consent_version),
           i.storage_path, i.width, i.height
      from (select 1) one
      left join public.tryon_images i
        on v_job.status = 'succeeded'
       and i.user_id = v_job.user_id
       and i.photo_version = v_job.photo_version
       and i.product_id = v_job.product_id
       and i.image_version = v_job.image_version;
end;
$$;

-- Số liệu cho GET /try-on/state. Không trả số tiền (US-05 E10).
create or replace function public.get_tryon_usage(
  p_user_id                uuid,
  p_budget_limit_micro_usd bigint,
  p_budget_warn_percent    integer,
  p_cost_micro_usd         integer
)
returns table (
  out_used_day      integer,
  out_used_month    integer,
  out_held          integer,
  out_day_resets_at timestamptz,
  out_month_resets_at timestamptz,
  out_budget_ok     boolean,
  out_prefetch_ok   boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local     timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_committed bigint;
begin
  select coalesce(sum(b.spent_micro_usd + b.reserved_micro_usd), 0) into v_committed
    from public.tryon_budget_months b
   where b.month = date_trunc('month', v_local)::date;

  return query
    select
      count(*) filter (where j.charged_at >= date_trunc('day', v_local) at time zone 'Asia/Ho_Chi_Minh')::integer,
      count(*) filter (where j.charged_at >= date_trunc('month', v_local) at time zone 'Asia/Ho_Chi_Minh')::integer,
      count(*) filter (where j.status in ('queued', 'running'))::integer,
      (date_trunc('day', v_local) + interval '1 day') at time zone 'Asia/Ho_Chi_Minh',
      (date_trunc('month', v_local) + interval '1 month') at time zone 'Asia/Ho_Chi_Minh',
      v_committed + p_cost_micro_usd <= p_budget_limit_micro_usd,
      (v_committed + p_cost_micro_usd) * 100 < p_budget_limit_micro_usd * p_budget_warn_percent
    from public.tryon_jobs j
   where j.user_id = p_user_id
     and (j.charged_at is not null or j.status in ('queued', 'running'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Worker
-- ---------------------------------------------------------------------------

-- Hết hạn và dọn job kẹt. Chạy mỗi tick, không phụ thuộc tiến trình nào còn sống (US-05 E19).
-- Hết 120 giây khi đã gửi, hoặc chết giữa lúc gửi: có thể đã mất tiền, nên tính vào ngân sách, không tính lượt.
create or replace function public.expire_tryon_jobs()
returns table (out_expired integer)
language plpgsql
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
  v_incurred boolean;
  v_code text;
begin
  for r in
    select j.*
      from public.tryon_jobs j
     where j.status in ('queued', 'running')
       and (
         j.deadline_at <= now()
         -- Lease của bước gửi đã hết mà chưa có provider_job_id: tiến trình đã chết
         or (j.status = 'running' and j.provider_job_id is null and j.next_run_at <= now())
       )
     order by j.id
     for update skip locked
  loop
    v_incurred := r.status = 'running';
    v_code := case when r.deadline_at <= now() then 'TRYON_TIMEOUT' else 'TRYON_FAILED' end;
    update public.tryon_jobs j
       set status = 'failed', error_code = v_code, finished_at = now(),
           cost_incurred = j.cost_incurred or v_incurred, pending_result_path = null
     where j.id = r.id;
    if r.pending_result_path is not null then
      insert into public.tryon_file_deletions (storage_path) values (r.pending_result_path)
      on conflict (storage_path) do nothing;
    end if;
    perform public.tryon_budget_settle(r.budget_month, r.cost_micro_usd, v_incurred);
    v_count := v_count + 1;
  end loop;
  return query select v_count;
end;
$$;

-- Nhận job để gửi. Advisory lock: mỗi lúc một bên nhận, nên số đếm running không bị lọt (D-90).
-- Job queued không còn ai theo dõi bị hủy ở đây (US-06 R4b). Hiển thị đi trước generate trước.
create or replace function public.claim_tryon_jobs(
  p_batch                integer,
  p_max_running_per_user integer,
  p_system_concurrency   integer,
  p_stale_seconds        integer,
  p_lease_seconds        integer,
  p_consent_version      integer
)
returns table (
  out_job_id      uuid,
  out_user_id     uuid,
  out_product_id  uuid,
  out_photo_path  text,
  out_image_path  text
)
language plpgsql
set search_path = ''
as $$
declare
  r record;
  v_system integer;
  v_user   integer;
  v_taken  integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('tryon_claim'));

  for r in
    select j.id, j.budget_month, j.cost_micro_usd
      from public.tryon_jobs j
     where j.status = 'queued'
       and j.last_seen_at < now() - make_interval(secs => p_stale_seconds)
     order by j.id
     for update skip locked
  loop
    update public.tryon_jobs j set status = 'canceled', finished_at = now() where j.id = r.id;
    perform public.tryon_budget_settle(r.budget_month, r.cost_micro_usd, false);
  end loop;

  select count(*)::integer into v_system from public.tryon_jobs j where j.status = 'running';

  for r in
    select j.*
      from public.tryon_jobs j
     where j.status = 'queued' and j.next_run_at <= now()
     order by (j.purpose = 'display') desc, j.created_at asc, j.id asc
     for update skip locked
  loop
    exit when v_taken >= p_batch or v_system >= p_system_concurrency;

    select count(*)::integer into v_user
      from public.tryon_jobs j where j.user_id = r.user_id and j.status = 'running';
    continue when v_user >= p_max_running_per_user;

    if not public.tryon_job_key_is_current(r.user_id, r.product_id, r.photo_version,
         r.image_version, r.consent_generation, p_consent_version) then
      update public.tryon_jobs j set status = 'canceled', finished_at = now() where j.id = r.id;
      perform public.tryon_budget_settle(r.budget_month, r.cost_micro_usd, false);
      continue;
    end if;

    update public.tryon_jobs j
       set status = 'running',
           attempts = j.attempts + 1,
           next_run_at = now() + make_interval(secs => p_lease_seconds)
     where j.id = r.id;

    v_system := v_system + 1;
    v_taken := v_taken + 1;

    return query
      select r.id, r.user_id, r.product_id, pr.photo_path, pd.image_path
        from public.profiles pr, public.products pd
       where pr.user_id = r.user_id and pd.id = r.product_id;
  end loop;
end;
$$;

-- Kiểm tra lần cuối ngay trước khi gửi ảnh ra ngoài (D-71, D-79). Không hợp lệ thì hủy, không tốn tiền.
-- out_status: 'ok' | 'canceled'
create or replace function public.check_tryon_job_before_submit(p_job_id uuid, p_consent_version integer)
returns table (out_status text)
language plpgsql
set search_path = ''
as $$
declare
  v_job public.tryon_jobs%rowtype;
begin
  select * into v_job from public.tryon_jobs j where j.id = p_job_id and j.status = 'running' for update;
  if not found then
    return query select 'canceled'::text;
    return;
  end if;
  if public.tryon_job_key_is_current(v_job.user_id, v_job.product_id, v_job.photo_version,
       v_job.image_version, v_job.consent_generation, p_consent_version) then
    return query select 'ok'::text;
    return;
  end if;
  update public.tryon_jobs j set status = 'canceled', finished_at = now() where j.id = p_job_id;
  perform public.tryon_budget_settle(v_job.budget_month, v_job.cost_micro_usd, false);
  return query select 'canceled'::text;
end;
$$;

create or replace function public.mark_tryon_job_submitted(p_job_id uuid, p_provider_job_id text, p_poll_seconds integer)
returns void
language sql
set search_path = ''
as $$
  update public.tryon_jobs j
     set provider_job_id = p_provider_job_id,
         submitted_at = now(),
         next_run_at = now() + make_interval(secs => p_poll_seconds)
   where j.id = p_job_id and j.status = 'running';
$$;

-- Lấy job đến lượt poll. Dời next_run_at trong cùng lệnh để không poll trùng.
create or replace function public.next_tryon_polls(p_batch integer, p_poll_seconds integer)
returns table (out_job_id uuid, out_user_id uuid, out_provider_job_id text)
language sql
set search_path = ''
as $$
  update public.tryon_jobs j
     set next_run_at = now() + make_interval(secs => p_poll_seconds)
    from (
      select j2.id
        from public.tryon_jobs j2
       where j2.status = 'running'
         and j2.provider_job_id is not null
         and j2.next_run_at <= now()
       order by j2.next_run_at
       limit p_batch
       for update skip locked
    ) due
   where j.id = due.id
  returning j.id, j.user_id, j.provider_job_id;
$$;

-- Ghi đường dẫn trước khi upload. Trả false nếu job không còn chạy hoặc đã hết hiệu lực:
-- khi đó worker không upload, gọi complete với path null để ghi nhận discarded.
create or replace function public.reserve_tryon_result_path(p_job_id uuid, p_path text, p_consent_version integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_job public.tryon_jobs%rowtype;
begin
  select * into v_job from public.tryon_jobs j where j.id = p_job_id and j.status = 'running' for update;
  if not found or not public.tryon_job_key_is_current(v_job.user_id, v_job.product_id,
       v_job.photo_version, v_job.image_version, v_job.consent_generation, p_consent_version) then
    return false;
  end if;
  update public.tryon_jobs j set pending_result_path = p_path where j.id = p_job_id;
  return true;
end;
$$;

-- Có kết quả. Khóa profile, rồi sản phẩm, rồi job: nối tiếp với thay ảnh, rút consent, đổi sản phẩm,
-- nên không có khe nào ghi được ảnh đã hết hiệu lực (D-79, US-05 R6).
-- p_result_path null: đã biết phải bỏ, không có file. Kết quả bị bỏ vẫn tính lượt (US-05 R11).
-- out_status: 'saved' | 'discarded' | 'stale' (job không còn running, ví dụ đã hết hạn)
create or replace function public.complete_tryon_job(
  p_job_id          uuid,
  p_result_path     text,
  p_width           integer,
  p_height          integer,
  p_consent_version integer
)
returns table (out_status text)
language plpgsql
set search_path = ''
as $$
declare
  v_user    uuid;
  v_product uuid;
  v_job     public.tryon_jobs%rowtype;
  v_current boolean;
  v_new_id  uuid;
begin
  select j.user_id, j.product_id into v_user, v_product from public.tryon_jobs j where j.id = p_job_id;
  if not found then
    return query select 'stale'::text;
    return;
  end if;

  perform 1 from public.profiles p where p.user_id = v_user for share;
  perform 1 from public.products p where p.id = v_product for share;
  select * into v_job from public.tryon_jobs j where j.id = p_job_id for update;

  if v_job.status <> 'running' then
    if p_result_path is not null then
      insert into public.tryon_file_deletions (storage_path) values (p_result_path)
      on conflict (storage_path) do nothing;
    end if;
    return query select 'stale'::text;
    return;
  end if;

  v_current := p_result_path is not null and public.tryon_job_key_is_current(
    v_job.user_id, v_job.product_id, v_job.photo_version, v_job.image_version,
    v_job.consent_generation, p_consent_version);

  if v_current then
    insert into public.tryon_images (
      user_id, product_id, photo_version, image_version, storage_path, width, height, model_name
    ) values (
      v_job.user_id, v_job.product_id, v_job.photo_version, v_job.image_version,
      p_result_path, p_width, p_height, v_job.model_name
    )
    on conflict (user_id, photo_version, product_id, image_version) do nothing
    returning id into v_new_id;
    v_current := v_new_id is not null;
  end if;

  if not v_current and p_result_path is not null then
    insert into public.tryon_file_deletions (storage_path) values (p_result_path)
    on conflict (storage_path) do nothing;
  end if;

  update public.tryon_jobs j
     set status = case when v_current then 'succeeded' else 'discarded' end,
         finished_at = now(),
         charged_at = now(),
         cost_incurred = true,
         pending_result_path = null
   where j.id = p_job_id;
  perform public.tryon_budget_settle(v_job.budget_month, v_job.cost_micro_usd, true);

  return query select case when v_current then 'saved' else 'discarded' end::text;
end;
$$;

-- Lỗi từ dịch vụ hoặc khi lưu. p_retry_seconds khác null và còn hạn, chưa thử lại: quay về hàng đợi (D-76).
-- p_cost_incurred: dịch vụ đã trả kết quả nhưng lưu lỗi (E17), hoặc không biết request đã tới chưa.
-- out_status: 'failed' | 'retrying' | 'stale'
create or replace function public.fail_tryon_job(
  p_job_id        uuid,
  p_error_code    text,
  p_cost_incurred boolean,
  p_retry_seconds integer,
  p_max_attempts  integer
)
returns table (out_status text)
language plpgsql
set search_path = ''
as $$
declare
  v_job public.tryon_jobs%rowtype;
begin
  select * into v_job from public.tryon_jobs j where j.id = p_job_id for update;
  if not found or v_job.status <> 'running' then
    return query select 'stale'::text;
    return;
  end if;

  if v_job.pending_result_path is not null then
    insert into public.tryon_file_deletions (storage_path) values (v_job.pending_result_path)
    on conflict (storage_path) do nothing;
  end if;

  if p_retry_seconds is not null
     and v_job.attempts < p_max_attempts
     and now() + make_interval(secs => p_retry_seconds) < v_job.deadline_at then
    update public.tryon_jobs j
       set status = 'queued',
           provider_job_id = null,
           pending_result_path = null,
           next_run_at = now() + make_interval(secs => p_retry_seconds)
     where j.id = p_job_id;
    return query select 'retrying'::text;
    return;
  end if;

  update public.tryon_jobs j
     set status = 'failed',
         error_code = p_error_code,
         finished_at = now(),
         cost_incurred = j.cost_incurred or p_cost_incurred,
         pending_result_path = null
   where j.id = p_job_id;
  perform public.tryon_budget_settle(v_job.budget_month, v_job.cost_micro_usd, p_cost_incurred);
  return query select 'failed'::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dọn dẹp
-- ---------------------------------------------------------------------------

-- Lấy file đến hạn xóa, dời lịch để lần lỗi sau thử lại. Backend xóa xong thì gọi ack.
create or replace function public.claim_tryon_file_deletions(p_batch integer, p_retry_seconds integer)
returns table (out_storage_path text, out_attempts integer)
language sql
set search_path = ''
as $$
  update public.tryon_file_deletions f
     set attempts = f.attempts + 1,
         next_attempt_at = now() + make_interval(secs => p_retry_seconds)
    from (
      select f2.storage_path
        from public.tryon_file_deletions f2
       where f2.next_attempt_at <= now()
       order by f2.next_attempt_at
       limit p_batch
       for update skip locked
    ) due
   where f.storage_path = due.storage_path
  returning f.storage_path, f.attempts;
$$;

create or replace function public.ack_tryon_file_deletions(p_paths text[])
returns void
language sql
set search_path = ''
as $$
  delete from public.tryon_file_deletions f where f.storage_path = any (p_paths);
$$;

-- Xóa ảnh không được xem quá hạn (D-81).
create or replace function public.purge_stale_tryon_images(p_days integer)
returns table (out_deleted integer)
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.tryon_images i where i.last_viewed_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;

-- Đổi model (D-89): xóa ảnh của model khác. Chạy lại được, để bắt cả job đang dở lúc đổi.
create or replace function public.purge_tryon_images_except_model(p_keep_model text)
returns table (out_deleted integer)
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.tryon_images i where i.model_name <> p_keep_model;
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;

-- Dọn job đã xong. Giữ qua hết tháng hiện tại để đếm lượt đúng.
create or replace function public.purge_old_tryon_jobs(p_days integer)
returns table (out_deleted integer)
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.tryon_jobs j
   where j.finished_at is not null
     and j.finished_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bảo mật (D-27): bật RLS không policy, chỉ service_role.
-- ---------------------------------------------------------------------------

alter table public.tryon_images         enable row level security;
alter table public.tryon_jobs           enable row level security;
alter table public.tryon_budget_months  enable row level security;
alter table public.tryon_file_deletions enable row level security;

revoke all on table public.tryon_images, public.tryon_jobs, public.tryon_budget_months, public.tryon_file_deletions
  from anon, authenticated;
grant select, insert, update, delete
  on table public.tryon_images, public.tryon_jobs, public.tryon_budget_months, public.tryon_file_deletions
  to service_role;

-- Hàm nội bộ và hàm trigger: không ai gọi trực tiếp qua /rpc.
-- service_role vẫn cần EXECUTE vì các hàm dưới đây chạy dưới quyền người gọi.
revoke execute on function public.tryon_images_enqueue_file_deletion() from public, anon, authenticated;
revoke execute on function public.tryon_on_profile_photo_changed()     from public, anon, authenticated;
revoke execute on function public.tryon_on_product_changed()           from public, anon, authenticated;
revoke execute on function public.tryon_budget_settle(date, integer, boolean) from public, anon, authenticated;
revoke execute on function public.tryon_cancel_queued(uuid, uuid, text)      from public, anon, authenticated;
revoke execute on function public.tryon_job_key_is_current(uuid, uuid, integer, integer, integer, integer) from public, anon, authenticated;
grant  execute on function public.tryon_images_enqueue_file_deletion() to service_role;
grant  execute on function public.tryon_on_profile_photo_changed()     to service_role;
grant  execute on function public.tryon_on_product_changed()           to service_role;
grant  execute on function public.tryon_budget_settle(date, integer, boolean) to service_role;
grant  execute on function public.tryon_cancel_queued(uuid, uuid, text)      to service_role;
grant  execute on function public.tryon_job_key_is_current(uuid, uuid, integer, integer, integer, integer) to service_role;

revoke execute on function public.accept_tryon_consent(uuid, integer)  from public, anon, authenticated;
revoke execute on function public.withdraw_tryon_consent(uuid)         from public, anon, authenticated;
revoke execute on function public.list_tryon_products(uuid, integer, timestamptz, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.create_tryon_job(uuid, uuid, text, integer, text, text, integer, integer, integer, integer, integer, integer, bigint, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.get_tryon_result(uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.get_tryon_job(uuid, uuid, integer)   from public, anon, authenticated;
revoke execute on function public.get_tryon_usage(uuid, bigint, integer, integer) from public, anon, authenticated;
revoke execute on function public.expire_tryon_jobs()                  from public, anon, authenticated;
revoke execute on function public.claim_tryon_jobs(integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.check_tryon_job_before_submit(uuid, integer) from public, anon, authenticated;
revoke execute on function public.mark_tryon_job_submitted(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.next_tryon_polls(integer, integer)   from public, anon, authenticated;
revoke execute on function public.reserve_tryon_result_path(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.complete_tryon_job(uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.fail_tryon_job(uuid, text, boolean, integer, integer) from public, anon, authenticated;
revoke execute on function public.claim_tryon_file_deletions(integer, integer) from public, anon, authenticated;
revoke execute on function public.ack_tryon_file_deletions(text[])     from public, anon, authenticated;
revoke execute on function public.purge_stale_tryon_images(integer)    from public, anon, authenticated;
revoke execute on function public.purge_tryon_images_except_model(text) from public, anon, authenticated;
revoke execute on function public.purge_old_tryon_jobs(integer)        from public, anon, authenticated;

grant execute on function public.accept_tryon_consent(uuid, integer)  to service_role;
grant execute on function public.withdraw_tryon_consent(uuid)         to service_role;
grant execute on function public.list_tryon_products(uuid, integer, timestamptz, uuid, text, boolean) to service_role;
grant execute on function public.create_tryon_job(uuid, uuid, text, integer, text, text, integer, integer, integer, integer, integer, integer, bigint, integer, integer, integer) to service_role;
grant execute on function public.get_tryon_result(uuid, uuid, integer, text) to service_role;
grant execute on function public.get_tryon_job(uuid, uuid, integer)   to service_role;
grant execute on function public.get_tryon_usage(uuid, bigint, integer, integer) to service_role;
grant execute on function public.expire_tryon_jobs()                  to service_role;
grant execute on function public.claim_tryon_jobs(integer, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.check_tryon_job_before_submit(uuid, integer) to service_role;
grant execute on function public.mark_tryon_job_submitted(uuid, text, integer) to service_role;
grant execute on function public.next_tryon_polls(integer, integer)   to service_role;
grant execute on function public.reserve_tryon_result_path(uuid, text, integer) to service_role;
grant execute on function public.complete_tryon_job(uuid, text, integer, integer, integer) to service_role;
grant execute on function public.fail_tryon_job(uuid, text, boolean, integer, integer) to service_role;
grant execute on function public.claim_tryon_file_deletions(integer, integer) to service_role;
grant execute on function public.ack_tryon_file_deletions(text[])     to service_role;
grant execute on function public.purge_stale_tryon_images(integer)    to service_role;
grant execute on function public.purge_tryon_images_except_model(text) to service_role;
grant execute on function public.purge_old_tryon_jobs(integer)        to service_role;
