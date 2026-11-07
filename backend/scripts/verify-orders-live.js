// Kiểm tra thật trên Supabase dev (T-114, US-08 AC-04 → AC-15). Chạy khi cần: npm run verify:orders
// Chuyển từ sprint-04/design/db/checks/concurrency-test.mjs (chạy trên PostgreSQL nhúng) sang Supabase thật:
// mọi lệnh gọi hàm SQL đi qua PostgREST + Supavisor bằng service role, kịch bản chỉ in dòng tổng hợp.
// Phần K (xen kẽ tất định) giữ transaction bằng kết nối `DATABASE_URL` (cổng 5432), vì PostgREST không giữ được transaction.
//
// `service_role` KHÔNG xóa được orders, order_items (D-138): script dọn bằng `DATABASE_URL`, theo tiền tố
// `verify-orders-` (email) và `VERIFYORD-` (danh mục, sản phẩm), cả ở ĐẦU mỗi lần chạy (dọn lần chạy trước bị ngắt)
// lẫn ở CUỐI. Không dùng worker, không gọi dịch vụ AI; không log họ tên, số điện thoại, địa chỉ, token.
// Cuối cùng in đúng một dòng `result:`; exit code 1 khi có kiểm tra thất bại hoặc lỗi SQL ngoài dự kiến.
process.env.TRYON_PROVIDER = 'fake';
delete process.env.FASHN_API_KEY;

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { getEnv } from '../src/config/env.js';
import { getSupabase } from '../src/config/supabase.js';
import { createOrderRepository } from '../src/repositories/orderRepository.js';

const env = getEnv();
if (!env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL trong backend/.env (cần để dọn đơn)');
const client = getSupabase();
const tag = Date.now().toString(36);
const EMAIL_PREFIX = 'verify-orders-';
const NAME_PREFIX = 'VERIFYORD-';
const HASH = `$2b$10$${'a'.repeat(53)}`;
// Dữ liệu giả, chỉ gửi tới DB, không bao giờ in ra.
const RECIPIENT = ['Nguyen Van A', '0912345678', '12 Le Loi, Quan 1, TP HCM'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (fn) => sleep(Math.random() * 40).then(fn);
const rows = (data) => (Array.isArray(data) ? data : data == null ? [] : [data]);
const firstOf = (data) => rows(data)[0];

let pass = 0;
let failures = 0;
let sqlErrors = 0;
let deadlocks = 0;
const check = (ok, message, extra) => {
  if (ok) pass += 1;
  else failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${message}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ''}`,
  );
};

const unwrap = ({ data, error }) => {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
};
const rpc = async (fn, args) => unwrap(await client.rpc(fn, args));
/** Bắt lỗi SQL, đếm riêng deadlock (40P01), trả null để vòng lặp chạy tiếp. Chỉ in mã, không in message. */
const safely = (promise) =>
  promise.catch((err) => {
    sqlErrors += 1;
    if (err.code === '40P01') deadlocks += 1;
    console.log(`  LỖI SQL ${err.code ?? ''}`);
    return null;
  });

const created = { users: [], products: [], categories: [] };
let budgetSnapshot = [];

// ---------------------------------------------------------------------------
// Dữ liệu thử
// ---------------------------------------------------------------------------
let seq = 0;
async function mkUser() {
  const row = unwrap(
    await client
      .from('users')
      .insert({ email: `${EMAIL_PREFIX}${tag}-${(seq += 1)}@example.test`, password_hash: HASH })
      .select('id')
      .single(),
  );
  created.users.push(row.id);
  return row.id;
}

let category;
async function mkProduct(price = 100000) {
  if (!category) {
    category = unwrap(
      await client
        .from('categories')
        .insert({ name: `${NAME_PREFIX}${tag}` })
        .select('id')
        .single(),
    );
    created.categories.push(category.id);
  }
  const id = randomUUID();
  const status = firstOf(
    await rpc('create_product', {
      p_id: id,
      p_name: `${NAME_PREFIX}${tag}`,
      p_price_vnd: price,
      p_category_id: category.id,
      p_image_path: `${id}/${randomUUID()}.jpg`,
    }),
  ).out_status;
  if (status !== 'ok') throw new Error(`create_product: ${status}`);
  created.products.push(id);
  return id;
}

const add = async (u, p, maxQuantity = 10, maxLines = 30) =>
  firstOf(
    await rpc('add_cart_item', {
      p_user_id: u,
      p_product_id: p,
      p_max_quantity: maxQuantity,
      p_max_lines: maxLines,
    }),
  );
const setQ = async (u, p, n, max = 10) =>
  firstOf(
    await rpc('set_cart_item_quantity', {
      p_user_id: u,
      p_product_id: p,
      p_quantity: n,
      p_max_quantity: max,
    }),
  ).out_status;
const rm = async (u, p) =>
  firstOf(await rpc('remove_cart_item', { p_user_id: u, p_product_id: p })).out_status;
const cart = async (u) => firstOf(await rpc('get_cart', { p_user_id: u }));
const placeArgs = (u, fp, key, recipient = RECIPIENT) => ({
  p_user_id: u,
  p_idempotency_key: key,
  p_fingerprint: fp,
  p_recipient_name: recipient[0],
  p_recipient_phone: recipient[1],
  p_shipping_address: recipient[2],
});
const place = async (u, fp, key = randomUUID()) =>
  firstOf(await rpc('place_order', placeArgs(u, fp, key)));
const setPrice = (p, price) =>
  rpc('update_product', {
    p_id: p,
    p_name: null,
    p_price_vnd: price,
    p_category_id: null,
    p_new_image_path: null,
  });
const softDelete = async (p) =>
  unwrap(
    await client
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', p)
      .is('deleted_at', null),
  );
const lines = async (orderId) =>
  unwrap(await client.from('order_items').select('*').eq('order_id', orderId));
const ordersOf = async (u) => {
  const { count, error } = await client
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', u);
  if (error) throw error;
  return count ?? 0;
};
const count = (results, status) => results.filter((r) => r?.out_status === status).length;

// ---------------------------------------------------------------------------
// Dọn dẹp bằng DATABASE_URL (role postgres)
// ---------------------------------------------------------------------------
async function withDb(fn) {
  const db = new pg.Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Xóa theo tiền tố, không phụ thuộc danh sách trong bộ nhớ nên dọn được cả lần chạy trước bị ngắt. Thứ tự: dòng đơn -> đơn -> user -> sản phẩm -> danh mục. */
async function sweep(db) {
  const userFilter = `select id from public.users where email like '${EMAIL_PREFIX}%@example.test'`;
  const counts = {};
  const run = async (label, sql) => {
    counts[label] = (await db.query(sql)).rowCount;
  };
  await run(
    'order_items',
    `delete from public.order_items where order_id in (select id from public.orders where user_id in (${userFilter}))`,
  );
  await run('orders', `delete from public.orders where user_id in (${userFilter})`);
  await run('tryon_jobs', `delete from public.tryon_jobs where user_id in (${userFilter})`);
  await run('users', `delete from public.users where email like '${EMAIL_PREFIX}%@example.test'`);
  await run('products', `delete from public.products where name like '${NAME_PREFIX}%'`);
  await run('categories', `delete from public.categories where name like '${NAME_PREFIX}%'`);
  return counts;
}

async function residual(db) {
  const q = async (sql) => Number((await db.query(sql)).rows[0].n);
  return {
    users: await q(
      `select count(*) n from public.users where email like '${EMAIL_PREFIX}%@example.test'`,
    ),
    products: await q(`select count(*) n from public.products where name like '${NAME_PREFIX}%'`),
    categories: await q(
      `select count(*) n from public.categories where name like '${NAME_PREFIX}%'`,
    ),
    orders: await q(
      `select count(*) n from public.orders where user_id in (select id from public.users where email like '${EMAIL_PREFIX}%@example.test')`,
    ),
    orphanItems: await q(
      `select count(*) n from public.order_items i where not exists (select 1 from public.orders o where o.id = i.order_id)`,
    ),
  };
}

// ---------------------------------------------------------------------------
// A. Cùng khóa
// ---------------------------------------------------------------------------
async function scenarioA() {
  console.log('\nA. đặt trùng, cùng khóa (thử lại sau timeout, bấm đúp)');
  let bad = 0;
  for (let i = 0; i < 6; i += 1) {
    const u = await mkUser();
    const p = await mkProduct();
    await add(u, p);
    const fp = (await cart(u)).out_fingerprint;
    const key = randomUUID();
    const rs = await Promise.all(Array.from({ length: 20 }, () => safely(place(u, fp, key))));
    const ids = new Set(rs.map((r) => r?.out_order_id));
    if (
      count(rs, 'ok') !== 1 ||
      count(rs, 'replayed') !== 19 ||
      ids.size !== 1 ||
      (await ordersOf(u)) !== 1
    ) {
      bad += 1;
    }
  }
  check(bad === 0, 'A 6 vòng x 20 song song: đúng 1 ok, 19 replayed, 1 đơn, cùng id (AC-10)', bad);
}

// B. Hai tab, khác khóa
async function scenarioB() {
  console.log('\nB. hai tab, khác khóa, cùng giỏ');
  let bad = 0;
  for (let i = 0; i < 10; i += 1) {
    const u = await mkUser();
    const p = await mkProduct();
    await add(u, p);
    const fp = (await cart(u)).out_fingerprint;
    const rs = await Promise.all(Array.from({ length: 10 }, () => safely(place(u, fp))));
    if (count(rs, 'ok') !== 1 || count(rs, 'cart_empty') !== 9 || (await ordersOf(u)) !== 1)
      bad += 1;
  }
  check(bad === 0, 'B 10 vòng x 10 khóa: đúng 1 ok, 9 cart_empty, 1 đơn (AC-12)', bad);
}

// C. Thêm món khi đang đặt
async function scenarioC() {
  console.log('\nC. thêm món thứ hai khi đang đặt');
  const outcomes = { placeFirst: 0, addFirst: 0 };
  let bad = 0;
  for (let i = 0; i < 30; i += 1) {
    const u = await mkUser();
    const p1 = await mkProduct();
    const p2 = await mkProduct();
    await add(u, p1);
    const fp = (await cart(u)).out_fingerprint;
    const key = randomUUID();
    const [r] = await Promise.all([
      safely(jitter(() => place(u, fp, key))),
      safely(jitter(() => add(u, p2))),
    ]);
    const inCart = unwrap(
      await client.from('cart_items').select('product_id').eq('user_id', u),
    ).map((x) => x.product_id);
    if (r?.out_status === 'ok') {
      outcomes.placeFirst += 1;
      const ol = (await lines(r.out_order_id)).map((x) => x.product_id);
      if (ol.length !== 1 || ol[0] !== p1 || inCart.length !== 1 || inCart[0] !== p2) bad += 1;
    } else if (r?.out_status === 'cart_changed') {
      outcomes.addFirst += 1;
      if ((await ordersOf(u)) !== 0 || inCart.length !== 2) bad += 1;
    } else bad += 1;
  }
  check(
    bad === 0,
    'C món thêm không bao giờ mất, không bao giờ vào đơn khi người mua chưa thấy (AC-13)',
    bad,
  );
  console.log('    kết quả', JSON.stringify(outcomes));
  return outcomes;
}

// D. Đổi số lượng khi đang đặt
async function scenarioD() {
  console.log('\nD. đổi số lượng khi đang đặt');
  const outcomes = { placeFirst: 0, setFirst: 0 };
  let bad = 0;
  for (let i = 0; i < 30; i += 1) {
    const u = await mkUser();
    const p = await mkProduct();
    await add(u, p);
    const fp = (await cart(u)).out_fingerprint;
    const key = randomUUID();
    const [r, s] = await Promise.all([
      safely(jitter(() => place(u, fp, key))),
      safely(jitter(() => setQ(u, p, 5))),
    ]);
    if (r?.out_status === 'ok') {
      outcomes.placeFirst += 1;
      if ((await lines(r.out_order_id))[0].quantity !== 1 || s !== 'not_in_cart') bad += 1;
    } else if (r?.out_status === 'cart_changed') {
      outcomes.setFirst += 1;
      if (Number((await cart(u)).out_item_count) !== 5 || (await ordersOf(u)) !== 0) bad += 1;
    } else bad += 1;
  }
  check(bad === 0, 'D đơn đúng số lượng người mua đã thấy, hoặc bị từ chối', bad);
  console.log('    kết quả', JSON.stringify(outcomes));
  return outcomes;
}

// E. Admin đổi giá khi đang đặt
async function scenarioE() {
  console.log('\nE. admin đổi giá khi đang đặt');
  const outcomes = { oldPrice: 0, refused: 0 };
  let bad = 0;
  for (let i = 0; i < 40; i += 1) {
    const u = await mkUser();
    const p = await mkProduct(100000);
    await add(u, p);
    const fp = (await cart(u)).out_fingerprint;
    const key = randomUUID();
    const [r] = await Promise.all([
      safely(jitter(() => place(u, fp, key))),
      safely(jitter(() => setPrice(p, 200000))),
    ]);
    if (r?.out_status === 'ok') {
      outcomes.oldPrice += 1;
      if ((await lines(r.out_order_id))[0].unit_price_vnd !== 100000) bad += 1;
    } else if (r?.out_status === 'cart_changed') {
      outcomes.refused += 1;
      if ((await ordersOf(u)) !== 0) bad += 1;
    } else bad += 1;
  }
  check(bad === 0, 'E không bao giờ có đơn ở giá người mua chưa thấy (AC-07)', bad);
  console.log('    kết quả', JSON.stringify(outcomes));
  return outcomes;
}

// F. Admin xóa mềm khi đang đặt
async function scenarioF() {
  console.log('\nF. admin xóa mềm khi đang đặt');
  const outcomes = { ordered: 0, refused: 0 };
  let bad = 0;
  for (let i = 0; i < 30; i += 1) {
    const u = await mkUser();
    const p = await mkProduct();
    await add(u, p);
    const fp = (await cart(u)).out_fingerprint;
    const key = randomUUID();
    const [r] = await Promise.all([
      safely(jitter(() => place(u, fp, key))),
      safely(jitter(() => softDelete(p))),
    ]);
    if (r?.out_status === 'ok') outcomes.ordered += 1;
    else if (r?.out_status === 'cart_has_unavailable') {
      outcomes.refused += 1;
      if ((await ordersOf(u)) !== 0) bad += 1;
    } else bad += 1;
  }
  check(
    bad === 0,
    'F sản phẩm vừa xóa mềm: hoặc bị từ chối, hoặc xóa diễn ra sau đơn (AC-08)',
    bad,
  );
  console.log('    kết quả', JSON.stringify(outcomes));
  return outcomes;
}

// ---------------------------------------------------------------------------
// K. Xen kẽ tất định bằng transaction giữ tay (kết nối DATABASE_URL)
// ---------------------------------------------------------------------------
const HOLD_MS = 1500; // PostgREST của service_role không có statement_timeout ngắn; vẫn giữ dưới vài giây.
async function holdThen(u, hold, expectStatus, finish) {
  const fp = (await cart(u)).out_fingerprint;
  const key = randomUUID();
  const c1 = new pg.Client({ connectionString: env.DATABASE_URL });
  await c1.connect();
  try {
    await c1.query('begin');
    await hold(c1);
    let done = false;
    const pending = place(u, fp, key).then((r) => {
      done = true;
      return r;
    });
    await sleep(HOLD_MS);
    const blocked = !done;
    await c1.query(finish);
    const r = await pending;
    return {
      blocked,
      status: r.out_status,
      id: r.out_order_id,
      expect: r.out_status === expectStatus,
    };
  } finally {
    await c1.end();
  }
}

async function scenarioK() {
  console.log('\nK. xen kẽ tất định bằng transaction giữ tay');
  const price = (p, value) => (c) =>
    c.query('select * from public.update_product($1, null, $2, null, null)', [p, value]);

  let u = await mkUser();
  let p = await mkProduct(100000);
  await add(u, p);
  let x = await holdThen(u, price(p, 200000), 'cart_changed', 'commit');
  check(
    x.blocked && x.expect,
    'K1 đổi giá đang mở: đặt hàng chờ, rồi cart_changed (đọc sau khi chờ)',
    x,
  );

  u = await mkUser();
  p = await mkProduct(100000);
  await add(u, p);
  x = await holdThen(u, price(p, 200000), 'ok', 'rollback');
  check(
    x.blocked && x.expect && (await lines(x.id))[0].unit_price_vnd === 100000,
    'K2 đổi giá hoàn tác: đặt hàng chờ, rồi ok ở giá cũ',
    x,
  );

  u = await mkUser();
  p = await mkProduct(100000);
  await add(u, p);
  x = await holdThen(
    u,
    (c) => c.query('update public.products set deleted_at = now() where id = $1', [p]),
    'cart_has_unavailable',
    'commit',
  );
  check(x.blocked && x.expect, 'K3 xóa mềm đang mở: đặt hàng chờ, rồi bị từ chối', x);

  const uA = await mkUser();
  const pA = await mkProduct(100000);
  const pB = await mkProduct(100000);
  await add(uA, pA);
  x = await holdThen(
    uA,
    (c) => c.query('select * from public.add_cart_item($1, $2, 10, 30)', [uA, pB]),
    'cart_changed',
    'commit',
  );
  check(x.blocked && x.expect, 'K4 thêm món đang mở cùng người: đặt hàng chờ, rồi cart_changed', x);

  // Một đơn đang mở: admin và thao tác giỏ cùng người phải chờ; người khác và try-on không bị chặn.
  const uP = await mkUser();
  const pP = await mkProduct(100000);
  const uOther = await mkUser();
  await add(uP, pP);
  const fpP = (await cart(uP)).out_fingerprint;
  const c2 = new pg.Client({ connectionString: env.DATABASE_URL });
  await c2.connect();
  try {
    await c2.query('begin');
    await c2.query('select * from public.place_order($1, $2, $3, $4, $5, $6)', [
      uP,
      randomUUID(),
      fpP,
      ...RECIPIENT,
    ]);
    let adminDone = false;
    let cartDone = false;
    const adminP = safely(setPrice(pP, 300000)).then(() => {
      adminDone = true;
    });
    const cartP = safely(add(uP, pP)).then(() => {
      cartDone = true;
    });
    let otherDone = false;
    const otherP = safely(add(uOther, pP)).then(() => {
      otherDone = true;
    });
    await sleep(HOLD_MS);
    check(!adminDone, 'K5 admin đổi giá chờ đơn đang mở');
    check(!cartDone, 'K6 thao tác giỏ của cùng người chờ đơn đang mở');
    check(otherDone, 'K7 người mua khác thêm cùng sản phẩm không bị chặn bởi đơn đang mở');
    await c2.query('commit');
    await Promise.all([adminP, cartP, otherP]);
    const keptPrice = unwrap(
      await client
        .from('order_items')
        .select('unit_price_vnd, orders!inner(user_id)')
        .eq('product_id', pP)
        .eq('orders.user_id', uP),
    )[0]?.unit_price_vnd;
    check(
      keptPrice === 100000 && Number((await cart(uP)).out_item_count) === 1,
      'K8 sau commit: đơn giữ giá cũ, món thêm sau vào giỏ mới',
      keptPrice,
    );
  } finally {
    await c2.end();
  }
}

// ---------------------------------------------------------------------------
// G, H, I, J
// ---------------------------------------------------------------------------
async function scenarioG() {
  console.log('\nG. thêm song song cùng sản phẩm: không mất cập nhật, giới hạn giữ vững');
  let bad = 0;
  for (let i = 0; i < 6; i += 1) {
    const u = await mkUser();
    const p = await mkProduct();
    const rs = await Promise.all(Array.from({ length: 20 }, () => safely(add(u, p, 10, 30))));
    if (
      count(rs, 'ok') !== 10 ||
      count(rs, 'quantity_limit') !== 10 ||
      Number((await cart(u)).out_item_count) !== 10
    )
      bad += 1;
  }
  check(bad === 0, 'G1 20 song song với giới hạn 10: đúng 10 ok, số lượng 10', bad);
  let bad2 = 0;
  for (let i = 0; i < 6; i += 1) {
    const u = await mkUser();
    const ps = await Promise.all(Array.from({ length: 12 }, () => mkProduct()));
    const rs = await Promise.all(ps.map((p) => safely(add(u, p, 10, 5))));
    if (
      count(rs, 'ok') !== 5 ||
      count(rs, 'cart_full') !== 7 ||
      Number((await cart(u)).out_line_count) !== 5
    )
      bad2 += 1;
  }
  check(bad2 === 0, 'G2 12 sản phẩm song song với giới hạn 5 dòng: đúng 5', bad2);
}

async function scenarioH() {
  console.log('\nH. sửa số lượng song song từ nhiều tab');
  let bad = 0;
  for (let i = 0; i < 6; i += 1) {
    const u = await mkUser();
    const p = await mkProduct();
    await add(u, p);
    await Promise.all([2, 3, 4, 5, 6].map((n) => safely(setQ(u, p, n))));
    if (![2, 3, 4, 5, 6].includes(Number((await cart(u)).out_item_count))) bad += 1;
  }
  check(bad === 0, 'H giá trị cuối là một trong các giá trị đã gửi', bad);
}

async function scenarioI() {
  console.log('\nI. 30 người cùng sản phẩm, admin đổi giá hai lần (khóa dùng chung)');
  const pI = await mkProduct(100000);
  const us = [];
  for (let i = 0; i < 30; i += 1) us.push(await mkUser());
  await Promise.all(us.map((u) => add(u, pI)));
  const fps = await Promise.all(us.map(async (u) => (await cart(u)).out_fingerprint));
  const rs = await Promise.all([
    ...us.map((u, i) => safely(sleep(i * 10).then(() => place(u, fps[i])))),
    safely(sleep(100).then(() => setPrice(pI, 111000))),
    safely(sleep(200).then(() => setPrice(pI, 122000))),
  ]);
  const placed = rs.slice(0, 30);
  check(
    placed.every((r) => ['ok', 'cart_changed'].includes(r?.out_status)),
    'I mọi request là ok hoặc cart_changed',
    placed.map((r) => r?.out_status),
  );
  const prices = unwrap(
    await client.from('order_items').select('unit_price_vnd').eq('product_id', pI),
  );
  check(
    prices.every((x) => x.unit_price_vnd === 100000),
    'I mọi dòng đơn ở giá người mua đã thấy',
    prices.length,
  );
  console.log(`    ok ${count(placed, 'ok')}, cart_changed ${count(placed, 'cart_changed')}`);
}

async function scenarioJ() {
  console.log('\nJ. tải hỗn hợp có tạo job try-on, sửa giá, giỏ');
  const us = [];
  for (let i = 0; i < 12; i += 1) {
    const u = await mkUser();
    unwrap(
      await client
        .from('profiles')
        .update({
          height_cm: 170,
          weight_kg: 60,
          photo_consent_at: new Date().toISOString(),
          photo_consent_version: 1,
        })
        .eq('user_id', u),
    );
    await rpc('set_profile_photo', { p_user_id: u, p_new_path: `${u}/${randomUUID()}.jpg` });
    await rpc('accept_tryon_consent', { p_user_id: u, p_version: 1 });
    us.push(u);
  }
  const ps = [];
  for (let i = 0; i < 8; i += 1) ps.push(await mkProduct(100000));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const statuses = {};
  const tally = (r) => {
    const s = r?.out_status ?? 'other';
    statuses[s] = (statuses[s] ?? 0) + 1;
    return r;
  };
  let ordersJ = 0;
  const ops = Array.from({ length: 240 }, (_, i) => async () => {
    const u = pick(us);
    const p = pick(ps);
    switch (i % 8) {
      case 0:
      case 1:
      case 2:
        return tally(await add(u, p));
      case 3:
        return setQ(u, p, 1 + (i % 10));
      case 4:
        return rm(u, p);
      case 5: {
        for (let t = 0; t < 3; t += 1) {
          const c = await cart(u);
          const r = tally(await place(u, c.out_fingerprint));
          if (r.out_status === 'ok') {
            ordersJ += 1;
            return r;
          }
          if (r.out_status === 'cart_empty' || r.out_status === 'cart_has_unavailable') return r;
        }
        return null;
      }
      case 6:
        return i % 40 === 6 ? setPrice(p, 100000 + (i % 50) * 1000) : tally(await add(u, p));
      default:
        // Ngân sách rất lớn để không tự chặn; sổ ngân sách được khôi phục ở cuối (như verify:tryon).
        return rpc('create_tryon_job', {
          p_user_id: u,
          p_product_id: p,
          p_purpose: 'display',
          p_consent_version: 1,
          p_provider: 'fake',
          p_model_name: 'tryon-v1.6',
          p_daily_limit: 1000,
          p_monthly_limit: 100000,
          p_max_running_per_user: 2,
          p_max_active_per_user: 4,
          p_system_concurrency: 6,
          p_cost_micro_usd: 75000,
          p_budget_limit_micro_usd: 50_000_000_000,
          p_prefetch_min_remaining: 3,
          p_budget_warn_percent: 80,
          p_deadline_seconds: 120,
        });
    }
  });
  for (let i = ops.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ops[i], ops[j]] = [ops[j], ops[i]];
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: 20 }, async () => {
      while (next < ops.length) await safely(ops[next++]());
    }),
  );
  console.log(`    trạng thái ${JSON.stringify(statuses)}, đơn đã đặt ${ordersJ}`);
  check(ordersJ >= 5, 'J tải hỗn hợp thực sự tạo ra đơn', ordersJ);
  // Kiểm tổng bằng một câu truy vấn tổng hợp ở DB, chỉ lấy số dòng vi phạm.
  const bad = await withDb(async (db) => {
    const { rows: r } = await db.query(
      `select count(*)::int n from (
         select o.id from public.orders o join public.order_items i on i.order_id = o.id
          where o.user_id = any($1::uuid[])
          group by o.id, o.total_vnd, o.item_count
         having sum(i.line_total_vnd) <> o.total_vnd or sum(i.quantity) <> o.item_count) s`,
      [us],
    );
    const { rows: e } = await db.query(
      `select count(*)::int n from public.orders o
        where o.user_id = any($1::uuid[]) and not exists (select 1 from public.order_items i where i.order_id = o.id)`,
      [us],
    );
    return { totals: r[0].n, empty: e[0].n };
  });
  check(bad.totals === 0, 'J mọi đơn: tổng = Σ dòng, số món = Σ số lượng', bad);
  check(bad.empty === 0, 'J không có đơn nào thiếu dòng', bad);
}

// ---------------------------------------------------------------------------
// L. Nguyên tử (AC-14), không rò dữ liệu (AC-17), bigint, đọc qua repository thật, quyền
// ---------------------------------------------------------------------------
async function scenarioL() {
  console.log('\nL. nguyên tử, làm sạch lỗi, số lớn, đọc đơn qua repository, quyền');
  // AC-14: vi phạm ràng buộc giữa chừng (số điện thoại sai chỉ bị CHECK của DB bắt) -> không đơn, không dòng, giỏ giữ.
  let u = await mkUser();
  let p = await mkProduct(100000);
  await add(u, p);
  await add(u, p);
  const before = await cart(u);
  const rawError = (
    await client.rpc(
      'place_order',
      placeArgs(u, before.out_fingerprint, randomUUID(), ['Nguyen Van A', '12345', RECIPIENT[2]]),
    )
  ).error;
  const after = await cart(u);
  const dbOrders = await withDb(async (db) =>
    Number(
      (
        await db.query(
          'select (select count(*) from public.orders where user_id = $1) + (select count(*) from public.order_items i where i.product_id = $2) n',
          [u, p],
        )
      ).rows[0].n,
    ),
  );
  check(
    rawError?.code === '23514',
    'L1 vi phạm CHECK giữa chừng trả lỗi 23514 qua PostgREST',
    rawError?.code,
  );
  check(
    dbOrders === 0 &&
      after.out_fingerprint === before.out_fingerprint &&
      Number(after.out_item_count) === 2,
    'L2 không có orders, không có order_items, giỏ giữ nguyên (AC-14)',
    { dbOrders },
  );
  // AC-17: lỗi gốc CÓ chứa dữ liệu; repository phải cắt bỏ.
  check(
    typeof rawError?.details === 'string' && rawError.details.includes('Failing row contains'),
    'L3 lỗi gốc của Postgres đúng là có "Failing row contains" (rủi ro có thật)',
  );
  const repo = createOrderRepository(client);
  const caught = await repo
    .placeOrder(u, {
      idempotencyKey: randomUUID(),
      fingerprint: before.out_fingerprint,
      name: RECIPIENT[0],
      phone: '12345',
      address: RECIPIENT[2],
    })
    .catch((e) => e);
  const dump = `${caught?.name} ${caught?.message} ${JSON.stringify({ ...caught })} ${caught?.stack}`;
  check(
    caught?.name === 'OrderRepositoryError' &&
      caught.code === '23514' &&
      !dump.includes('Failing row') &&
      !dump.includes(RECIPIENT[1]) &&
      !dump.includes(RECIPIENT[2]),
    'L4 repository thật: lỗi chỉ còn mã 23514, không có dữ liệu cá nhân (AC-17)',
  );

  // Tổng > 2^31 và bigint qua supabase-js (đặt số lượng 30 x 100.000.000 bằng giới hạn do script truyền).
  u = await mkUser();
  p = await mkProduct(100_000_000);
  await add(u, p, 999, 30);
  await setQ(u, p, 30, 999);
  const big = await cart(u);
  const bigOrder = await place(u, big.out_fingerprint);
  const got = await repo.findByUser(u, bigOrder.out_order_id);
  check(
    bigOrder.out_status === 'ok' &&
      got?.totalVnd === 3_000_000_000 &&
      typeof got.totalVnd === 'number' &&
      got.items[0].lineTotalVnd === 3_000_000_000 &&
      got.itemCount === 30,
    'L5 tổng 3 x 10^9 (> 2^31) qua supabase-js thành number đúng (bigint)',
    got && { total: got.totalVnd, type: typeof got.totalVnd },
  );

  // Đọc đơn qua repository thật: embed order_items -> products, stillOnSale, phân trang, PGRST103.
  u = await mkUser();
  const p1 = await mkProduct(199000);
  const p2 = await mkProduct(450000);
  await add(u, p1);
  await add(u, p1);
  await add(u, p2);
  const placed = await place(u, (await cart(u)).out_fingerprint);
  await softDelete(p1);
  await setPrice(p2, 999000);
  const detail = await repo.findByUser(u, placed.out_order_id);
  check(
    detail?.items.length === 2 &&
      detail.totalVnd === 848000 &&
      detail.items.some(
        (i) =>
          i.unitPriceVnd === 199000 && i.quantity === 2 && i.stillOnSale === false && i.imagePath,
      ) &&
      detail.items.some((i) => i.unitPriceVnd === 450000 && i.stillOnSale === true),
    'L6 repository thật: embed trả bản chụp giá, tên; stillOnSale đúng; ảnh vẫn có sau xóa mềm (AC-09)',
  );
  const other = await mkUser();
  check(
    (await repo.findByUser(other, placed.out_order_id)) === null,
    'L7 đơn của người khác trả null (404), không phân biệt với đơn không tồn tại (AC-15)',
  );
  // 3 đơn nữa để thử phân trang.
  for (let i = 0; i < 2; i += 1) {
    const p3 = await mkProduct(100000);
    await add(u, p3);
    await place(u, (await cart(u)).out_fingerprint);
  }
  const page1 = await repo.listByUser(u, { page: 1, limit: 2 });
  const page2 = await repo.listByUser(u, { page: 2, limit: 2 });
  const beyond = await repo.listByUser(u, { page: 9, limit: 2 });
  check(
    page1.rows.length === 2 &&
      page2.rows.length === 1 &&
      page1.total === 3 &&
      beyond.rows.length === 0 &&
      beyond.total === 3 &&
      page1.rows[0].orderNo > page1.rows[1].orderNo &&
      !('recipient' in page1.rows[0]),
    'L8 phân trang trên DB thật: mới nhất trước, trang vượt tổng trả rows rỗng và total thật (PGRST103), danh sách không có thông tin nhận hàng (AC-19)',
    {
      p1: page1.rows.length,
      p2: page2.rows.length,
      beyond: beyond.rows.length,
      total: beyond.total,
    },
  );

  // Quyền: service_role không sửa, xóa được đơn (D-138).
  const patch = await client.from('orders').update({ total_vnd: 1 }).eq('id', placed.out_order_id);
  const del = await client.from('orders').delete().eq('id', placed.out_order_id);
  const patchItem = await client
    .from('order_items')
    .update({ quantity: 99 })
    .eq('order_id', placed.out_order_id);
  const delItem = await client.from('order_items').delete().eq('order_id', placed.out_order_id);
  check(
    [patch, del, patchItem, delItem].every((r) => r.error?.code === '42501'),
    'L9 service_role không UPDATE, DELETE được orders, order_items (D-138)',
    [patch, del, patchItem, delItem].map((r) => r.error?.code),
  );
  const still = await repo.findByUser(u, placed.out_order_id);
  check(still?.totalVnd === 848000, 'L10 đơn vẫn nguyên sau các lần sửa, xóa bị từ chối');

  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (anonKey) {
    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    };
    const base = `${env.SUPABASE_URL}/rest/v1`;
    const calls = [
      await fetch(`${base}/orders?select=id`, { headers }),
      await fetch(`${base}/order_items?select=order_id`, { headers }),
      await fetch(`${base}/rpc/place_order`, {
        method: 'POST',
        headers,
        body: JSON.stringify(placeArgs(randomUUID(), 'x', randomUUID())),
      }),
    ];
    check(
      calls.every((r) => r.status === 401 || r.status === 403),
      'L11 anon không đọc được orders, order_items và không gọi được place_order (AC-15)',
      calls.map((r) => r.status),
    );
  } else {
    console.log('  bỏ qua L11 (đặt SUPABASE_ANON_KEY trong shell để kiểm anon)');
  }
}

// ---------------------------------------------------------------------------
const t0 = Date.now();
const outcomes = {};
try {
  await withDb(async (db) => {
    const swept = await sweep(db);
    console.log(`Dọn dữ liệu sót của lần chạy trước (theo tiền tố): ${JSON.stringify(swept)}`);
    const { rows: running } = await db.query(
      `select count(*)::int n from public.tryon_jobs where status = 'running'`,
    );
    if (running[0].n > 0)
      throw new Error(`Đang có ${running[0].n} job running ở DB (server khác đang chạy?). Dừng.`);
  });
  budgetSnapshot = unwrap(await client.from('tryon_budget_months').select('*'));
  await scenarioA();
  await scenarioB();
  outcomes.C = await scenarioC();
  outcomes.D = await scenarioD();
  outcomes.E = await scenarioE();
  outcomes.F = await scenarioF();
  await scenarioK();
  await scenarioG();
  await scenarioH();
  await scenarioI();
  await scenarioJ();
  await scenarioL();
  // Mỗi phép đua phải cho thấy cả hai thứ tự thắng ít nhất một lần trong cả lượt (K kiểm hai thứ tự một cách tất định).
  check(
    outcomes.C.placeFirst > 0 && outcomes.C.addFirst > 0,
    'C cả hai thứ tự thắng đều xảy ra',
    outcomes.C,
  );
  check(
    outcomes.D.placeFirst > 0 && outcomes.D.setFirst > 0,
    'D cả hai thứ tự thắng đều xảy ra',
    outcomes.D,
  );
  check(
    outcomes.E.oldPrice > 0 && outcomes.E.refused > 0,
    'E cả hai thứ tự thắng đều xảy ra',
    outcomes.E,
  );
  check(
    outcomes.F.ordered > 0 && outcomes.F.refused > 0,
    'F cả hai thứ tự thắng đều xảy ra',
    outcomes.F,
  );
  check(sqlErrors === 0, 'không có lỗi SQL ngoài dự kiến ở mọi kịch bản', sqlErrors);
  check(deadlocks === 0, 'không có deadlock (40P01)', deadlocks);
} catch (err) {
  failures += 1;
  console.error('Lỗi khi chạy:', err?.code ?? '', err?.message ?? err);
} finally {
  try {
    // Sổ ngân sách try-on: khôi phục đúng như trước khi chạy (J tạo job có đặt chỗ ngân sách).
    await client.from('tryon_budget_months').delete().gte('month', '2000-01-01');
    if (budgetSnapshot.length) {
      const { error } = await client.from('tryon_budget_months').insert(budgetSnapshot);
      if (error) {
        failures += 1;
        console.log(`  không khôi phục được sổ ngân sách (${error.code})`);
      }
    }
    const left = await withDb(async (db) => {
      const swept = await sweep(db);
      return { swept, residual: await residual(db) };
    });
    console.log(`\nDọn dẹp: đã xóa ${JSON.stringify(left.swept)}`);
    console.log(`cleanup residual: ${JSON.stringify(left.residual)}`);
    const clean = Object.values(left.residual).every((n) => n === 0);
    check(
      clean,
      'dọn sạch: không còn user, sản phẩm, danh mục, đơn của lần chạy này',
      left.residual,
    );
  } catch (err) {
    failures += 1;
    console.error('Dọn dẹp lỗi:', err?.code ?? '', err?.message ?? err);
  }
}
console.log(
  `\nresult: ${pass} passed, ${failures} failed; sql errors ${sqlErrors}; deadlocks ${deadlocks}; ${Math.round((Date.now() - t0) / 1000)}s`,
);
process.exitCode = failures === 0 && sqlErrors === 0 ? 0 : 1;
