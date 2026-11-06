// Sequential checks for sprint-04 SQL on PGlite (single connection). Scratch only.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const root = process.argv[2];
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of ['001_create_users', '002_create_profiles', '003_create_categories', '004_create_products', '005_add_tryon_consent', '006_create_tryon']) {
  await db.exec(readFileSync(`${root}/migrations/${f}.sql`, 'utf8'));
}
for (const f of ['007_create_cart', '008_create_orders']) {
  await db.exec(readFileSync(`${root}/sprint-04/design/db/${f}.sql`, 'utf8'));
  console.log('applied', f);
}

const q = async (sql, params) => (await db.query(sql, params)).rows;
let pass = 0, failN = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { failN++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); }
};
// RESTRICT báo 23001 từ PG 18, 23503 ở PG 17 trở xuống (Supabase đang là PG 17).
const pgMajor = parseInt((await q('show server_version'))[0].server_version, 10);
const FK_RESTRICT = () => (pgMajor >= 18 ? '23001' : '23503');
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.code ?? e.message; } };

const hash = '$2b$10$' + 'a'.repeat(53);
let seq = 0;
const uuid = async () => (await q('select gen_random_uuid() id'))[0].id;
const cat = (await q('select id from categories order by created_at limit 1'))[0].id;
const mkUser = async () => (await q('insert into users(email,password_hash) values($1,$2) returning id', [`u${++seq}@x.io`, hash]))[0].id;
const mkProduct = async (name = 'Ao thun', price = 100000) => {
  const id = await uuid();
  await q('select * from create_product($1,$2,$3,$4,$5)', [id, name, price, cat, `${id}/${await uuid()}.jpg`]);
  return id;
};
const add = async (u, p, maxQ = 10, maxL = 30) => (await q('select * from add_cart_item($1,$2,$3,$4)', [u, p, maxQ, maxL]))[0];
const setQ = async (u, p, n, maxQ = 10) => (await q('select * from set_cart_item_quantity($1,$2,$3,$4)', [u, p, n, maxQ]))[0].out_status;
const rm = async (u, p) => (await q('select * from remove_cart_item($1,$2)', [u, p]))[0].out_status;
const cart = async (u) => (await q('select * from get_cart($1)', [u]))[0];
const place = async (u, fp, key, o = {}) => (await q('select * from place_order($1,$2,$3,$4,$5,$6)', [
  u, key ?? await uuid(), fp, o.name ?? 'Nguyen Van A', o.phone ?? '0912345678', o.addr ?? '12 Le Loi, Quan 1, TP HCM',
]))[0];
const setPrice = (p, price) => q('select * from update_product($1,null,$2,null,null)', [p, price]);
const softDelete = (p) => q('update products set deleted_at=now() where id=$1', [p]);
const orderOf = async (id) => (await q('select * from orders where id=$1', [id]))[0];
const itemsOf = (id) => q('select * from order_items where order_id=$1 order by line_no', [id]);

console.log('--- cart: add, limits');
const u1 = await mkUser();
const p1 = await mkProduct('Ao A', 100000);
const p2 = await mkProduct('Vay B', 250000);
let c = await cart(u1);
check('empty cart: fingerprint null, total 0, items []', c.out_fingerprint === null && Number(c.out_total_vnd) === 0 && c.out_items.length === 0 && c.out_item_count === 0, c);
check('add new -> qty 1', (await add(u1, p1)).out_quantity === 1);
check('add again -> qty 2', (await add(u1, p1)).out_quantity === 2);
check('one line per product (D-52)', (await q('select count(*)::int n from cart_items where user_id=$1', [u1]))[0].n === 1);
check('add missing product -> not_found', (await add(u1, await uuid())).out_status === 'not_found');
check('add unknown user -> user_not_found', (await add(await uuid(), p1)).out_status === 'user_not_found');
await add(u1, p2);
c = await cart(u1);
check('total = sum(current price x qty)', Number(c.out_total_vnd) === 450000, c.out_total_vnd);
check('item count sums quantity', c.out_item_count === 3 && c.out_line_count === 2, c);
check('newest line first', c.out_items[0].product_id === p2 && c.out_items[1].product_id === p1);
const uLim = await mkUser();
for (let i = 0; i < 3; i++) await add(uLim, p1, 3);
const lim = await add(uLim, p1, 3);
check('quantity limit, qty unchanged', lim.out_status === 'quantity_limit' && lim.out_quantity === 3, lim);
const uFull = await mkUser();
await add(uFull, p1, 10, 1);
check('line limit', (await add(uFull, p2, 10, 1)).out_status === 'cart_full');
check('line limit does not block +1 on existing line', (await add(uFull, p1, 10, 1)).out_status === 'ok');

console.log('--- cart: set quantity, remove');
check('set absolute', await setQ(u1, p1, 5) === 'ok' && (await cart(u1)).out_item_count === 6);
check('set same twice does not accumulate', await setQ(u1, p1, 5) === 'ok' && (await cart(u1)).out_item_count === 6);
check('set 0 refused', await setQ(u1, p1, 0) === 'quantity_limit');
check('set over max refused', await setQ(u1, p1, 11) === 'quantity_limit');
check('set not in cart', await setQ(uLim, p2, 1) === 'not_in_cart');
check('remove', await rm(u1, p2) === 'ok' && (await cart(u1)).out_line_count === 1);
check('remove again is idempotent', await rm(u1, p2) === 'ok');

console.log('--- cart: price change, soft delete, fingerprint');
const u2 = await mkUser();
const p3 = await mkProduct('Quan C', 300000);
await add(u2, p3);
const fp0 = (await cart(u2)).out_fingerprint;
check('same state, same fingerprint', (await cart(u2)).out_fingerprint === fp0);
await setPrice(p3, 350000);
c = await cart(u2);
check('price change -> total uses new price', Number(c.out_total_vnd) === 350000, c.out_total_vnd);
check('price change -> added_price kept for notice', c.out_items[0].added_price_vnd === 300000 && c.out_items[0].price_vnd === 350000);
check('price change -> fingerprint differs', c.out_fingerprint !== fp0);
await add(u2, p3);
c = await cart(u2);
check('add again -> added_price refreshed', c.out_items[0].added_price_vnd === 350000 && c.out_items[0].quantity === 2);
const fpName0 = c.out_fingerprint;
await q(`select * from update_product($1,'Quan C moi',null,null,null)`, [p3]);
check('name change -> fingerprint differs', (await cart(u2)).out_fingerprint !== fpName0);
const u3 = await mkUser();
const p4 = await mkProduct('Ao xoa', 120000);
const p5 = await mkProduct('Ao con', 80000);
await add(u3, p4);
await add(u3, p5);
const fpBeforeDel = (await cart(u3)).out_fingerprint;
await softDelete(p4);
c = await cart(u3);
const del = c.out_items.find((i) => i.product_id === p4);
check('soft delete: line kept, marked unavailable', del && del.available === false && del.line_total_vnd === 0, del);
check('soft delete: total excludes, flag set', Number(c.out_total_vnd) === 80000 && c.out_has_unavailable === true, c);
check('soft delete: item count still shows line', c.out_item_count === 2);
check('soft delete: fingerprint differs', c.out_fingerprint !== fpBeforeDel);
check('add deleted product refused (US-06 E4)', (await add(u3, p4)).out_status === 'not_found');
check('set quantity on deleted refused', await setQ(u3, p4, 3) === 'unavailable');
check('place with unavailable refused', (await place(u3, c.out_fingerprint)).out_status === 'cart_has_unavailable');
check('cart intact after refusal', (await cart(u3)).out_line_count === 2);
check('remove deleted line works', await rm(u3, p4) === 'ok');
c = await cart(u3);
check('after removal, no unavailable', c.out_has_unavailable === false && c.out_line_count === 1);
check('place ok after removal', (await place(u3, c.out_fingerprint)).out_status === 'ok');

console.log('--- place_order: snapshot');
const u4 = await mkUser();
const a = await mkProduct('Ao snapshot', 199000);
const b = await mkProduct('Vay snapshot', 450000);
await add(u4, a); await add(u4, a); await add(u4, b);
c = await cart(u4);
const r = await place(u4, c.out_fingerprint);
check('ok', r.out_status === 'ok' && r.out_order_id, r);
const ord = await orderOf(r.out_order_id);
const its = await itemsOf(r.out_order_id);
check('total computed by DB', Number(ord.total_vnd) === 199000 * 2 + 450000, ord.total_vnd);
check('item count', ord.item_count === 3);
check('line count', its.length === 2);
check('sum of line totals = order total', its.reduce((s, i) => s + Number(i.line_total_vnd), 0) === Number(ord.total_vnd));
check('line_no follows cart order', its[0].product_id === b && its[1].product_id === a && its[0].line_no === 1);
check('cart emptied', (await cart(u4)).out_line_count === 0);
check('recipient stored', ord.recipient_phone === '0912345678');
await setPrice(a, 999000);
await q(`select * from update_product($1,'Ten moi',null,null,null)`, [a]);
await softDelete(b);
const its2 = await itemsOf(r.out_order_id);
check('price change later does not touch order', its2.find((i) => i.product_id === a).unit_price_vnd === 199000);
check('rename later does not touch order', its2.find((i) => i.product_id === a).product_name === 'Ao snapshot');
check('soft delete later keeps line', its2.some((i) => i.product_id === b) && Number((await orderOf(r.out_order_id)).total_vnd) === 848000);

console.log('--- place_order: refusals');
const u5 = await mkUser();
check('empty cart', (await place(u5, null)).out_status === 'cart_empty');
const pp = await mkProduct('Ao gia', 100000);
await add(u5, pp);
const fpOld = (await cart(u5)).out_fingerprint;
await setPrice(pp, 150000);
check('price changed -> cart_changed', (await place(u5, fpOld)).out_status === 'cart_changed');
check('no order written', (await q('select count(*)::int n from orders where user_id=$1', [u5]))[0].n === 0);
check('cart intact', (await cart(u5)).out_line_count === 1);
check('null fingerprint -> cart_changed', (await place(u5, null)).out_status === 'cart_changed');
check('forged fingerprint -> cart_changed', (await place(u5, 'x'.repeat(32))).out_status === 'cart_changed');
const fpQty = (await cart(u5)).out_fingerprint;
await setQ(u5, pp, 2);
check('stale fingerprint after qty change', (await place(u5, fpQty)).out_status === 'cart_changed');
const fpNew = (await cart(u5)).out_fingerprint;
const rNew = await place(u5, fpNew);
check('new fingerprint -> ok at new price', rNew.out_status === 'ok' && Number((await orderOf(rNew.out_order_id)).total_vnd) === 300000);
check('unknown user', (await place(await uuid(), 'x')).out_status === 'user_not_found');

console.log('--- place_order: idempotency');
const u6 = await mkUser();
const pi = await mkProduct('Ao idem', 100000);
await add(u6, pi);
const key = await uuid();
const r1 = await place(u6, (await cart(u6)).out_fingerprint, key);
const r2 = await place(u6, 'anything', key);
check('same key -> replayed, same order', r1.out_status === 'ok' && r2.out_status === 'replayed' && r1.out_order_id === r2.out_order_id, [r1, r2]);
await add(u6, pi);
const r3 = await place(u6, 'anything', key);
check('same key with new cart -> old order, new cart untouched', r3.out_status === 'replayed' && r3.out_order_id === r1.out_order_id && (await cart(u6)).out_line_count === 1);
check('one order only', (await q('select count(*)::int n from orders where user_id=$1', [u6]))[0].n === 1);
const u7 = await mkUser();
await add(u7, pi);
const rOther = await place(u7, (await cart(u7)).out_fingerprint, key);
check('same key other user -> separate order', rOther.out_status === 'ok' && rOther.out_order_id !== r1.out_order_id);
check('order_no increases, unique', (await q('select count(distinct order_no)::int a, count(*)::int b from orders'))[0].a === (await q('select count(*)::int b from orders'))[0].b);

console.log('--- constraints');
const u8 = await mkUser();
const pc = await mkProduct('Ao rang buoc', 100000);
const placeBad = async (o) => { await add(u8, pc); const fp = (await cart(u8)).out_fingerprint; return fails(() => place(u8, fp, null, o)); };
check('bad phone rejected', await placeBad({ phone: '12345' }) === '23514');
check('phone with +84 rejected (backend normalizes)', await placeBad({ phone: '+84912345678' }) === '23514');
check('short name rejected', await placeBad({ name: 'A' }) === '23514');
check('untrimmed name rejected', await placeBad({ name: ' Nguyen ' }) === '23514');
check('short address rejected', await placeBad({ addr: 'abc' }) === '23514');
check('failed order leaves cart intact', (await cart(u8)).out_line_count === 1);
check('failed order writes nothing', (await q('select count(*)::int n from orders where user_id=$1', [u8]))[0].n === 0);
check('max total fits bigint and JS safe integer', (() => { const m = 30 * 10 * 100000000; return Number.isSafeInteger(m); })());
const uMax = await mkUser();
const pm = await mkProduct('Ao dat', 100000000);
await add(uMax, pm);
await setQ(uMax, pm, 10);
const rMax = await place(uMax, (await cart(uMax)).out_fingerprint);
check('line 1e9 over integer range stays exact', rMax.out_status === 'ok' && Number((await orderOf(rMax.out_order_id)).total_vnd) === 1000000000);
const uMax2 = await mkUser();
await add(uMax2, pm);
await q('update cart_items set quantity=999 where user_id=$1', [uMax2]);
const pm2 = await mkProduct('Ao dat 2', 100000000);
await add(uMax2, pm2);
await q('update cart_items set quantity=999 where user_id=$1', [uMax2]);
const rMax2 = await place(uMax2, (await cart(uMax2)).out_fingerprint);
check('total > 2^31 stays exact', rMax2.out_status === 'ok' && Number((await orderOf(rMax2.out_order_id)).total_vnd) === 199800000000, rMax2);

console.log('--- no GenAI side effects (US-07)');
const u9 = await mkUser();
const pg1 = await mkProduct('Ao khong ai', 100000);
const jobsBefore = (await q('select count(*)::int n from tryon_jobs'))[0].n;
await add(u9, pg1);
const rNoAi = await place(u9, (await cart(u9)).out_fingerprint);
check('no tryon job, no budget row', (await q('select count(*)::int n from tryon_jobs'))[0].n === jobsBefore && (await q('select count(*)::int n from tryon_budget_months'))[0].n === 0, rNoAi);
check('cart needs no profile or consent', (await q('select profile_completed c, tryon_consent_at a from profiles where user_id=$1', [u9]))[0].c === false);

console.log('--- FK');
const uF = await mkUser();
const pF = await mkProduct('Ao fk', 100000);
await add(uF, pF);
const rF = await place(uF, (await cart(uF)).out_fingerprint);
check('hard delete product with order restricted', await fails(() => q('delete from products where id=$1', [pF])) === FK_RESTRICT(), rF);
check('hard delete user with order restricted', await fails(() => q('delete from users where id=$1', [uF])) === FK_RESTRICT());
const uG = await mkUser();
const pG = await mkProduct('Ao cascade', 100000);
await add(uG, pG);
await q('delete from products where id=$1', [pG]);
check('hard delete product cascades cart line', (await cart(uG)).out_line_count === 0);
const pH = await mkProduct('Ao cascade 2', 100000);
await add(uG, pH);
await q('delete from users where id=$1', [uG]);
check('delete user without order cascades cart', (await q('select count(*)::int n from cart_items where user_id=$1', [uG]))[0].n === 0);

console.log('--- roles');
const asRole = async (role, fn) => { await db.exec(`set role ${role}`); try { return await fn(); } finally { await db.exec('reset role'); } };
const uR = await mkUser();
const pR = await mkProduct('Ao role', 100000);
const rSvc = await asRole('service_role', async () => {
  await add(uR, pR);
  const fp = (await cart(uR)).out_fingerprint;
  await setQ(uR, pR, 2);
  return place(uR, (await cart(uR)).out_fingerprint, null, {}, fp);
});
check('service_role runs full flow, identity works', rSvc.out_status === 'ok', rSvc);
const oR = rSvc.out_order_id;
check('service_role can read orders', (await asRole('service_role', () => q('select count(*)::int n from orders where id=$1', [oR])))[0].n === 1);
check('service_role cannot UPDATE orders', await asRole('service_role', () => fails(() => q('update orders set total_vnd=1 where id=$1', [oR]))) === '42501');
check('service_role cannot DELETE orders', await asRole('service_role', () => fails(() => q('delete from orders where id=$1', [oR]))) === '42501');
check('service_role cannot UPDATE order_items', await asRole('service_role', () => fails(() => q('update order_items set unit_price_vnd=1 where order_id=$1', [oR]))) === '42501');
check('service_role cannot DELETE order_items', await asRole('service_role', () => fails(() => q('delete from order_items where order_id=$1', [oR]))) === '42501');
for (const role of ['anon', 'authenticated']) {
  for (const t of ['cart_items', 'orders', 'order_items']) {
    check(`${role} cannot read ${t}`, await asRole(role, () => fails(() => q(`select * from ${t} limit 1`))) === '42501');
  }
  check(`${role} cannot call add_cart_item`, await asRole(role, () => fails(() => q('select * from add_cart_item($1,$2,10,30)', [uR, pR]))) === '42501');
  check(`${role} cannot call get_cart`, await asRole(role, () => fails(() => q('select * from get_cart($1)', [uR]))) === '42501');
  check(`${role} cannot call place_order`, await asRole(role, () => fails(() => q(`select * from place_order($1,gen_random_uuid(),'x','aa','0912345678','1234567890')`, [uR]))) === '42501');
}
const rls = await q(`select relname, relrowsecurity r from pg_class where relname in ('cart_items','orders','order_items')`);
check('RLS on all three tables', rls.length === 3 && rls.every((x) => x.r));
check('no RLS policy (D-27)', (await q(`select count(*)::int n from pg_policies where tablename in ('cart_items','orders','order_items')`))[0].n === 0);

console.log(`\nresult: ${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
