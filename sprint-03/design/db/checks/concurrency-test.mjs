// Real concurrent checks on an embedded PostgreSQL. Scratch only; never touches Supabase.
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const root = process.argv[2];
const dir = mkdtempSync(path.join(os.tmpdir(), 'pg-tryon-'));
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 55432, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
await server.initialise();
await server.start();
const pool = new pg.Pool({ host: 'localhost', port: 55432, user: 'postgres', password: 'pw', database: 'postgres', max: 30 });
const q = async (sql, params) => (await pool.query(sql, params)).rows;
await pool.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`);
for (const f of ['migrations/001_create_users.sql','migrations/002_create_profiles.sql','migrations/003_create_categories.sql','migrations/004_create_products.sql','sprint-03/design/db/005_add_tryon_consent.sql','sprint-03/design/db/006_create_tryon.sql']) {
  await pool.query(readFileSync(`${root}/${f}`, 'utf8'));
}
console.log('version:', (await q('show server_version'))[0].server_version);
let pass = 0, failN = 0, errors = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ok  ', n); } else { failN++; console.log('  FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const MODEL = 'tryon-v1.6';
const hash = '$2b$10$' + 'a'.repeat(53);
let seq = 0;
const uuid = async () => (await q('select gen_random_uuid() id'))[0].id;
const cat = (await q('select id from categories limit 1'))[0].id;
const mkUser = async () => {
  const u = (await q('insert into users(email,password_hash) values($1,$2) returning id', [`c${++seq}@x.io`, hash]))[0].id;
  await q('update profiles set height_cm=170,weight_kg=60,photo_consent_at=now(),photo_consent_version=1 where user_id=$1', [u]);
  await q('select * from set_profile_photo($1,$2)', [u, `${u}/${await uuid()}.jpg`]);
  await q('select * from accept_tryon_consent($1,1)', [u]);
  return u;
};
const mkProduct = async () => { const id = await uuid(); await q(`select * from create_product($1,'Prod',100000,$2,$3)`, [id, cat, `${id}/${await uuid()}.jpg`]); return id; };
const create = async (u, p, purpose = 'display', o = {}) => (await q(`select * from create_tryon_job($1,$2,$3,1,'fake',$4,$5,$6,2,$7,6,75000,$8,3,80,120)`, [u, p, purpose, MODEL, o.day ?? 20, o.month ?? 100, o.active ?? 4, o.budget ?? 50000000]))[0];
const claim = (batch = 10, sys = 6) => q('select * from claim_tryon_jobs($1,2,$2,8,30,1)', [batch, sys]);
const safely = (p) => p.catch((e) => { errors++; console.log('    ERR', e.code, e.message); return null; });
const reset = async () => { await q(`update tryon_jobs set status='canceled', finished_at=now(), charged_at=null where status in ('queued','running')`); await q('delete from tryon_budget_months'); };

console.log('A. same key, parallel: 1 job only (D-75, AC-06)');
let badA = 0;
for (let round = 0; round < 10; round++) {
  const u = await mkUser(), p = await mkProduct();
  const rs = await Promise.all(Array.from({ length: 20 }, () => safely(create(u, p))));
  const created = rs.filter((r) => r?.out_status === 'created').length;
  const ids = new Set(rs.map((r) => r?.out_job_id));
  if (created !== 1 || ids.size !== 1) badA++;
}
check('10 rounds x 20 parallel: exactly 1 created, all same id', badA === 0, badA);
await reset();

console.log('B. last quota, different products, parallel (D-77, AC-17)');
let badB = 0;
for (let round = 0; round < 10; round++) {
  const u = await mkUser(); const ps = await Promise.all(Array.from({ length: 4 }, mkProduct));
  const rs = await Promise.all(ps.map((p) => safely(create(u, p, 'display', { day: 1 }))));
  if (rs.filter((r) => r?.out_status === 'created').length !== 1) badB++;
}
check('only one job takes the last slot', badB === 0, badB);
await reset();

console.log('C. budget hard stop, many users parallel (D-94)');
const us = await Promise.all(Array.from({ length: 40 }, mkUser));
const pC = await mkProduct();
const rsC = await Promise.all(us.map((u) => safely(create(u, pC, 'display', { budget: 750000 }))));
const createdC = rsC.filter((r) => r?.out_status === 'created').length;
const exceeded = rsC.filter((r) => r?.out_status === 'budget_exceeded').length;
const warned = rsC.filter((r) => r?.out_budget_warning).length;
const bud = (await q('select spent_micro_usd::bigint s, reserved_micro_usd::bigint r from tryon_budget_months'))[0];
check('exactly 10 of 40 reserved at $0.75 limit', createdC === 10 && exceeded === 30, { createdC, exceeded });
check('reserved never over limit', Number(bud.r) + Number(bud.s) === 750000, bud);
check('80% warning fired once', warned === 1, warned);
await reset();

console.log('D. parallel claim: system and per-user limits (D-90)');
const userD = await Promise.all(Array.from({ length: 8 }, mkUser));
const prodD = await Promise.all(Array.from({ length: 3 }, mkProduct));
for (const u of userD) for (const p of prodD) await create(u, p);
const claimed = (await Promise.all(Array.from({ length: 10 }, () => safely(claim(10, 6))))).flat().filter(Boolean);
const running = (await q(`select count(*)::int n from tryon_jobs where status='running'`))[0].n;
const perUser = (await q(`select max(c)::int m from (select count(*) c from tryon_jobs where status='running' group by user_id) t`))[0].m;
check('system running <= 6', running === 6 && claimed.length === 6, { running, claimed: claimed.length });
check('per-user running <= 2', perUser <= 2, perUser);
await reset();

console.log('E. complete vs withdraw, photo replace, product change (D-79, AC-11)');
async function race(kind, rounds = 40) {
  let leaks = 0, saved = 0, discarded = 0;
  for (let i = 0; i < rounds; i++) {
    const u = await mkUser(), p = await mkProduct();
    const r = await create(u, p); const job = r.out_job_id;
    await claim(1, 100);
    await q(`select mark_tryon_job_submitted($1,'prov',2)`, [job]);
    const path_ = `${u}/${await uuid()}.jpg`;
    const reserved = (await q('select reserve_tryon_result_path($1,$2,1) r', [job, path_]))[0].r;
    if (!reserved) throw new Error('reserve failed');
    const newId = await uuid();
    const invalidate = kind === 'withdraw' ? () => q('select * from withdraw_tryon_consent($1)', [u])
      : kind === 'withdraw+accept' ? async () => { await q('select * from withdraw_tryon_consent($1)', [u]); await q('select * from accept_tryon_consent($1,1)', [u]); }
      : kind === 'photo' ? () => q('select * from set_profile_photo($1,$2)', [u, `${u}/${newId}.jpg`])
      : kind === 'product-image' ? () => q('select * from update_product($1,null,null,null,$2)', [p, `${p}/${newId}.jpg`])
      : () => q('update products set deleted_at=now() where id=$1', [p]);
    const order = i % 2 === 0;
    const results = await Promise.all(order
      ? [safely(q('select * from complete_tryon_job($1,$2,864,1296,1)', [job, path_])), safely(invalidate())]
      : [safely(invalidate()), safely(q('select * from complete_tryon_job($1,$2,864,1296,1)', [job, path_]))]);
    const st = results[order ? 0 : 1]?.[0]?.out_status;
    if (st === 'saved') saved++; else if (st === 'discarded') discarded++;
    const images = (await q('select count(*)::int n from tryon_images where user_id=$1', [u]))[0].n;
    if (images !== 0) leaks++;
    const queuedDel = (await q('select count(*)::int n from tryon_file_deletions where storage_path=$1', [path_]))[0].n;
    if (queuedDel !== 1) leaks++;
    const row = (await q('select charged_at, status from tryon_jobs where id=$1', [job]))[0];
    if (!row.charged_at) leaks++;
  }
  check(`${kind}: no image survives, file queued for deletion, charged (complete won ${saved}, invalidate won ${discarded})`, leaks === 0, leaks);
  await q('delete from tryon_file_deletions');
  await reset();
}
for (const k of ['withdraw', 'withdraw+accept', 'photo', 'product-image', 'product-delete']) await race(k);

console.log('F. mixed load: no deadlock');
const usersF = await Promise.all(Array.from({ length: 10 }, mkUser));
const prodsF = await Promise.all(Array.from({ length: 6 }, mkProduct));
const before = errors;
const ops = [];
for (let i = 0; i < 400; i++) {
  const u = usersF[i % usersF.length], p = prodsF[i % prodsF.length];
  const k = i % 8;
  ops.push(safely(
    k === 0 ? q('select * from withdraw_tryon_consent($1)', [u]).then(() => q('select * from accept_tryon_consent($1,1)', [u]))
    : k === 1 ? q('select * from claim_tryon_jobs(5,2,6,8,30,1)')
    : k === 2 ? q('select * from expire_tryon_jobs()')
    : k === 3 ? uuid().then((id) => q('select * from update_product($1,null,null,null,$2)', [p, `${p}/${id}.jpg`]))
    : k === 4 ? uuid().then((id) => q('select * from set_profile_photo($1,$2)', [u, `${u}/${id}.jpg`]))
    : create(u, p, k === 5 ? 'prefetch' : 'display')
  ));
}
await Promise.all(ops);
check('400 mixed parallel ops: 0 SQL errors, no 40P01 deadlock', errors === before, errors - before);

console.log('G. budget ledger stays consistent after mixed load');
await q('select tryon_cancel_queued(u.id,null,null) from users u');
const running2 = await q(`select id from tryon_jobs where status='running'`);
for (const { id } of running2) {
  await q(`select * from fail_tryon_job($1,'TRYON_FAILED',false,null,2)`, [id]);
}
const ledger = (await q('select coalesce(sum(reserved_micro_usd),0)::bigint r from tryon_budget_months'))[0].r;
check('reserved returns to 0 once every job is settled', Number(ledger) === 0, ledger);

console.log(`\nConcurrency: pass ${pass}, fail ${failN}, sql errors ${errors}`);
await pool.end();
await server.stop();
try { rmSync(dir, { recursive: true, force: true }); } catch {}
process.exit(failN || errors ? 1 : 0);
