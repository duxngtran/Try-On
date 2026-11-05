-- 002_create_profiles.sql
-- Sprint 01 · US-02 · Task T-23
-- Hồ sơ 1-1 với users: số đo, ảnh toàn thân (đường dẫn trong bucket private), phiên bản ảnh, consent.
-- agent-coder: chép nguyên văn sang migrations/002_create_profiles.sql.

create table public.profiles (
  user_id               uuid         primary key references public.users (id) on delete cascade,
  height_cm             smallint,
  weight_kg             numeric(4,1),
  photo_path            text,
  photo_version         integer      not null default 0,
  photo_updated_at      timestamptz,
  photo_consent_at      timestamptz,
  photo_consent_version smallint,
  profile_completed     boolean      generated always as (
                          photo_path is not null and height_cm is not null and weight_kg is not null
                        ) stored,
  created_at            timestamptz  not null default now(),
  updated_at            timestamptz  not null default now(),

  -- D-13
  constraint profiles_height_chk          check (height_cm between 100 and 250),
  constraint profiles_weight_chk          check (weight_kg between 30 and 250),
  -- Số đo luôn lưu cùng nhau (US-02 §7.2)
  constraint profiles_measurements_pair_chk check ((height_cm is null) = (weight_kg is null)),
  -- Đường dẫn do server sinh: <user_id>/<uuid>.jpg, nằm trong thư mục của chính user (D-12)
  constraint profiles_photo_path_chk      check (
    photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and left(photo_path, 37) = user_id::text || '/'
  ),
  -- Không thể có ảnh khi chưa consent (D-10) — chốt chặn ở DB
  constraint profiles_photo_consent_chk   check (photo_path is null or photo_consent_at is not null),
  constraint profiles_consent_pair_chk    check ((photo_consent_at is null) = (photo_consent_version is null)),
  constraint profiles_consent_version_chk check (photo_consent_version >= 1),
  -- D-15: version 0 = chưa từng có ảnh; mỗi lần tải/thay/xóa ảnh +1
  constraint profiles_photo_version_chk   check (photo_version >= 0),
  constraint profiles_photo_updated_chk   check ((photo_version = 0) = (photo_updated_at is null))
);

comment on table  public.profiles                       is 'Dữ liệu nhạy cảm (D-03, D-14). Chỉ backend truy cập; admin không xem.';
comment on column public.profiles.weight_kg             is 'numeric(4,1) tự làm tròn → backend PHẢI từ chối > 1 chữ số thập phân trước khi ghi (AC-08).';
comment on column public.profiles.photo_path            is 'Object name trong bucket profile-photos. Không trả về API, không log.';
comment on column public.profiles.photo_version         is 'Tăng khi tải/thay/xóa ảnh; Epic 3 dùng làm khóa cache try-on (D-15).';
comment on column public.profiles.photo_consent_at      is 'Thời điểm đồng ý lần đầu cho bản consent hiện hành (D-10).';
comment on column public.profiles.photo_consent_version is 'Phiên bản câu đồng ý (hằng PHOTO_CONSENT_VERSION ở backend, sprint 01 = 1).';
comment on column public.profiles.profile_completed     is 'D-09: có ảnh + chiều cao + cân nặng.';

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Tự tạo hồ sơ rỗng khi tạo user (cùng transaction với INSERT users) → luôn 1-1
create or replace function public.create_profile_for_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger trg_users_create_profile
  after insert on public.users
  for each row execute function public.create_profile_for_user();

-- Backfill cho user tạo trước migration này (vd. admin seed ở US-01)
insert into public.profiles (user_id)
select id from public.users
on conflict (user_id) do nothing;

-- Đổi/xóa ảnh nguyên tử: khóa dòng, trả đường dẫn cũ để backend xóa file sau khi ghi DB thành công.
-- p_new_path = null → xóa ảnh. Không có ảnh mà xóa → không đổi gì (idempotent, version giữ nguyên).
create or replace function public.set_profile_photo(p_user_id uuid, p_new_path text)
returns table (out_old_path text, out_photo_version integer, out_photo_updated_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  v_old text;
begin
  select p.photo_path into v_old
  from public.profiles p
  where p.user_id = p_user_id
  for update;

  if not found then
    raise exception 'profile not found for user %', p_user_id using errcode = 'P0002';
  end if;

  if p_new_path is null and v_old is null then
    return query
      select null::text, p.photo_version, p.photo_updated_at
      from public.profiles p where p.user_id = p_user_id;
    return;
  end if;

  return query
    update public.profiles p
       set photo_path       = p_new_path,
           photo_version    = p.photo_version + 1,
           photo_updated_at = now()
     where p.user_id = p_user_id
    returning v_old, p.photo_version, p.photo_updated_at;
end;
$$;

comment on function public.set_profile_photo(uuid, text) is 'Chỉ backend (service_role) gọi qua rpc. Xem flows/profile-photo-upload.md.';

-- Bảo mật: RLS bật, không policy; Data API của anon/authenticated bị chặn.
-- Supabase mặc định GRANT EXECUTE hàm mới cho anon/authenticated → phải revoke tường minh.
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

revoke execute on function public.create_profile_for_user()       from public, anon, authenticated;
revoke execute on function public.set_profile_photo(uuid, text)   from public, anon, authenticated;
grant  execute on function public.set_profile_photo(uuid, text)   to service_role;
