-- 005_add_tryon_consent.sql
-- Sprint 03 · US-05 · Task T-62
-- Consent riêng cho việc gửi ảnh tới dịch vụ AI (D-93). Tách khỏi consent lưu ảnh của US-02 (D-22).
-- agent-coder: chép nguyên văn sang migrations/005_add_tryon_consent.sql.

alter table public.profiles
  add column tryon_consent_at           timestamptz,
  add column tryon_consent_version      smallint,
  add column tryon_consent_withdrawn_at timestamptz,
  add column tryon_consent_generation   integer not null default 0;

alter table public.profiles
  add constraint profiles_tryon_consent_pair_chk
    check ((tryon_consent_at is null) = (tryon_consent_version is null)),
  add constraint profiles_tryon_consent_version_chk
    check (tryon_consent_version >= 1),
  add constraint profiles_tryon_withdrawn_chk
    check (tryon_consent_withdrawn_at is null or tryon_consent_at is not null),
  add constraint profiles_tryon_generation_chk
    check (tryon_consent_generation >= 0);

comment on column public.profiles.tryon_consent_at           is 'Thời điểm đồng ý gửi ảnh cho dịch vụ AI (D-93). Giữ lại sau khi rút để còn bằng chứng.';
comment on column public.profiles.tryon_consent_version      is 'Phiên bản câu đồng ý (hằng TRYON_CONSENT_VERSION ở backend).';
comment on column public.profiles.tryon_consent_withdrawn_at is 'Khác null = đã rút, consent không có hiệu lực. Đồng ý lại thì về null.';
comment on column public.profiles.tryon_consent_generation   is 'Tăng mỗi lần rút. Job đang chạy so số này, nên rút rồi đồng ý lại vẫn bỏ kết quả về muộn (D-79).';
