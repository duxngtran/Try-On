// Sequential checks for sprint-03 SQL on PGlite (single connection).
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const root = process.argv[2];
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`);
for (const f of ['migrations/001_create_users.sql', 'migrations/002_create_profiles.sql', 'migrations/003_create_categories.sql', 'migrations/004_create_products.sql', 'sprint-03/design/db/005_add_tryon_consent.sql', 'sprint-03/design/db/006_create_tryon.sql']) {
  await db.exec(readFileSync(`${root}/${f}`, 'utf8'));
  console.log('applied', f);
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
let pass = 0, failN = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('  ok  ', name); } else { failN++; console.log('  FAIL', name, extra ?? ''); } };

const V = 1;
const MODEL = 'tryon-v1.6';
const hash = '$2b$10$' + 'a'.repeat(53);
const mkUser = async (e) => (await q(`insert into users(email,password_hash) values($1,$2) returning id`, [e, hash]))[0].id;
const uuid = async () => (await q(`select gen_random_uuid() id`))[0].id;
const setProfile = async (u, consent = true) => {
  const path = `${u}/${await uuid()}.jpg`;
  await q(`update profiles set height_cm=170,weight_kg=60,photo_consent_at=now(),photo_consent_version=1 where user_id=$1`, [u]);
  await q(`select * from set_profile_photo($1,$2)`, [u, path]);
  if (consent) await q(`select * from accept_tryon_consent($1,$2)`, [u, V]);
};
const cat = (await q(`select id from categories order by created_at limit 1`))[0].id;
const mkProduct = async (name, createdAt) => {
  const id = await uuid();
  await q(`select * from create_product($1,$2,100000,$3,$4)`, [id, name, cat, `${id}/${await uuid()}.jpg`]);
  if (createdAt) await q(`update products set created_at=$2 where id=$1`, [id, createdAt]);
  return id;
};
const create = async (u, p, purpose = 'display', o = {}) => (await q(
  `select * from create_tryon_job($1,$2,$3,$4,'fake',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
  [u, p, purpose, V, o.model ?? MODEL, o.day ?? 20, o.month ?? 100, 2, 4, o.sys ?? 6, 75000, o.budget ?? 50000000, 3, 80, 120]))[0];
const claim = (batch = 10, o = {}) => q(`select * from claim_tryon_jobs($1,2,$2,$3,30,$4)`, [batch, o.sys ?? 6, o.stale ?? 8, V]);
const job = async (id) => (await q(`select * from tryon_jobs where id=$1`, [id]))[0];
const budget = async () => (await q(`select spent_micro_usd::int spent, reserved_micro_usd::int reserved from tryon_budget_months`))[0];
const mark = (id) => q(`select mark_tryon_job_submitted($1,'prov-1',2)`, [id]);
const complete = async (id, u) => {
  const path = `${u}/${await uuid()}.jpg`;
  const ok = (await q(`select reserve_tryon_result_path($1,$2,$3) r`, [id, path, V]))[0].r;
  const st = (await q(`select * from complete_tryon_job($1,$2,864,1296,$3)`, [id, ok ? path : null, V]))[0].out_status;
  return { st, ok, path };
};
const resetBudget = () => q(`delete from tryon_budget_months`);

console.log('--- consent & gating');
const u1 = await mkUser('u1@x.io');
const p1 = await mkProduct('P1 first');
let r = await create(u1, p1);
check('profile incomplete', r.out_status === 'profile_incomplete');
await setProfile(u1, false);
r = await create(u1, p1);
check('consent required', r.out_status === 'consent_required');
await q(`select * from accept_tryon_consent($1,$2)`, [u1, V]);
const before = (await q(`select tryon_consent_at a from profiles where user_id=$1`, [u1]))[0].a;
await q(`select * from accept_tryon_consent($1,$2)`, [u1, V]);
const after = (await q(`select tryon_consent_at a from profiles where user_id=$1`, [u1]))[0].a;
check('accept idempotent keeps timestamp', +before === +after);
r = await create(u1, await uuid());
check('not found product', r.out_status === 'not_found');

console.log('--- create, attach, claim, finish');
r = await create(u1, p1);
check('created', r.out_status === 'created' && r.out_job_status === 'queued', r);
const j1 = r.out_job_id;
check('budget reserved', (await budget()).reserved === 75000);
r = await create(u1, p1);
check('attached same job (D-75)', r.out_status === 'attached' && r.out_job_id === j1);
let threw = false;
const jj = await job(j1);
try { await q(`insert into tryon_jobs(user_id,product_id,photo_version,image_version,consent_generation,purpose,provider,model_name,cost_micro_usd,budget_month,deadline_at) values($1,$2,$3,$4,0,'display','fake','m',75000,$5,now())`, [u1, p1, jj.photo_version, jj.image_version, jj.budget_month]); } catch { threw = true; }
check('unique index blocks 2nd active job on key', threw);
let claimed = await claim();
check('claimed with paths', claimed.length === 1 && claimed[0].out_photo_path && claimed[0].out_image_path, claimed);
check('check before submit ok', (await q(`select * from check_tryon_job_before_submit($1,$2)`, [j1, V]))[0].out_status === 'ok');
await mark(j1);
check('poll not due yet', (await q(`select * from next_tryon_polls(10,2)`)).length === 0);
await q(`update tryon_jobs set next_run_at=now()-interval '1 second' where id=$1`, [j1]);
check('poll due', (await q(`select * from next_tryon_polls(10,2)`)).length === 1);
check('poll rescheduled', (await q(`select * from next_tryon_polls(10,2)`)).length === 0);
let c = await complete(j1, u1);
check('saved', c.st === 'saved');
let b = await budget();
check('budget spent', b.spent === 75000 && b.reserved === 0, b);
r = await create(u1, p1);
check('cache hit ready', r.out_status === 'ready' && r.out_storage_path === c.path);
let g = (await q(`select * from get_tryon_result($1,$2,$3,$4)`, [u1, p1, V, MODEL]))[0];
check('get_result ready', g.out_state === 'ready' && g.out_width === 864);
g = (await q(`select * from get_tryon_job($1,$2,$3)`, [j1, u1, V]))[0];
check('get_job has path', g.out_status === 'succeeded' && g.out_storage_path === c.path && g.out_current);
const u2 = await mkUser('u2@x.io');
check('other user cannot read job', (await q(`select * from get_tryon_job($1,$2,$3)`, [j1, u2, V])).length === 0);

console.log('--- product name change keeps cache; image change invalidates');
await q(`select * from update_product($1,'New name',null,null,null)`, [p1]);
check('rename keeps image', (await q(`select count(*)::int n from tryon_images where product_id=$1`, [p1]))[0].n === 1);
const newPath = `${p1}/${await uuid()}.jpg`;
await q(`select * from update_product($1,null,null,null,$2)`, [p1, newPath]);
check('image replace deletes try-on row', (await q(`select count(*)::int n from tryon_images where product_id=$1`, [p1]))[0].n === 0);
check('file queued for deletion', (await q(`select count(*)::int n from tryon_file_deletions where storage_path=$1`, [c.path]))[0].n === 1);
r = await create(u1, p1);
check('new job after version change', r.out_status === 'created');
const j2 = r.out_job_id;
await claim(); await mark(j2);

console.log('--- late results (D-79)');
await q(`select * from update_product($1,null,null,null,$2)`, [p1, `${p1}/${await uuid()}.jpg`]);
c = await complete(j2, u1);
check('product image changed during run: discarded, no upload', c.st === 'discarded' && c.ok === false, c);
let jr = await job(j2);
check('discarded charged', jr.status === 'discarded' && jr.charged_at);

r = await create(u1, p1); const j3 = r.out_job_id; await claim(); await mark(j3);
const path3 = `${u1}/${await uuid()}.jpg`;
check('reserve while current', (await q(`select reserve_tryon_result_path($1,$2,$3) r`, [j3, path3, V]))[0].r === true);
// Withdraw then re-accept while upload in progress
await q(`select * from withdraw_tryon_consent($1)`, [u1]);
await q(`select * from accept_tryon_consent($1,$2)`, [u1, V]);
let st = (await q(`select * from complete_tryon_job($1,$2,864,1296,$3)`, [j3, path3, V]))[0].out_status;
check('withdraw + re-accept mid-flight: discarded (generation)', st === 'discarded', st);
check('uploaded file queued', (await q(`select count(*)::int n from tryon_file_deletions where storage_path=$1`, [path3]))[0].n === 1);
check('no image row', (await q(`select count(*)::int n from tryon_images where user_id=$1`, [u1]))[0].n === 0);

console.log('--- photo replace, soft delete');
const p2 = await mkProduct('P2');
r = await create(u1, p2); const j4 = r.out_job_id; await claim(); await mark(j4);
c = await complete(j4, u1);
check('saved for p2', c.st === 'saved');
await q(`select * from set_profile_photo($1,$2)`, [u1, `${u1}/${await uuid()}.jpg`]);
check('photo replace deletes try-on', (await q(`select count(*)::int n from tryon_images where user_id=$1`, [u1]))[0].n === 0);
r = await create(u1, p2); const j5 = r.out_job_id;
await q(`select * from set_profile_photo($1,$2)`, [u1, `${u1}/${await uuid()}.jpg`]);
check('photo replace cancels queued', (await job(j5)).status === 'canceled');
await q(`update tryon_images set last_viewed_at = last_viewed_at`);
r = await create(u1, p2); const j6 = r.out_job_id; await claim(); await mark(j6); c = await complete(j6, u1);
await q(`update products set deleted_at=now() where id=$1`, [p2]);
check('soft delete deletes try-on, keeps product', (await q(`select count(*)::int n from tryon_images where product_id=$1`, [p2]))[0].n === 0 && (await q(`select count(*)::int n from products where id=$1`, [p2]))[0].n === 1);
r = await create(u1, p2);
check('soft-deleted product 404', r.out_status === 'not_found');

console.log('--- blocked memory, retry, failure');
const p3 = await mkProduct('P3');
r = await create(u1, p3); const j7 = r.out_job_id; await claim(); await mark(j7);
st = (await q(`select * from fail_tryon_job($1,'TRYON_BLOCKED',false,null,2)`, [j7]))[0].out_status;
check('blocked -> failed', st === 'failed');
r = await create(u1, p3);
check('blocked remembered', r.out_status === 'blocked' && r.out_error_code === 'TRYON_BLOCKED');
r = await create(u1, p3, 'display', { model: 'other-model' });
check('new model may retry', r.out_status === 'created');
await q(`select * from tryon_cancel_queued($1,null,null)`, [u1]);
const p4 = await mkProduct('P4');
r = await create(u1, p4); const j8 = r.out_job_id; await claim(); await mark(j8);
st = (await q(`select * from fail_tryon_job($1,'TRYON_FAILED',false,0,2)`, [j8]))[0].out_status;
check('transient -> retrying', st === 'retrying' && (await job(j8)).provider_job_id === null);
await claim(); await mark(j8);
st = (await q(`select * from fail_tryon_job($1,'TRYON_FAILED',false,0,2)`, [j8]))[0].out_status;
check('second failure stops (1 retry)', st === 'failed');
check('failed not charged', (await job(j8)).charged_at === null);

console.log('--- quota holds & limits');
await resetBudget();
const u3 = await mkUser('u3@x.io'); await setProfile(u3);
const ps = []; for (let i = 0; i < 8; i++) ps.push(await mkProduct(`Q${i}`));
r = await create(u3, ps[0], 'display', { day: 1 });
check('first within limit 1', r.out_status === 'created');
r = await create(u3, ps[1], 'display', { day: 1 });
check('held slot blocks last-quota concurrent (D-77)', r.out_status === 'quota_pending' && r.out_retry_after_seconds === 15, r);
await claim(); await mark((await q(`select id from tryon_jobs where user_id=$1 limit 1`, [u3]))[0].id);
c = await complete((await q(`select id from tryon_jobs where user_id=$1 limit 1`, [u3]))[0].id, u3);
r = await create(u3, ps[1], 'display', { day: 1 });
check('quota_day with retryAfter', r.out_status === 'quota_day' && r.out_retry_after_seconds > 0 && r.out_retry_after_seconds <= 86400, r);
r = await create(u3, ps[0], 'display', { day: 1 });
check('cached still viewable when out of quota', r.out_status === 'ready');
r = await create(u3, ps[1], 'display', { day: 20, month: 1 });
check('quota_month', r.out_status === 'quota_month');
let u = (await q(`select * from get_tryon_usage($1,50000000,80,75000)`, [u3]))[0];
check('usage counts', u.out_used_day === 1 && u.out_used_month === 1 && u.out_budget_ok && u.out_prefetch_ok, u);

console.log('--- per-user concurrency & prefetch rules');
await resetBudget();
const u4 = await mkUser('u4@x.io'); await setProfile(u4);
let a = await create(u4, ps[0], 'display');
let pf = await create(u4, ps[1], 'prefetch');
check('prefetch allowed under limit', pf.out_status === 'created');
let pf2 = await create(u4, ps[2], 'prefetch');
check('prefetch skipped at 2 active', pf2.out_status === 'skipped_busy');
let d2 = await create(u4, ps[3], 'display');
check('display created, queued prefetch cancelled first (R6)', d2.out_status === 'created' && (await job(pf.out_job_id)).status === 'canceled');
let d3 = await create(u4, ps[4], 'display');
let d4 = await create(u4, ps[5], 'display');
let d5 = await create(u4, ps[6], 'display');
check('active cap -> busy', d3.out_status === 'created' && d4.out_status === 'created' && d5.out_status === 'busy' && d5.out_retry_after_seconds === 5, d5);
claimed = await claim();
check('claim max 2 running per user', claimed.length === 2, claimed.length);
const runIds = claimed.map(x => x.out_job_id);
check('display first by created_at', runIds.includes(a.out_job_id) && runIds.includes(d2.out_job_id));
await q(`update tryon_jobs set last_seen_at=now()-interval '1 minute' where id=$1`, [d3.out_job_id]);
await claim();
check('stale queued canceled, unwatched (R4b)', (await job(d3.out_job_id)).status === 'canceled');
await q(`select * from tryon_cancel_queued($1,null,null)`, [u4]);
const upg = await create(u4, ps[7], 'prefetch');
check('prefetch at 2 running skipped', upg.out_status === 'skipped_busy');
for (const id of runIds) { await mark(id); await complete(id, u4); }
const pf3 = await create(u4, ps[7], 'prefetch');
const up = await create(u4, ps[7], 'display');
check('prefetch upgraded to display when viewed', up.out_status === 'attached' && (await job(pf3.out_job_id)).purpose === 'display');
await q(`select * from tryon_cancel_queued($1,null,null)`, [u4]);

console.log('--- low quota prefetch (D-85)');
await resetBudget();
const u5 = await mkUser('u5@x.io'); await setProfile(u5);
r = await create(u5, ps[0], 'prefetch', { day: 3 });
check('no prefetch at 3 remaining', r.out_status === 'skipped_low_quota', r);
r = await create(u5, ps[0], 'prefetch', { day: 4 });
check('prefetch at 4 remaining', r.out_status === 'created', r);
await q(`select * from tryon_cancel_queued($1,null,null)`, [u5]);

console.log('--- system concurrency & priority');
const u6 = await mkUser('u6@x.io'); await setProfile(u6);
const u7 = await mkUser('u7@x.io'); await setProfile(u7);
const sa = await create(u6, ps[0], 'prefetch');
const sb = await create(u7, ps[1], 'display');
claimed = await claim(1, { sys: 1 });
check('system limit 1 and display first', claimed.length === 1 && claimed[0].out_job_id === sb.out_job_id, claimed);
check('still at limit', (await claim(5, { sys: 1 })).length === 0);
r = await create(u6, ps[2], 'prefetch', { sys: 1 });
check('prefetch skipped when system busy', r.out_status === 'skipped_busy');
await q(`update tryon_jobs set status='canceled', finished_at=now() where status in ('queued','running')`);

console.log('--- budget');
await resetBudget();
const u8 = await mkUser('u8@x.io'); await setProfile(u8);
const lim = 150000; // 2 ảnh
r = await create(u8, ps[0], 'display', { budget: lim });
check('warn flag fires at >=80% once', r.out_status === 'created' && r.out_budget_warning === false, r);
let w = await create(u8, ps[1], 'display', { budget: lim });
check('reservation hits 100%, warn fires', w.out_status === 'created' && w.out_budget_warning === true, w);
r = await create(u8, ps[2], 'display', { budget: lim });
check('hard stop counts reservations', r.out_status === 'budget_exceeded', r);
r = await create(u8, ps[2], 'prefetch', { budget: lim * 2 });
check('prefetch stopped at warn level', r.out_status === 'skipped_budget' || r.out_status === 'skipped_busy', r);
const budgetBefore = await budget();
await q(`select * from withdraw_tryon_consent($1)`, [u8]);
const bAfter = await budget();
check('withdraw releases holds', bAfter.reserved === 0 && budgetBefore.reserved === 150000, bAfter);
u = (await q(`select * from get_tryon_usage($1,75000,80,75000)`, [u8]))[0];
check('usage budget ok boolean', u.out_budget_ok === true);

console.log('--- expiry');
await resetBudget();
const u9 = await mkUser('u9@x.io'); await setProfile(u9);
r = await create(u9, ps[0]); const e1 = r.out_job_id; await claim(); await mark(e1);
await q(`update tryon_jobs set deadline_at=now()-interval '1 second' where id=$1`, [e1]);
await q(`select * from expire_tryon_jobs()`);
jr = await job(e1);
b = await budget();
check('timeout: failed, no quota, budget spent', jr.status === 'failed' && jr.error_code === 'TRYON_TIMEOUT' && !jr.charged_at && b.spent === 75000 && b.reserved === 0, { jr, b });
r = await create(u9, ps[1]); const e2 = r.out_job_id; await claim();
await q(`update tryon_jobs set next_run_at=now()-interval '1 second' where id=$1`, [e2]);
await q(`select * from expire_tryon_jobs()`);
jr = await job(e2);
check('crash during submit: failed, cost incurred', jr.status === 'failed' && jr.error_code === 'TRYON_FAILED' && jr.cost_incurred);
r = await create(u9, ps[2]); const e3 = r.out_job_id;
await q(`update tryon_jobs set deadline_at=now()-interval '1 second' where id=$1`, [e3]);
await q(`select * from expire_tryon_jobs()`);
jr = await job(e3);
check('queued past deadline: no cost', jr.status === 'failed' && jr.cost_incurred === false);
r = await create(u9, ps[3]); const e4 = r.out_job_id; await claim(); await mark(e4);
const lp = `${u9}/${await uuid()}.jpg`;
await q(`select reserve_tryon_result_path($1,$2,$3)`, [e4, lp, V]);
await q(`update tryon_jobs set deadline_at=now()-interval '1 second' where id=$1`, [e4]);
await q(`select * from expire_tryon_jobs()`);
check('pending file queued on expiry', (await q(`select count(*)::int n from tryon_file_deletions where storage_path=$1`, [lp]))[0].n === 1);
st = (await q(`select * from complete_tryon_job($1,$2,864,1296,$3)`, [e4, lp, V]))[0].out_status;
check('complete after expiry stale', st === 'stale');

console.log('--- cursor list');
const c2 = (await q(`select id from categories order by created_at offset 1 limit 1`))[0].id;
const mk2 = async (name, t) => { const id = await uuid(); await q(`select * from create_product($1,$2,100000,$3,$4)`, [id, name, c2, `${id}/${await uuid()}.jpg`]); await q(`update products set created_at=$2 where id=$1`, [id, t]); return id; };
const L1 = await mk2('L1', '2026-01-01T00:00:00.000001Z');
const L2 = await mk2('L2', '2026-01-01T00:00:00.000002Z');
const L3 = await mk2('L3', '2026-01-01T00:00:00.000003Z');
const L3b = await mk2('L3b', '2026-01-01T00:00:00.000003Z');
const list = (cCur, iCur, dir, inc, limit = 10) => q(`select * from list_tryon_products($1,$2,$3,$4,$5,$6)`, [c2, limit, cCur, iCur, dir, inc]);
let l = await list(null, null, 'next', false, 2);
const tieFirst = [L3, L3b].sort().reverse();
check('order newest, id desc tie', l[0].id === tieFirst[0] && l[1].id === tieFirst[1], l.map(x => x.name));
check('position & total', l[0].row_position === 1 && l[1].row_position === 2 && l[0].total === 4);
const last = l[1];
l = await list(last.created_at_raw, last.id, 'next', false, 10);
check('micro precision next', l.length === 2 && l[0].id === L2 && l[1].id === L1, l.map(x => x.name));
l = await list(l[1].created_at_raw, l[1].id, 'prev', false, 1);
check('prev returns nearest newer', l.length === 1 && l[0].id === L2, l.map(x => x.name));
const raw = (await q(`select created_at::text r from products where id=$1`, [L2]))[0].r;
l = await list(raw, L2, 'next', true, 2);
check('anchor inclusive', l[0].id === L2 && l[1].id === L1, l.map(x => x.name));
await q(`update products set deleted_at=now() where id=$1`, [L2]);
l = await list(raw, L2, 'next', true, 2);
check('deleted anchor gives next item (AC-11/12)', l.length === 1 && l[0].id === L1 && l[0].total === 3, l.map(x => x.name));
l = await q(`select * from list_tryon_products($1,10,null,null,'next',false)`, [await uuid()]);
check('unknown category empty', l.length === 0);

console.log('--- purge');
const u10 = await mkUser('u10@x.io'); await setProfile(u10);
const pp = await mkProduct('PP');
r = await create(u10, pp); const z = r.out_job_id; await claim(); await mark(z); c = await complete(z, u10);
await q(`update tryon_images set last_viewed_at=now()-interval '91 days' where user_id=$1`, [u10]);
let del = (await q(`select * from purge_stale_tryon_images(90)`))[0].out_deleted;
check('90-day purge', del === 1);
r = await create(u10, pp); const z2 = r.out_job_id; await claim(); await mark(z2); c = await complete(z2, u10);
del = (await q(`select * from purge_tryon_images_except_model($1)`, [MODEL]))[0].out_deleted;
check('keep current model', del === 0);
del = (await q(`select * from purge_tryon_images_except_model('next-model')`))[0].out_deleted;
check('purge other model', del >= 1);
const files = await q(`select * from claim_tryon_file_deletions(1000,60)`);
check('claim deletions', files.length > 0);
check('not due again', (await q(`select * from claim_tryon_file_deletions(1000,60)`)).length === 0);
await q(`select ack_tryon_file_deletions($1)`, [files.map(f => f.out_storage_path)]);
check('ack empties', (await q(`select count(*)::int n from tryon_file_deletions`))[0].n === 0);
await q(`update tryon_jobs set finished_at=now()-interval '40 days' where user_id=$1`, [u10]);
del = (await q(`select * from purge_old_tryon_jobs(35)`))[0].out_deleted;
check('old jobs purged', del === 2, del);

console.log('--- permissions');
const denied = async (role, sql) => { await db.exec(`set role ${role}`); try { await db.query(sql); return false; } catch { return true; } finally { await db.exec('reset role'); } };
for (const role of ['anon', 'authenticated']) {
  check(`${role} no select jobs`, await denied(role, 'select * from public.tryon_jobs'));
  check(`${role} no select images`, await denied(role, 'select * from public.tryon_images'));
  check(`${role} no rpc create`, await denied(role, `select public.withdraw_tryon_consent('${u1}')`));
  check(`${role} no rpc internal`, await denied(role, `select public.tryon_budget_settle(current_date, 1, true)`));
}
await db.exec('set role service_role');
try {
  const ok = await db.query(`select * from public.get_tryon_usage('${u1}',1,80,1)`);
  check('service_role can call', ok.rows.length === 1);
} finally { await db.exec('reset role'); }
const rls = await q(`select relname from pg_class where relname like 'tryon_%' and relkind='r' and not relrowsecurity`);
check('RLS on all new tables', rls.length === 0, rls);

console.log(`\nPGlite: pass ${pass}, fail ${failN}`);
process.exit(failN ? 1 : 0);
