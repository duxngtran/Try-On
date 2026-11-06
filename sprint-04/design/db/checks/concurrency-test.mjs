// Real concurrent checks on an embedded PostgreSQL. Scratch only; never touches Supabase.
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const root = process.argv[2];
const dir = mkdtempSync(path.join(os.tmpdir(), 'pg-orders-'));
const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: 55433, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
await server.initialise();
await server.start();
const pool = new pg.Pool({ host: 'localhost', port: 55433, user: 'postgres', password: 'pw', database: 'postgres', max: 30 });
const q = async (sql, params) => (await pool.query(sql, params)).rows;
await pool.query('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
for (const f of ['001_create_users', '002_create_profiles', '003_create_categories', '004_create_products', '005_add_tryon_consent', '006_create_tryon']) {
  await pool.query(readFileSync(`${root}/migrations/${f}.sql`, 'utf8'));
}
for (const f of ['007_create_cart', '008_create_orders']) {
  await pool.query(readFileSync(`${root}/sprint-04/design/db/${f}.sql`, 'utf8'));
}
console.log('version:', (await q('show server_version'))[0].server_version);

let pass = 0, failN = 0, errors = 0, deadlocks = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ok  ', n); } else { failN++; console.log('  FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const safely = (p) => p.catch((e) => { errors++; if (e.code === '40P01') deadlocks++; console.log('    ERR', e.code, e.message); return null; });
const hash = '$2b$10$' + 'a'.repeat(53);
let seq = 0;
const uuid = async () => (await q('select gen_random_uuid() id'))[0].id;
const cat = (await q('select id from categories limit 1'))[0].id;
const mkUser = async () => (await q('insert into users(email,password_hash) values($1,$2) returning id', [`c${++seq}@x.io`, hash]))[0].id;
const mkProduct = async (price = 100000) => { const id = await uuid(); await q(`select * from create_product($1,'Prod',$2,$3,$4)`, [id, price, cat, `${id}/${await uuid()}.jpg`]); return id; };
const add = async (u, p, maxQ = 10, maxL = 30) => (await q('select * from add_cart_item($1,$2,$3,$4)', [u, p, maxQ, maxL]))[0];
const setQ = async (u, p, n) => (await q('select * from set_cart_item_quantity($1,$2,$3,10)', [u, p, n]))[0].out_status;
const rm = async (u, p) => (await q('select * from remove_cart_item($1,$2)', [u, p]))[0].out_status;
const cart = async (u) => (await q('select * from get_cart($1)', [u]))[0];
const place = async (u, fp, key) => (await q(`select * from place_order($1,$2,$3,'Nguyen Van A','0912345678','12 Le Loi, Quan 1, TP HCM')`, [u, key ?? await uuid(), fp]))[0];
const setPrice = (p, price) => q('select * from update_product($1,null,$2,null,null)', [p, price]);
const softDelete = (p) => q('update products set deleted_at=now() where id=$1 and deleted_at is null', [p]);
const lines = (o) => q('select * from order_items where order_id=$1', [o]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (fn) => sleep(Math.random() * 4).then(fn);
const count = (r, s) => r.filter((x) => x?.out_status === s).length;
const ordersOf = async (u) => (await q('select count(*)::int n from orders where user_id=$1', [u]))[0].n;

console.log('A. double submit, same key (retry after timeout, double click)');
let badA = 0;
for (let i = 0; i < 10; i++) {
  const u = await mkUser(), p = await mkProduct();
  await add(u, p);
  const fp = (await cart(u)).out_fingerprint, key = await uuid();
  const rs = await Promise.all(Array.from({ length: 20 }, () => safely(place(u, fp, key))));
  const ids = new Set(rs.map((r) => r?.out_order_id));
  if (count(rs, 'ok') !== 1 || count(rs, 'replayed') !== 19 || ids.size !== 1 || await ordersOf(u) !== 1) badA++;
}
check('10 rounds x 20 parallel: 1 ok, 19 replayed, 1 order, same id', badA === 0, badA);

console.log('B. two tabs, different keys, same cart');
let badB = 0;
for (let i = 0; i < 20; i++) {
  const u = await mkUser(), p = await mkProduct();
  await add(u, p);
  const fp = (await cart(u)).out_fingerprint;
  const rs = await Promise.all(Array.from({ length: 10 }, () => safely(place(u, fp))));
  if (count(rs, 'ok') !== 1 || count(rs, 'cart_empty') !== 9 || await ordersOf(u) !== 1) badB++;
}
check('20 rounds x 10 keys: 1 ok, 9 cart_empty, 1 order', badB === 0, badB);

console.log('C. add a second product while placing');
const outcomesC = { placeFirst: 0, addFirst: 0 };
let badC = 0;
for (let i = 0; i < 40; i++) {
  const u = await mkUser(), p1 = await mkProduct(), p2 = await mkProduct();
  await add(u, p1);
  const fp = (await cart(u)).out_fingerprint;
  const key = await uuid();
  const [r] = await Promise.all([safely(jitter(() => place(u, fp, key))), safely(jitter(() => add(u, p2)))]);
  const inCart = (await q('select product_id from cart_items where user_id=$1', [u])).map((x) => x.product_id);
  if (r.out_status === 'ok') {
    outcomesC.placeFirst++;
    const ol = (await lines(r.out_order_id)).map((x) => x.product_id);
    if (ol.length !== 1 || ol[0] !== p1 || inCart.length !== 1 || inCart[0] !== p2) badC++;
  } else if (r.out_status === 'cart_changed') {
    outcomesC.addFirst++;
    if (await ordersOf(u) !== 0 || inCart.length !== 2) badC++;
  } else badC++;
}
check('item never lost, never ordered unseen', badC === 0, badC);
console.log('    outcomes', outcomesC);

console.log('D. change quantity while placing');
const outcomesD = { placeFirst: 0, setFirst: 0 };
let badD = 0;
for (let i = 0; i < 40; i++) {
  const u = await mkUser(), p = await mkProduct();
  await add(u, p);
  const fp = (await cart(u)).out_fingerprint;
  const key = await uuid();
  const [r, s] = await Promise.all([safely(jitter(() => place(u, fp, key))), safely(jitter(() => setQ(u, p, 5)))]);
  if (r.out_status === 'ok') {
    outcomesD.placeFirst++;
    if ((await lines(r.out_order_id))[0].quantity !== 1 || s !== 'not_in_cart') badD++;
  } else if (r.out_status === 'cart_changed') {
    outcomesD.setFirst++;
    if ((await cart(u)).out_item_count !== 5 || await ordersOf(u) !== 0) badD++;
  } else badD++;
}
check('order has the quantity buyer saw, or refused', badD === 0, badD);
console.log('    outcomes', outcomesD);

console.log('E. admin changes price while placing');
const outcomesE = { oldPrice: 0, refused: 0 };
let badE = 0;
for (let i = 0; i < 40; i++) {
  const u = await mkUser(), p = await mkProduct(100000);
  await add(u, p);
  const fp = (await cart(u)).out_fingerprint;
  const key = await uuid();
  const [r] = await Promise.all([safely(jitter(() => place(u, fp, key))), safely(jitter(() => setPrice(p, 200000)))]);
  if (r.out_status === 'ok') {
    outcomesE.oldPrice++;
    const l = (await lines(r.out_order_id))[0];
    if (l.unit_price_vnd !== 100000) badE++;
  } else if (r.out_status === 'cart_changed') {
    outcomesE.refused++;
    if (await ordersOf(u) !== 0) badE++;
  } else badE++;
}
check('never charged a price the buyer did not see', badE === 0, badE);
console.log('    outcomes', outcomesE);

console.log('F. admin soft deletes while placing');
const outcomesF = { ordered: 0, refused: 0 };
let badF = 0;
for (let i = 0; i < 40; i++) {
  const u = await mkUser(), p = await mkProduct();
  await add(u, p);
  const fp = (await cart(u)).out_fingerprint;
  const key = await uuid();
  const [r] = await Promise.all([safely(jitter(() => place(u, fp, key))), safely(jitter(() => softDelete(p)))]);
  if (r.out_status === 'ok') outcomesF.ordered++;
  else if (r.out_status === 'cart_has_unavailable') {
    outcomesF.refused++;
    if (await ordersOf(u) !== 0) badF++;
  } else badF++;
}
check('deleted product is either refused or deletion came after the order', badF === 0, badF);
console.log('    outcomes', outcomesF);

console.log('K. deterministic interleaving with held transactions');
async function holdThen(u, p, hold, expectStatus, finish) {
  const fp = (await cart(u)).out_fingerprint, key = await uuid();
  const c1 = await pool.connect();
  await c1.query('begin');
  await hold(c1);
  let done = false;
  const pending = place(u, fp, key).then((r) => { done = true; return r; });
  await sleep(300);
  const blocked = !done;
  await c1.query(finish);
  c1.release();
  const r = await pending;
  return { blocked, status: r.out_status, id: r.out_order_id, expect: r.out_status === expectStatus };
}
{
  let u = await mkUser(), p = await mkProduct(100000);
  await add(u, p);
  let x = await holdThen(u, p, (c) => c.query('select * from update_product($1,null,200000,null,null)', [p]), 'cart_changed', 'commit');
  check('price update in flight: place waits, then cart_changed (reads after wait)', x.blocked && x.expect, x);
  u = await mkUser(); p = await mkProduct(100000);
  await add(u, p);
  x = await holdThen(u, p, (c) => c.query('select * from update_product($1,null,200000,null,null)', [p]), 'ok', 'rollback');
  check('price update rolled back: place waits, then ok at old price', x.blocked && x.expect && (await lines(x.id))[0].unit_price_vnd === 100000, x);
  u = await mkUser(); p = await mkProduct(100000);
  await add(u, p);
  x = await holdThen(u, p, (c) => c.query('update products set deleted_at=now() where id=$1', [p]), 'cart_has_unavailable', 'commit');
  check('soft delete in flight: place waits, then refused', x.blocked && x.expect, x);
  const uA = await mkUser(), pA = await mkProduct(100000), pB = await mkProduct(100000);
  await add(uA, pA);
  x = await holdThen(uA, pA, (c) => c.query('select * from add_cart_item($1,$2,10,30)', [uA, pB]), 'cart_changed', 'commit');
  check('add in flight on same user: place waits, then cart_changed', x.blocked && x.expect, x);
  // place giữ khóa: admin và thao tác giỏ phải đợi; người khác và try-on không bị chặn
  const uP = await mkUser(), pP = await mkProduct(100000), uOther = await mkUser();
  await add(uP, pP);
  const fpP = (await cart(uP)).out_fingerprint, keyP = await uuid();
  const c2 = await pool.connect();
  await c2.query('begin');
  await c2.query(`select * from place_order($1,$2,$3,'Nguyen Van A','0912345678','12 Le Loi, Quan 1, TP HCM')`, [uP, keyP, fpP]);
  let adminDone = false, cartDone = false;
  const adminP = setPrice(pP, 300000).then(() => { adminDone = true; });
  const cartP = add(uP, pP).then(() => { cartDone = true; });
  const otherStart = Date.now();
  await add(uOther, pP);
  const otherMs = Date.now() - otherStart;
  await sleep(300);
  check('admin price update waits for open order', !adminDone);
  check('same user cart write waits for open order', !cartDone);
  check('another buyer adding the same product is not blocked', otherMs < 200, otherMs);
  await c2.query('commit');
  c2.release();
  await Promise.all([adminP, cartP]);
  check('after commit: order keeps old price, later add starts new cart', (await q('select unit_price_vnd p from order_items where product_id=$1 and order_id=(select id from orders where user_id=$2)', [pP, uP]))[0].p === 100000 && (await cart(uP)).out_item_count === 1);
}

console.log('G. parallel add, same product: no lost update, limit holds');
let badG = 0;
for (let i = 0; i < 10; i++) {
  const u = await mkUser(), p = await mkProduct();
  const rs = await Promise.all(Array.from({ length: 20 }, () => safely(add(u, p, 10, 30))));
  if (count(rs, 'ok') !== 10 || count(rs, 'quantity_limit') !== 10 || (await cart(u)).out_item_count !== 10) badG++;
}
check('20 parallel with max 10: exactly 10 ok, quantity 10', badG === 0, badG);
let badG2 = 0;
for (let i = 0; i < 10; i++) {
  const u = await mkUser();
  const ps = await Promise.all(Array.from({ length: 12 }, () => mkProduct()));
  const rs = await Promise.all(ps.map((p) => safely(add(u, p, 10, 5))));
  if (count(rs, 'ok') !== 5 || count(rs, 'cart_full') !== 7 || (await cart(u)).out_line_count !== 5) badG2++;
}
check('12 parallel products with max 5 lines: exactly 5', badG2 === 0, badG2);

console.log('H. parallel set quantity from several tabs');
let badH = 0;
for (let i = 0; i < 10; i++) {
  const u = await mkUser(), p = await mkProduct();
  await add(u, p);
  await Promise.all([2, 3, 4, 5, 6].map((n) => safely(setQ(u, p, n))));
  const n = (await cart(u)).out_item_count;
  if (![2, 3, 4, 5, 6].includes(n)) badH++;
}
check('last write wins, value is one of those sent', badH === 0, badH);

console.log('I. many buyers, one product, admin updating: shared locks');
const pI = await mkProduct(100000);
const usI = await Promise.all(Array.from({ length: 30 }, mkUser));
for (const u of usI) await add(u, pI);
const fpsI = await Promise.all(usI.map(async (u) => (await cart(u)).out_fingerprint));
const keysI = await Promise.all(usI.map(() => uuid()));
const rsI = await Promise.all([
  ...usI.map((u, i) => safely(sleep(i * 1.5).then(() => place(u, fpsI[i], keysI[i])))),
  safely(sleep(20).then(() => setPrice(pI, 111000))), safely(sleep(30).then(() => setPrice(pI, 122000))),
]);
const placedI = rsI.slice(0, 30);
check('all resolve as ok or cart_changed', placedI.every((r) => ['ok', 'cart_changed'].includes(r?.out_status)), placedI.map((r) => r?.out_status));
const pricesI = await q('select distinct unit_price_vnd p from order_items where product_id=$1', [pI]);
check('every order line at the price the buyer saw', pricesI.every((x) => x.p === 100000), pricesI);
// Không kiểm hai kết quả đều xảy ra: phụ thuộc thời điểm. Phép K kiểm hai thứ tự một cách tất định.
console.log('    ok', count(placedI, 'ok'), 'changed', count(placedI, 'cart_changed'));

console.log('J. mixed load with try-on, admin writes and carts');
const usJ = await Promise.all(Array.from({ length: 15 }, async () => {
  const u = await mkUser();
  await q('update profiles set height_cm=170,weight_kg=60,photo_consent_at=now(),photo_consent_version=1 where user_id=$1', [u]);
  await q('select * from set_profile_photo($1,$2)', [u, `${u}/${await uuid()}.jpg`]);
  await q('select * from accept_tryon_consent($1,1)', [u]);
  return u;
}));
const psJ = await Promise.all(Array.from({ length: 8 }, () => mkProduct(100000)));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const statusJ = {};
const tally = (r) => { const s = r?.out_status ?? 'other'; statusJ[s] = (statusJ[s] ?? 0) + 1; return r; };
let ordersJ = 0;
const opsJ = Array.from({ length: 600 }, (_, i) => async () => {
  const u = pick(usJ), p = pick(psJ);
  switch (i % 8) {
    case 0: case 1: case 2: return tally(await add(u, p));
    case 3: return setQ(u, p, 1 + (i % 10));
    case 4: return rm(u, p);
    case 5: {
      for (let t = 0; t < 3; t++) {
        const c = await cart(u);
        const r = tally(await place(u, c.out_fingerprint));
        if (r.out_status === 'ok') { ordersJ++; return r; }
        if (r.out_status === 'cart_empty') return r;
        if (r.out_status === 'cart_has_unavailable') return r;
      }
      return null;
    }
    case 6: return i % 40 === 6 ? setPrice(p, 100000 + (i % 50) * 1000) : tally(await add(u, p));
    default: return tally((await q(`select * from create_tryon_job($1,$2,'display',1,'fake','tryon-v1.6',20,100,2,4,6,75000,50000000,3,80,120)`, [u, p]))[0]);
  }
});
for (let i = opsJ.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opsJ[i], opsJ[j]] = [opsJ[j], opsJ[i]]; }
let nextJ = 0;
await Promise.all(Array.from({ length: 25 }, async () => { while (nextJ < opsJ.length) await safely(opsJ[nextJ++]()); }));
console.log('    statuses', statusJ);
const badTotals = (await q(`
  select o.id from orders o
    join order_items i on i.order_id = o.id
   group by o.id, o.total_vnd, o.item_count
  having sum(i.line_total_vnd) <> o.total_vnd or sum(i.quantity) <> o.item_count`)).length;
check('mixed load actually produced orders', ordersJ >= 10, ordersJ);
console.log('    orders placed', ordersJ);
check('every order: total = sum(lines), count = sum(quantity)', badTotals === 0, badTotals);
const empty = (await q('select count(*)::int n from orders o where not exists (select 1 from order_items i where i.order_id=o.id)'))[0].n;
check('no order without lines', empty === 0, empty);
check('no deadlock (40P01)', deadlocks === 0, deadlocks);
check('no SQL error anywhere', errors === 0, errors);

console.log(`\nresult: ${pass} passed, ${failN} failed; errors ${errors}; deadlocks ${deadlocks}`);
await pool.end();
await server.stop();
process.exit(failN ? 1 : 0);
