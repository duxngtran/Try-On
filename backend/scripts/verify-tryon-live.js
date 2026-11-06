// Kiểm tra thật trên Supabase dev (T-75, US-05). Chạy khi cần: npm run verify:tryon
// Tắt server dev trước khi chạy (worker của server sẽ nhận job của script).
//
// Phần A: song song qua PostgREST + Supavisor (cùng khóa, lượt cuối, ngân sách, claim, complete đua với 5 thao tác
//         hủy hiệu lực, tải hỗn hợp). Chuyển từ sprint-03/design/db/checks/concurrency-test.mjs, chỉ dòng DB tổng hợp.
// Phần B: luồng đầy đủ qua API thật với adapter GIẢ: consent -> job -> worker -> ảnh có signed URL -> rút consent
//         -> kết quả về muộn bị bỏ -> xóa file. Dùng ảnh tổng hợp sinh bằng sharp, email pm-*@example.com.
// Phần C: quyền truy cập (RLS, EXECUTE, bucket private). Cần DATABASE_URL (đã có cho migrate); anon key tùy chọn.
//
// KHÔNG gọi dịch vụ AI thật: TRYON_PROVIDER bị ép về fake, script từ chối chạy nếu adapter không phải fake.
// Tự dọn mọi dữ liệu, file và khôi phục sổ ngân sách. Không log ảnh, đường dẫn, signed URL, token.
process.env.TRYON_PROVIDER = 'fake';
delete process.env.FASHN_API_KEY;

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { buildServices } from '../src/config/container.js';
import { getEnv } from '../src/config/env.js';
import { getSupabase } from '../src/config/supabase.js';
import { createCategoryRepository } from '../src/repositories/categoryRepository.js';
import { createProductRepository } from '../src/repositories/productRepository.js';
import { createProfileRepository } from '../src/repositories/profileRepository.js';
import { createTryonRepository } from '../src/repositories/tryonRepository.js';
import { createUserRepository } from '../src/repositories/userRepository.js';
import { createPhotoStorage } from '../src/services/storage.js';
import { buildTryonConfig } from '../src/services/tryon/config.js';
import { createFakeProvider } from '../src/services/tryon/fakeProvider.js';
import { decodeCursor } from '../src/validation/tryonSchemas.js';

const baseEnv = getEnv();
if (baseEnv.TRYON_PROVIDER !== 'fake') throw new Error('Chỉ chạy với adapter giả');
const client = getSupabase();
const baseConfig = buildTryonConfig(baseEnv);
const tag = Date.now().toString(36);
const HASH = `$2b$10$${'a'.repeat(53)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
let sqlErrors = 0;
let deadlocks = 0;
const check = (ok, message, extra) => {
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${message}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ''}`,
  );
};

const created = { users: [], products: [], categories: [] };
let budgetSnapshot = [];

// ---------------------------------------------------------------------------
// Helper dùng chung
// ---------------------------------------------------------------------------
const unwrap = ({ data, error }) => {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
};
const rows = (data) => (Array.isArray(data) ? data : data == null ? [] : [data]);
const rpc = async (fn, args) => unwrap(await client.rpc(fn, args));
/** Bắt lỗi SQL, đếm riêng deadlock (40P01), trả null để vòng lặp chạy tiếp. */
const safely = (promise) =>
  promise.catch((err) => {
    sqlErrors += 1;
    if (err.code === '40P01') deadlocks += 1;
    console.log(`  LỖI SQL ${err.code ?? ''} ${String(err.message).slice(0, 120)}`);
    return null;
  });
const countRows = async (table, build) => {
  const { count, error } = await build(
    client.from(table).select('*', { count: 'exact', head: true }),
  );
  if (error) throw error;
  return count ?? 0;
};
const repoWith = (overrides = {}) => createTryonRepository(client, { ...baseConfig, ...overrides });

async function newCategory(label) {
  const row = await createCategoryRepository(client).insert(`VERIFY-${tag}-${label}`.slice(0, 50));
  created.categories.push(row.id);
  return row;
}

let userSeq = 0;
async function newUser(label = 'u') {
  const row = unwrap(
    await client
      .from('users')
      .insert({
        email: `pm-tryon-${tag}-${label}-${(userSeq += 1)}@example.com`,
        password_hash: HASH,
      })
      .select('id')
      .single(),
  );
  created.users.push(row.id);
  return row.id;
}

/** Người mua đủ điều kiện ở mức DB: số đo, consent ảnh, đường dẫn ảnh giả, consent try-on. */
async function newBuyerRow() {
  const id = await newUser('sql');
  unwrap(
    await client
      .from('profiles')
      .update({
        height_cm: 170,
        weight_kg: 60,
        photo_consent_at: new Date().toISOString(),
        photo_consent_version: 1,
      })
      .eq('user_id', id),
  );
  await rpc('set_profile_photo', { p_user_id: id, p_new_path: `${id}/${randomUUID()}.jpg` });
  await rpc('accept_tryon_consent', { p_user_id: id, p_version: 1 });
  return id;
}

let sqlCategory;
async function newProductRow() {
  sqlCategory ??= await newCategory('sql');
  const id = randomUUID();
  const status = firstOf(
    await rpc('create_product', {
      p_id: id,
      p_name: `VERIFY ${tag}`,
      p_price_vnd: 100000,
      p_category_id: sqlCategory.id,
      p_image_path: `${id}/${randomUUID()}.jpg`,
    }),
  ).out_status;
  if (status !== 'ok') throw new Error(`create_product: ${status}`);
  created.products.push(id);
  return id;
}
const firstOf = (data) => rows(data)[0];

/** Đưa mọi job của dữ liệu thử về trạng thái sạch và xóa sổ ngân sách, để mỗi kịch bản bắt đầu từ 0. */
async function resetScenario() {
  if (created.users.length) {
    unwrap(
      await client
        .from('tryon_jobs')
        .update({
          status: 'canceled',
          finished_at: new Date().toISOString(),
          charged_at: null,
          error_code: null,
        })
        .in('user_id', created.users)
        .in('status', ['queued', 'running']),
    );
  }
  unwrap(await client.from('tryon_budget_months').delete().gte('month', '2000-01-01'));
}
const budgetNow = async () => {
  const all = unwrap(
    await client.from('tryon_budget_months').select('spent_micro_usd, reserved_micro_usd'),
  );
  return {
    spent: all.reduce((s, r) => s + Number(r.spent_micro_usd), 0),
    reserved: all.reduce((s, r) => s + Number(r.reserved_micro_usd), 0),
  };
};

// ---------------------------------------------------------------------------
// Phần A: song song qua PostgREST + Supavisor
// ---------------------------------------------------------------------------
async function partA() {
  console.log('\n== A. Song song qua PostgREST + Supavisor ==');
  const repo = repoWith();

  // A1: cùng khóa
  let bad = 0;
  const A1_ROUNDS = 8;
  for (let round = 0; round < A1_ROUNDS; round += 1) {
    const user = await newBuyerRow();
    const product = await newProductRow();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        safely(repo.createJob({ userId: user, productId: product, purpose: 'display' })),
      ),
    );
    const made = results.filter((r) => r?.status === 'created').length;
    const ids = new Set(results.map((r) => r?.jobId));
    if (made !== 1 || ids.size !== 1) bad += 1;
  }
  check(
    bad === 0,
    `A1 cùng khóa (D-75, AC-06): ${A1_ROUNDS} vòng x 20 request song song, đúng 1 created, mọi request cùng job id`,
    bad,
  );
  await resetScenario();

  // A2: lượt cuối, khác sản phẩm
  bad = 0;
  const A2_ROUNDS = 8;
  const lastSlot = repoWith({ dailyLimit: 1 });
  for (let round = 0; round < A2_ROUNDS; round += 1) {
    const user = await newBuyerRow();
    const products = await Promise.all(Array.from({ length: 4 }, newProductRow));
    const results = await Promise.all(
      products.map((p) =>
        safely(lastSlot.createJob({ userId: user, productId: p, purpose: 'display' })),
      ),
    );
    if (results.filter((r) => r?.status === 'created').length !== 1) bad += 1;
  }
  check(
    bad === 0,
    `A2 lượt cuối (D-77, AC-17): ${A2_ROUNDS} vòng x 4 request, đúng 1 job giữ được lượt`,
    bad,
  );
  await resetScenario();

  // A3: ngân sách dừng cứng, nhiều người
  const tight = repoWith({ budgetLimitMicroUsd: 750_000 }); // đủ đúng 10 ảnh ở $0.075
  const users = await Promise.all(Array.from({ length: 40 }, newBuyerRow));
  const product = await newProductRow();
  const resultsC = await Promise.all(
    users.map((u) =>
      safely(tight.createJob({ userId: u, productId: product, purpose: 'display' })),
    ),
  );
  const made = resultsC.filter((r) => r?.status === 'created').length;
  const exceeded = resultsC.filter((r) => r?.status === 'budget_exceeded').length;
  const warned = resultsC.filter((r) => r?.budgetWarning).length;
  const budget = await budgetNow();
  check(
    made === 10 && exceeded === 30,
    `A3 ngân sách (D-94): 40 request, giới hạn đủ 10 ảnh -> ${made} created, ${exceeded} budget_exceeded`,
    { made, exceeded },
  );
  check(
    budget.reserved + budget.spent === 750_000,
    `A3 sổ ngân sách đúng tới đồng micro (${budget.reserved + budget.spent})`,
    budget,
  );
  check(warned === 1, `A3 cảnh báo 80% đúng một lần (${warned})`);
  await resetScenario();

  // A4: claim song song
  const claimUsers = await Promise.all(Array.from({ length: 8 }, newBuyerRow));
  const claimProducts = await Promise.all(Array.from({ length: 3 }, newProductRow));
  for (const u of claimUsers) {
    for (const p of claimProducts)
      await repo.createJob({ userId: u, productId: p, purpose: 'display' });
  }
  const claimed = (await Promise.all(Array.from({ length: 10 }, () => safely(repo.claimJobs(10)))))
    .flat()
    .filter(Boolean);
  const runningRows = unwrap(
    await client
      .from('tryon_jobs')
      .select('user_id')
      .in('user_id', claimUsers)
      .eq('status', 'running'),
  );
  const perUser = new Map();
  for (const r of runningRows) perUser.set(r.user_id, (perUser.get(r.user_id) ?? 0) + 1);
  check(
    runningRows.length === 6 && claimed.length === 6,
    `A4 claim song song (D-90): 10 worker, 24 job -> ${runningRows.length} running, ${claimed.length} được nhận`,
    { running: runningRows.length, claimed: claimed.length },
  );
  check(
    Math.max(...perUser.values()) <= 2,
    `A4 mỗi người tối đa 2 job đang chạy (max ${Math.max(...perUser.values())})`,
  );
  await resetScenario();

  // A5: complete đua với 5 thao tác hủy hiệu lực
  const kinds = {
    'rút consent': (u) => rpc('withdraw_tryon_consent', { p_user_id: u }),
    'rút rồi đồng ý lại': async (u) => {
      await rpc('withdraw_tryon_consent', { p_user_id: u });
      await rpc('accept_tryon_consent', { p_user_id: u, p_version: 1 });
    },
    'thay ảnh hồ sơ': (u) =>
      rpc('set_profile_photo', { p_user_id: u, p_new_path: `${u}/${randomUUID()}.jpg` }),
    'thay ảnh sản phẩm': (u, p) =>
      rpc('update_product', {
        p_id: p,
        p_name: null,
        p_price_vnd: null,
        p_category_id: null,
        p_new_image_path: `${p}/${randomUUID()}.jpg`,
      }),
    'xóa mềm sản phẩm': async (u, p) =>
      unwrap(
        await client.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', p),
      ),
  };
  // Mỗi đợt 6 vòng chạy SONG SONG (giới hạn 6 job đang gửi toàn hệ thống), nên vừa nhanh vừa đua nhiều hơn.
  const BATCH = 6;
  const BATCHES = 3;
  const ROUNDS_RACE = BATCH * BATCHES;
  const fakePaths = [];
  for (const [name, invalidate] of Object.entries(kinds)) {
    let leaks = 0;
    let completeWon = 0;
    let invalidateWon = 0;
    for (let batch = 0; batch < BATCHES; batch += 1) {
      const fixtures = await Promise.all(
        Array.from({ length: BATCH }, async () => {
          const u = await newBuyerRow();
          const p = await newProductRow();
          const job = (await repo.createJob({ userId: u, productId: p, purpose: 'display' })).jobId;
          return { u, p, job };
        }),
      );
      const claimed = new Set((await repo.claimJobs(BATCH)).map((c) => c.jobId));
      if (fixtures.some((f) => !claimed.has(f.job)))
        throw new Error('claimJobs không nhận đủ job của đợt');
      await Promise.all(fixtures.map((f) => repo.markSubmitted(f.job, 'prov')));
      const paths = fixtures.map((f) => `${f.u}/${randomUUID()}.jpg`);
      fakePaths.push(...paths);
      const reserved = await Promise.all(fixtures.map((f, i) => repo.reservePath(f.job, paths[i])));
      if (reserved.some((ok) => !ok)) throw new Error('reservePath bị từ chối');

      const outcomes = await Promise.all(
        fixtures.map(async (f, i) => {
          const complete = () =>
            safely(repo.completeJob({ jobId: f.job, path: paths[i], width: 864, height: 1296 }));
          const results = await Promise.all(
            i % 2 === 0
              ? [complete(), safely(invalidate(f.u, f.p))]
              : [safely(invalidate(f.u, f.p)), complete()],
          );
          return results[i % 2 === 0 ? 0 : 1];
        }),
      );
      for (const status of outcomes) {
        if (status === 'saved') completeWon += 1;
        else if (status === 'discarded') invalidateWon += 1;
      }
      for (let i = 0; i < fixtures.length; i += 1) {
        const { u, job } = fixtures[i];
        const images = await countRows('tryon_images', (q) => q.eq('user_id', u));
        const queued = await countRows('tryon_file_deletions', (q) =>
          q.eq('storage_path', paths[i]),
        );
        const row = unwrap(
          await client.from('tryon_jobs').select('charged_at').eq('id', job).single(),
        );
        if (images !== 0 || queued !== 1 || !row.charged_at) leaks += 1;
      }
    }
    check(
      leaks === 0,
      `A5 ${name}: ${ROUNDS_RACE} vòng (${BATCHES} đợt x ${BATCH} song song), không ảnh nào sống sót, file luôn vào hàng đợi, luôn tính lượt (complete thắng ${completeWon}, hủy hiệu lực thắng ${invalidateWon})`,
      leaks,
    );
    await resetScenario();
  }
  // Đã tổng hợp ở dòng trên; dọn hàng đợi xóa của đường dẫn giả (không có file thật).
  for (let i = 0; i < fakePaths.length; i += 50) {
    unwrap(
      await client
        .from('tryon_file_deletions')
        .delete()
        .in('storage_path', fakePaths.slice(i, i + 50)),
    );
  }

  // A6: tải hỗn hợp
  const mixedUsers = await Promise.all(Array.from({ length: 10 }, newBuyerRow));
  const mixedProducts = await Promise.all(Array.from({ length: 6 }, newProductRow));
  await resetScenario();
  const before = sqlErrors;
  const beforeDeadlocks = deadlocks;
  const ops = [];
  for (let i = 0; i < 400; i += 1) {
    const u = mixedUsers[i % mixedUsers.length];
    const p = mixedProducts[i % mixedProducts.length];
    const k = i % 8;
    ops.push(() =>
      safely(
        k === 0
          ? rpc('withdraw_tryon_consent', { p_user_id: u }).then(() =>
              rpc('accept_tryon_consent', { p_user_id: u, p_version: 1 }),
            )
          : k === 1
            ? repo.claimJobs(5)
            : k === 2
              ? repo.expireJobs()
              : k === 3
                ? rpc('update_product', {
                    p_id: p,
                    p_name: null,
                    p_price_vnd: null,
                    p_category_id: null,
                    p_new_image_path: `${p}/${randomUUID()}.jpg`,
                  })
                : k === 4
                  ? rpc('set_profile_photo', {
                      p_user_id: u,
                      p_new_path: `${u}/${randomUUID()}.jpg`,
                    })
                  : repo.createJob({
                      userId: u,
                      productId: p,
                      purpose: k === 5 ? 'prefetch' : 'display',
                    }),
      ),
    );
  }
  // 400 thao tác theo 4 đợt 100 song song: PostgREST có giới hạn kết nối, đợt nhỏ hơn không làm mất tính đua.
  for (let i = 0; i < ops.length; i += 100)
    await Promise.all(ops.slice(i, i + 100).map((run) => run()));
  check(
    sqlErrors === before && deadlocks === beforeDeadlocks,
    `A6 400 thao tác hỗn hợp song song: ${sqlErrors - before} lỗi SQL, ${deadlocks - beforeDeadlocks} deadlock (40P01)`,
  );

  // A7: sổ ngân sách nhất quán sau tải hỗn hợp
  for (const u of mixedUsers)
    await rpc('tryon_cancel_queued', { p_user_id: u, p_product_id: null, p_purpose: null });
  const stillRunning = unwrap(
    await client.from('tryon_jobs').select('id').in('user_id', mixedUsers).eq('status', 'running'),
  );
  for (const { id } of stillRunning)
    await rpc('fail_tryon_job', {
      p_job_id: id,
      p_error_code: 'TRYON_FAILED',
      p_cost_incurred: false,
      p_retry_seconds: null,
      p_max_attempts: 2,
    });
  const ledger = await budgetNow();
  check(
    ledger.reserved === 0,
    `A7 reserved về 0 khi mọi job đã kết thúc (${ledger.reserved})`,
    ledger,
  );
  await resetScenario();
}

// ---------------------------------------------------------------------------
// Phần B: luồng đầy đủ qua API thật, adapter giả
// ---------------------------------------------------------------------------
const synthetic = {
  portrait: () =>
    sharp({ create: { width: 800, height: 1400, channels: 3, background: '#c9b79c' } })
      .withExif({
        IFD0: { Copyright: 'verify-metadata' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '10/1 0/1 0/1' },
      })
      .jpeg()
      .toBuffer(),
  flat: (r) =>
    sharp({ create: { width: 512, height: 512, channels: 3, background: { r, g: 90, b: 140 } } })
      .jpeg()
      .toBuffer(),
};

async function partB() {
  console.log('\n== B. Luồng đầy đủ qua API thật, adapter giả ==');
  const logLines = [];
  const logger = {
    error: (event, meta) => logLines.push({ event, meta }),
    warn: (event, meta) => logLines.push({ event, meta }),
    info: (event, meta) => logLines.push({ event, meta }),
  };
  const clock = { t: Date.now(), now: () => clock.t, advance: (ms) => (clock.t += ms) };
  const env = {
    ...baseEnv,
    TRYON_DAILY_LIMIT: 3,
    TRYON_PREFETCH_MIN_REMAINING: 0,
    TRYON_MONTHLY_BUDGET_USD: 1000,
  };
  const config = buildTryonConfig(env);
  const productRepository = createProductRepository(client);
  const provider = createFakeProvider({
    delayMs: 30_000,
    now: clock.now,
    resolveScenario: async ({ garmentImageUrl }) => {
      const id = /([0-9a-f-]{36})\/[0-9a-f-]{36}\.jpg$/.exec(garmentImageUrl)?.[1];
      return id ? (await productRepository.findById(id))?.name : null;
    },
  });
  if (provider.name !== 'fake') throw new Error('adapter không phải fake');
  const tryonStorage = createPhotoStorage({
    client,
    bucket: env.TRYON_IMAGE_BUCKET,
    signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
  });
  let uploadCount = 0;
  const realUploadAt = tryonStorage.uploadAt;
  tryonStorage.uploadAt = (...args) => {
    uploadCount += 1;
    return realUploadAt(...args);
  };
  const services = await buildServices(env, {
    userRepository: createUserRepository(client),
    profileRepository: createProfileRepository(client),
    categoryRepository: createCategoryRepository(client),
    productRepository,
    tryonRepository: createTryonRepository(client, config),
    supabase: client,
    provider,
    tryonStorage,
    logger,
    startSweeper: false,
    startWorker: false, // tick do script điều khiển, không có timer nền
  });
  const app = createApp({ corsOrigin: env.CORS_ORIGIN, services, logger });
  const { worker, cleanup } = services.tryon;
  const productService = services.products.productService;

  try {
    // --- dữ liệu ---
    const newApiBuyer = async (label, { complete = true } = {}) => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ email: `pm-tryon-${tag}-${label}@example.com`, password: 'Abc12345x' });
      if (reg.status !== 201) throw new Error(`đăng ký ${label}: ${reg.status}`);
      const id = reg.body.data.user.id;
      created.users.push(id);
      const headers = { Authorization: `Bearer ${reg.body.data.token}` };
      const buyer = {
        userId: id,
        auth: headers,
        get: (url) => request(app).get(url).set(headers),
        post: (url, body) => request(app).post(url).set(headers).send(body),
        del: (url) => request(app).delete(url).set(headers),
      };
      if (complete) {
        unwrap(
          await client
            .from('profiles')
            .update({ height_cm: 165, weight_kg: 52.5 })
            .eq('user_id', id),
        );
        await buyer.post('/api/profile/photo-consent', { accepted: true });
        const photo = await request(app)
          .put('/api/profile/photo')
          .set(headers)
          .attach('photo', await synthetic.portrait(), 'p.jpg');
        if (photo.status !== 200) throw new Error(`ảnh hồ sơ ${label}: ${photo.status}`);
        await buyer.post('/api/try-on/consent', { accepted: true });
      }
      return buyer;
    };
    const buyerOne = await newApiBuyer('e2e', { complete: false });
    const { userId, auth } = buyerOne;
    const api = buyerOne;

    const category = await newCategory('e2e');
    const productInput = (name) => ({
      name: `${name} ${tag}`,
      priceVnd: 150000,
      categoryId: category.id,
    });
    const p1 = await productService.create(productInput('VERIFY A'), await synthetic.flat(40));
    const p2 = await productService.create(productInput('VERIFY B'), await synthetic.flat(80));
    const p3 = await productService.create(
      productInput('FAKE-BLOCKED C'),
      await synthetic.flat(120),
    );
    for (const p of [p1, p2, p3]) created.products.push(p.id);

    const tick = async () => {
      await worker.tick();
    };
    const finishAll = async (ownerId = userId) => {
      for (let i = 0; i < 6; i += 1) {
        clock.advance(31_000);
        await tick();
        const live = await countRows('tryon_jobs', (q) =>
          q.eq('user_id', ownerId).in('status', ['queued', 'running']),
        );
        if (live === 0) return;
        await sleep(2100); // DB dùng đồng hồ thật cho lịch poll
      }
    };
    const tryonFiles = async () => {
      const { data, error } = await client.storage.from(baseEnv.TRYON_IMAGE_BUCKET).list(userId);
      if (error) throw error;
      return data.filter((f) => f.name);
    };

    // --- hồ sơ chưa đủ -> 409, không tốn gì ---
    const missing = await api.post(`/api/try-on/products/${p1.id}/jobs`, {});
    check(
      missing.status === 409 &&
        missing.body.error.code === 'PROFILE_INCOMPLETE' &&
        missing.body.error.details.missing.length === 2,
      'B1 hồ sơ chưa đủ: 409 PROFILE_INCOMPLETE kèm phần thiếu',
      missing.body,
    );

    unwrap(
      await client
        .from('profiles')
        .update({ height_cm: 165, weight_kg: 52.5 })
        .eq('user_id', userId),
    ); // số đo; ảnh qua API
    await api.post('/api/profile/photo-consent', { accepted: true });
    const up = await request(app)
      .put('/api/profile/photo')
      .set(auth)
      .attach('photo', await synthetic.portrait(), 'p.jpg');
    check(up.status === 200, 'B2 tải ảnh hồ sơ tổng hợp', up.status);

    // --- chưa consent AI -> 403, dịch vụ không nhận gì ---
    const noConsent = await api.post(`/api/try-on/products/${p1.id}/jobs`, {});
    const noConsentResult = await api.get(`/api/try-on/products/${p1.id}/result`);
    check(
      noConsent.status === 403 &&
        noConsent.body.error.code === 'TRYON_CONSENT_REQUIRED' &&
        noConsentResult.status === 403,
      'B3 chưa consent: 403 TRYON_CONSENT_REQUIRED ở /jobs và /result',
    );
    check(provider.calls.length === 0, 'B3 dịch vụ chưa nhận lệnh nào');

    const state0 = await api.post('/api/try-on/consent', { accepted: true });
    const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
    check(
      state0.status === 200 &&
        state0.body.data.consent.accepted &&
        iso.test(state0.body.data.consent.acceptedAt) &&
        iso.test(state0.body.data.quota.dailyResetsAt) &&
        iso.test(state0.body.data.quota.monthlyResetsAt),
      'B4 consent: state đúng, mọi timestamp dạng ISO ...Z (bài học timestamp)',
      state0.body.data?.consent,
    );

    // --- danh mục, con trỏ trên DB thật ---
    const cats = await api.get('/api/try-on/categories');
    check(
      cats.body.data.categories.some((c) => c.id === category.id && c.productCount === 3),
      'B5 danh mục có sản phẩm xuất hiện với productCount đúng',
    );
    const dbOrder = unwrap(
      await client
        .from('products')
        .select('id')
        .eq('category_id', category.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    ).map((r) => r.id);
    const seen = [];
    let nextCursor = null;
    let pages = 0;
    do {
      const res = await api.get(
        `/api/try-on/categories/${category.id}/products?limit=1${nextCursor ? `&after=${nextCursor}` : ''}`,
      );
      if (res.status !== 200) throw new Error(`products ${res.status}`);
      seen.push(...res.body.data.items.map((i) => i.id));
      nextCursor = res.body.data.nextCursor;
      pages += 1;
    } while (nextCursor && pages < 10);
    check(
      JSON.stringify(seen) === JSON.stringify(dbOrder),
      'B5 duyệt bằng con trỏ trên DB thật: đúng thứ tự created_at, id giảm dần, không lặp, không sót',
      { seen: seen.length, db: dbOrder.length },
    );
    const first = (await api.get(`/api/try-on/categories/${category.id}/products?limit=1`)).body
      .data;
    const cursor = decodeCursor(first.nextCursor);
    check(
      /\.\d{4,6}\+00$/.test(cursor.createdAt),
      'B5 con trỏ giữ độ chính xác micro giây của SQL (không qua Date)',
      cursor.createdAt,
    );
    const back = (
      await api.get(
        `/api/try-on/categories/${category.id}/products?limit=1&before=${(await api.get(`/api/try-on/categories/${category.id}/products?limit=1&after=${first.nextCursor}`)).body.data.prevCursor}`,
      )
    ).body.data;
    check(back.items[0]?.id === dbOrder[0], 'B5 đi lùi bằng before về đúng sản phẩm đầu');
    const at = (
      await api.get(`/api/try-on/categories/${category.id}/products?at=${dbOrder[1]}&limit=2`)
    ).body.data;
    check(
      at.items[0].id === dbOrder[1] &&
        at.anchor.found &&
        !at.anchor.deleted &&
        at.items[0].position === 2,
      'B5 `at` bắt đầu đúng sản phẩm, position đúng',
    );
    const outOfRange = await api.get(
      `/api/try-on/categories/${category.id}/products?limit=50&after=${(await api.get(`/api/try-on/categories/${category.id}/products?limit=2`)).body.data.nextCursor}`,
    );
    check(
      outOfRange.status === 200,
      'B5 trang cuối/vượt phạm vi không gây 500 (bài học PGRST103)',
      outOfRange.status,
    );

    // --- tạo job, không sinh trùng, worker, ảnh ---
    const target = p1.id;
    const parallel = await Promise.all(
      Array.from({ length: 5 }, () =>
        api.post(`/api/try-on/products/${target}/jobs`, { purpose: 'display' }),
      ),
    );
    const ids = new Set(parallel.map((r) => r.body.data?.job?.id));
    check(
      parallel.every((r) => r.status === 202) && ids.size === 1,
      'B6 5 request song song cùng khóa: cùng một job, 202',
      parallel.map((r) => r.status),
    );
    const jobId = [...ids][0];
    await tick();
    const running = unwrap(
      await client.from('tryon_jobs').select('status, provider').eq('id', jobId).single(),
    );
    check(
      running.status === 'running' && running.provider === 'fake',
      'B6 worker nhận job và gửi bằng adapter giả',
    );
    const call = provider.calls.at(-1);
    const sent = await sharp(call.modelImage).metadata();
    check(
      provider.calls.length === 1 &&
        Object.keys(call).sort().join() === 'garmentImageUrl,modelImage' &&
        !sent.exif &&
        Math.max(sent.width, sent.height) <= baseEnv.FASHN_MODEL_IMAGE_MAX_SIDE,
      'B6 request chỉ có ảnh người (không EXIF/GPS, đã thu nhỏ) và URL ảnh sản phẩm (AC-19)',
    );
    await finishAll();
    const done = await api.get(`/api/try-on/jobs/${jobId}`);
    const image = done.body.data.job.image;
    check(
      done.body.data.job.status === 'succeeded' &&
        image?.width === 864 &&
        image?.height === 1296 &&
        iso.test(done.body.data.job.createdAt),
      'B6 job succeeded, ảnh 864x1296, createdAt ISO',
      done.body.data.job,
    );

    // Ảnh thật sự ở Storage private, đọc được qua signed URL, không metadata
    const signed = await fetch(image.url);
    const bytes = Buffer.from(await signed.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    check(
      signed.status === 200 && meta.format === 'jpeg' && !meta.exif,
      'B7 signed URL tải được JPEG, không còn EXIF (fake provider có ghi EXIF)',
      { status: signed.status, exif: Boolean(meta.exif) },
    );
    const files = await tryonFiles();
    check(
      files.length === 1,
      `B7 bucket tryon-images có đúng 1 file của người này (${files.length})`,
    );
    const publicTry = await fetch(
      `${baseEnv.SUPABASE_URL}/storage/v1/object/public/${baseEnv.TRYON_IMAGE_BUCKET}/${userId}/${files[0].name}`,
    );
    check(
      publicTry.status !== 200,
      `B7 đường dẫn public của bucket private bị từ chối (HTTP ${publicTry.status})`,
    );
    const bucketInfo = unwrap(await client.storage.getBucket(baseEnv.TRYON_IMAGE_BUCKET));
    check(bucketInfo.public === false, 'B7 bucket tryon-images private');
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (anonKey) {
      const h = {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'content-type': 'application/json',
      };
      const list = await fetch(
        `${baseEnv.SUPABASE_URL}/storage/v1/object/list/${baseEnv.TRYON_IMAGE_BUCKET}`,
        { method: 'POST', headers: h, body: JSON.stringify({ prefix: userId, limit: 10 }) },
      );
      const listBody = await list.json().catch(() => null);
      check(
        Array.isArray(listBody) ? listBody.length === 0 : list.status >= 400,
        `B7 anon liệt kê bucket không thấy file (HTTP ${list.status})`,
      );
    }

    const again = await api.post(`/api/try-on/products/${target}/jobs`, {});
    check(
      again.status === 200 && again.body.data.state === 'ready' && provider.calls.length === 1,
      'B8 xem lại: ready, dịch vụ không được gọi thêm (AC-04)',
    );
    const usage1 = (await api.get('/api/try-on/state')).body.data.quota;
    check(
      usage1.dailyUsed === 1 && usage1.held === 0 && usage1.remaining === 2,
      'B8 tính đúng 1 lượt',
      usage1,
    );

    // --- kết quả về muộn bị bỏ (AC-11) và rút consent (AC-10) ---
    const late = await api.post(`/api/try-on/products/${p2.id}/jobs`, {});
    await tick(); // đã gửi
    const lateJobId = late.body.data.job.id;
    const withdrawn = await api.del('/api/try-on/consent');
    check(
      withdrawn.status === 200 && withdrawn.body.data.consent.accepted === false,
      'B9 rút consent: 200, accepted=false',
    );
    await cleanup.kick(); // chờ hàng đợi xóa chạy xong (kick nền của request có thể đang chạy)
    check(
      (await tryonFiles()).length === 0,
      'B9 rút consent xóa ảnh try-on khỏi Storage (sau khi hàng đợi chạy)',
    );
    const photoStill = unwrap(
      await client.from('profiles').select('photo_path').eq('user_id', userId).single(),
    );
    check(Boolean(photoStill.photo_path), 'B9 ảnh hồ sơ còn nguyên (AC-10)');
    const midRead = await api.get(`/api/try-on/jobs/${lateJobId}`);
    check(
      midRead.body.data.job.status === 'discarded',
      'B9 job đang chạy đã hết hiệu lực báo discarded ngay để tab dừng chờ',
      midRead.body.data.job.status,
    );
    const uploadsBefore = uploadCount;
    clock.advance(31_000);
    await sleep(2100);
    await tick(); // kết quả về
    await cleanup.kick();
    check(
      uploadCount === uploadsBefore,
      'B9 kết quả về muộn: worker không upload gì (reserve_tryon_result_path trả false)',
      { uploadsBefore, uploadCount },
    );
    const lateRow = unwrap(
      await client
        .from('tryon_jobs')
        .select('status, charged_at, cost_incurred')
        .eq('id', lateJobId)
        .single(),
    );
    check(
      lateRow.status === 'discarded' && lateRow.charged_at && lateRow.cost_incurred,
      'B9 kết quả về muộn: discarded, vẫn tính lượt và ngân sách (R11, D-107)',
      lateRow,
    );
    check(
      (await tryonFiles()).length === 0 &&
        (await countRows('tryon_images', (q) => q.eq('user_id', userId))) === 0,
      'B9 không có file nào trong bucket, không có dòng tryon_images',
    );
    check(
      (await countRows('tryon_file_deletions', (q) => q.like('storage_path', `${userId}/%`))) === 0,
      'B9 hàng đợi xóa đã trống',
    );
    const r403 = await api.get(`/api/try-on/products/${p1.id}/result`);
    const j403 = await api.post(`/api/try-on/products/${p1.id}/jobs`, {});
    check(
      r403.status === 403 && j403.status === 403 && provider.calls.length === 2,
      'B9 sau khi rút: /result và /jobs đều 403, dịch vụ không nhận thêm lệnh',
    );

    // --- sinh lại sau khi đồng ý lại; thay ảnh hồ sơ xóa ảnh (AC-08) ---
    await api.post('/api/try-on/consent', { accepted: true });
    const regen = await api.post(`/api/try-on/products/${p1.id}/jobs`, {});
    check(regen.status === 202, 'B10 đồng ý lại: ảnh cũ đã mất nên sinh lại (202)', regen.status);
    await tick();
    await finishAll();
    check(
      (await api.get(`/api/try-on/products/${p1.id}/result`)).body.data.state === 'ready' &&
        (await tryonFiles()).length === 1,
      'B10 ảnh sinh lại có trong bucket',
    );
    const repl = await request(app)
      .put('/api/profile/photo')
      .set(auth)
      .attach('photo', await synthetic.portrait(), 'p2.jpg');
    await cleanup.kick();
    check(
      repl.status === 200 &&
        (await tryonFiles()).length === 0 &&
        (await api.get(`/api/try-on/products/${p1.id}/result`)).body.data.state === 'none',
      'B10 thay ảnh hồ sơ: trigger xóa ảnh try-on, file bị xóa sau khi hàng đợi chạy (AC-08)',
    );

    // --- hết lượt ngày: 429 có thời điểm hợp lệ (đã dùng 3: ready, discarded, sinh lại) ---
    const quotaState = (await api.get('/api/try-on/state')).body.data.quota;
    check(
      quotaState.dailyUsed === 3 && quotaState.remaining === 0,
      'B11 đã dùng đủ 3 lượt ngày (cả kết quả bị bỏ)',
      quotaState,
    );
    const over = await api.post(`/api/try-on/products/${p1.id}/jobs`, {});
    const details = over.body.error?.details;
    check(
      over.status === 429 &&
        over.body.error.code === 'TRYON_QUOTA_EXCEEDED' &&
        details.scope === 'day' &&
        details.retryAfterSeconds > 0 &&
        details.retryAfterSeconds <= 86_400 &&
        iso.test(details.resetsAt) &&
        Number(over.headers['retry-after']) === details.retryAfterSeconds,
      'B11 hết lượt: 429 TRYON_QUOTA_EXCEEDED, scope day, retryAfterSeconds + header Retry-After + resetsAt hợp lệ',
      details,
    );
    check(provider.calls.length === 3, 'B11 dịch vụ không bị gọi khi hết lượt');

    // --- người mua thứ hai (lượt riêng): bị chặn, hết hạn, job bỏ hoang ---
    const two = await newApiBuyer('e2e2');
    const budgetBefore = await budgetNow();

    const blockedJob = (await two.post(`/api/try-on/products/${p3.id}/jobs`, {})).body.data.job.id;
    await tick();
    await finishAll(two.userId);
    const blockedRead = (await two.get(`/api/try-on/jobs/${blockedJob}`)).body.data.job;
    check(
      blockedRead.status === 'failed' && blockedRead.error.code === 'TRYON_BLOCKED',
      'B12 bị bộ lọc an toàn: failed TRYON_BLOCKED',
      blockedRead,
    );
    const callsAfterBlocked = provider.calls.length;
    const blockedAgain = await two.post(`/api/try-on/products/${p3.id}/jobs`, {});
    const blockedResult = await two.get(`/api/try-on/products/${p3.id}/result`);
    const blockedRow = unwrap(
      await client
        .from('tryon_jobs')
        .select('charged_at, cost_incurred')
        .eq('id', blockedJob)
        .single(),
    );
    check(
      blockedAgain.status === 200 &&
        blockedAgain.body.data.state === 'blocked' &&
        blockedResult.body.data.state === 'blocked' &&
        provider.calls.length === callsAfterBlocked,
      'B12 ghi nhớ theo khóa trên DB thật: lần sau 200 blocked, không gọi dịch vụ',
    );
    check(
      blockedRow.charged_at === null && blockedRow.cost_incurred === false,
      'B12 bị chặn không tính lượt, không tính ngân sách',
      blockedRow,
    );

    const hang = await productService.create(
      productInput('FAKE-HANG D'),
      await synthetic.flat(160),
    );
    created.products.push(hang.id);
    const hangJob = (await two.post(`/api/try-on/products/${hang.id}/jobs`, {})).body.data.job.id;
    await tick(); // gửi
    unwrap(
      await client
        .from('tryon_jobs')
        .update({ deadline_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', hangJob),
    );
    await tick(); // expire_tryon_jobs
    const hangRead = (await two.get(`/api/try-on/jobs/${hangJob}`)).body.data.job;
    const hangRow = unwrap(
      await client
        .from('tryon_jobs')
        .select('charged_at, cost_incurred')
        .eq('id', hangJob)
        .single(),
    );
    check(
      hangRead.status === 'failed' && hangRead.error.code === 'TRYON_TIMEOUT',
      'B13 quá hạn 120 giây: failed TRYON_TIMEOUT, không kẹt',
      hangRead,
    );
    check(
      hangRow.charged_at === null && hangRow.cost_incurred === true,
      'B13 quá hạn sau khi gửi: không tính lượt nhưng tính ngân sách (D-98)',
      hangRow,
    );
    const budgetAfter = await budgetNow();
    check(
      budgetAfter.spent - budgetBefore.spent >= config.costMicroUsd &&
        budgetAfter.reserved === budgetBefore.reserved,
      'B13 giữ chỗ ngân sách chuyển thành đã chi, reserved không rò',
      { budgetBefore, budgetAfter },
    );

    const stale = await productService.create(
      productInput('Áo bỏ hoang'),
      await synthetic.flat(200),
    );
    created.products.push(stale.id);
    const callsBeforeStale = provider.calls.length;
    const staleJob = (await two.post(`/api/try-on/products/${stale.id}/jobs`, {})).body.data.job.id;
    unwrap(
      await client
        .from('tryon_jobs')
        .update({ last_seen_at: new Date(Date.now() - 10_000).toISOString() })
        .eq('id', staleJob),
    );
    await tick(); // claim_tryon_jobs hủy job không còn ai theo dõi
    const staleRow = unwrap(
      await client.from('tryon_jobs').select('status, charged_at').eq('id', staleJob).single(),
    );
    const heldNow = (await two.get('/api/try-on/state')).body.data.quota;
    check(
      staleRow.status === 'canceled' &&
        provider.calls.length === callsBeforeStale &&
        heldNow.held === 0,
      'B14 job queued không ai theo dõi quá 8 giây: canceled, không gửi, trả giữ chỗ',
      { staleRow, heldNow },
    );

    // --- job của người khác ---
    const foreign = await buyerOne.get(`/api/try-on/jobs/${blockedJob}`);
    check(
      foreign.status === 404 && foreign.body.error.code === 'NOT_FOUND',
      'B15 job của người khác: 404, không tiết lộ tồn tại',
    );

    // --- xóa sản phẩm: ảnh try-on bị xóa, 404 (AC-13) ---
    const removeJob = await newApiBuyer('e2e3');
    await removeJob.post(`/api/try-on/products/${p1.id}/jobs`, {});
    await tick();
    await finishAll(removeJob.userId);
    check(
      (await removeJob.get(`/api/try-on/products/${p1.id}/result`)).body.data.state === 'ready',
      'B16 người mua thứ ba có ảnh của p1',
    );
    await productService.remove(p1.id);
    await cleanup.kick();
    const goneResult = await removeJob.get(`/api/try-on/products/${p1.id}/result`);
    const goneImages = await countRows('tryon_images', (q) => q.eq('product_id', p1.id));
    check(
      goneResult.status === 404 && goneImages === 0,
      'B16 xóa sản phẩm: ảnh try-on bị xóa, /result 404, dòng sản phẩm vẫn còn (D-42)',
      goneResult.status,
    );
    const gonePrefix = (
      await client.storage.from(baseEnv.TRYON_IMAGE_BUCKET).list(removeJob.userId)
    ).data.filter((f) => f.name);
    check(gonePrefix.length === 0, 'B16 file try-on của sản phẩm đã xóa không còn trong bucket');

    // --- log không lộ dữ liệu (AC-20) ---
    const everything = JSON.stringify(logLines);
    check(
      !/data:image|base64|token=|https?:|\.jpg|165|52\.5|@example/i.test(everything),
      `B17 ${logLines.length} dòng log không chứa ảnh, base64, URL, đường dẫn, số đo, email (AC-20)`,
    );
  } finally {
    await services.stop();
  }
  return { app, services, logLines, provider, config };
}

// ---------------------------------------------------------------------------
// Phần C: quyền truy cập
// ---------------------------------------------------------------------------
async function partC() {
  console.log('\n== C. Quyền truy cập ==');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('SKIP  kiểm tra RLS/EXECUTE bằng truy vấn trực tiếp (không có DATABASE_URL)');
  } else {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    try {
      const tables = (
        await db.query(`select c.relname, c.relrowsecurity, has_table_privilege('anon', c.oid, 'select,insert,update,delete') anon_any,
          has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') auth_any,
          (select count(*) from pg_policy p where p.polrelid = c.oid)::int policies
          from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'tryon\\_%'`)
      ).rows;
      check(
        tables.length === 4 &&
          tables.every((t) => t.relrowsecurity && !t.anon_any && !t.auth_any && t.policies === 0),
        'C1 4 bảng try-on: RLS bật, không policy, anon/authenticated không có quyền',
        tables,
      );
      const fns = (
        await db.query(`select p.proname, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b,
          has_function_privilege('service_role', p.oid, 'execute') s
          from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like '%tryon%'`)
      ).rows;
      check(
        fns.length === 26 && fns.every((f) => !f.a && !f.b && f.s),
        `C2 ${fns.length} hàm try-on: anon/authenticated không EXECUTE, service_role có`,
        fns.filter((f) => f.a || f.b || !f.s).map((f) => f.proname),
      );
    } finally {
      await db.end();
    }
  }
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.log('SKIP  kiểm tra anon qua REST (không có SUPABASE_ANON_KEY trong môi trường)');
    return;
  }
  const h = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'content-type': 'application/json',
  };
  const base = baseEnv.SUPABASE_URL;
  const table = await fetch(`${base}/rest/v1/tryon_jobs?select=id`, { headers: h });
  check(
    table.status === 401 || table.status === 403,
    `C3 anon đọc tryon_jobs bị từ chối (HTTP ${table.status})`,
  );
  const call = await fetch(`${base}/rest/v1/rpc/create_tryon_job`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      p_user_id: randomUUID(),
      p_product_id: randomUUID(),
      p_purpose: 'display',
      p_consent_version: 1,
      p_provider: 'fake',
      p_model_name: 'x',
      p_daily_limit: 1,
      p_monthly_limit: 1,
      p_max_running_per_user: 1,
      p_max_active_per_user: 1,
      p_system_concurrency: 1,
      p_cost_micro_usd: 1,
      p_budget_limit_micro_usd: 1,
      p_prefetch_min_remaining: 0,
      p_budget_warn_percent: 80,
      p_deadline_seconds: 1,
    }),
  });
  check(
    call.status === 401 || call.status === 403,
    `C3 anon gọi rpc create_tryon_job bị từ chối (HTTP ${call.status})`,
  );
}

// ---------------------------------------------------------------------------
async function cleanup({ restoreBudget = true } = {}) {
  console.log('\n== Dọn dẹp ==');
  // Xóa user trước: cascade xóa profiles, jobs, tryon_images (trigger đưa file vào hàng đợi, ta xóa hàng đợi sau).
  const bucketTryon = baseEnv.TRYON_IMAGE_BUCKET;
  const leftovers = { photos: 0, tryon: 0, product: 0 };
  for (const userId of created.users) {
    for (const [bucket, key] of [
      [baseEnv.PROFILE_PHOTO_BUCKET, 'photos'],
      [bucketTryon, 'tryon'],
    ]) {
      const { data } = await client.storage.from(bucket).list(userId);
      const names = (data ?? []).filter((f) => f.name).map((f) => `${userId}/${f.name}`);
      if (names.length) {
        await client.storage.from(bucket).remove(names);
        leftovers[key] += names.length;
      }
    }
  }
  for (const productId of created.products) {
    const { data } = await client.storage.from(baseEnv.PRODUCT_IMAGE_BUCKET).list(productId);
    const names = (data ?? []).filter((f) => f.name).map((f) => `${productId}/${f.name}`);
    if (names.length) {
      await client.storage.from(baseEnv.PRODUCT_IMAGE_BUCKET).remove(names);
      leftovers.product += names.length;
    }
  }
  if (created.users.length) await client.from('users').delete().in('id', created.users);
  for (const userId of created.users)
    await client.from('tryon_file_deletions').delete().like('storage_path', `${userId}/%`);
  for (const productId of created.products)
    await client.from('products').delete().eq('id', productId);
  if (created.categories.length)
    await client.from('categories').delete().in('id', created.categories);

  // Khôi phục sổ ngân sách đúng như trước khi chạy.
  if (restoreBudget) {
    await client.from('tryon_budget_months').delete().gte('month', '2000-01-01');
    if (budgetSnapshot.length) {
      const { error } = await client.from('tryon_budget_months').insert(budgetSnapshot);
      if (error) console.log('  không khôi phục được sổ ngân sách', error.message);
    }
  }
  const residual = {
    users: await countRows('users', (q) => q.like('email', `pm-tryon-${tag}-%`)),
    jobs: await countRows('tryon_jobs', (q) =>
      q.in('user_id', created.users.length ? created.users : [randomUUID()]),
    ),
    images: await countRows('tryon_images', (q) =>
      q.in('user_id', created.users.length ? created.users : [randomUUID()]),
    ),
  };
  console.log(
    `Dọn dẹp: ${created.users.length} user, ${created.products.length} sản phẩm, ${created.categories.length} danh mục; file còn sót đã xóa: ${JSON.stringify(leftovers)}; còn lại trong DB: ${JSON.stringify(residual)}`,
  );
  check(
    residual.users === 0 && residual.jobs === 0 && residual.images === 0,
    'Dọn sạch: không còn user, job, ảnh của lần chạy này',
    residual,
  );
}

/** Dọn dữ liệu còn sót của lần chạy trước bị ngắt giữa chừng (nhận biết bằng tiền tố script tự đặt). Không đụng sổ ngân sách. */
async function sweepLeftovers() {
  const users = unwrap(
    await client.from('users').select('id').like('email', 'pm-tryon-%@example.com'),
  );
  const categories = unwrap(await client.from('categories').select('id').like('name', 'VERIFY-%'));
  const products = categories.length
    ? unwrap(
        await client
          .from('products')
          .select('id')
          .in(
            'category_id',
            categories.map((c) => c.id),
          ),
      )
    : [];
  if (users.length + categories.length + products.length === 0) return;
  created.users.push(...users.map((u) => u.id));
  created.categories.push(...categories.map((c) => c.id));
  created.products.push(...products.map((p) => p.id));
  console.log(
    `Dọn dữ liệu sót của lần chạy trước: ${users.length} user, ${products.length} sản phẩm, ${categories.length} danh mục`,
  );
  await cleanup({ restoreBudget: false });
  created.users.length = 0;
  created.categories.length = 0;
  created.products.length = 0;
}

const t0 = Date.now();
try {
  await sweepLeftovers();
  const running = await countRows('tryon_jobs', (q) => q.eq('status', 'running'));
  if (running > 0)
    throw new Error(`Đang có ${running} job running ở DB (server khác đang chạy?). Dừng.`);
  budgetSnapshot = unwrap(await client.from('tryon_budget_months').select('*'));
  await partA();
  await partB();
  await partC();
} catch (err) {
  failures += 1;
  console.error('Lỗi khi chạy:', err?.message ?? err);
} finally {
  await cleanup().catch((err) => {
    failures += 1;
    console.error('Dọn dẹp lỗi:', err?.message ?? err);
  });
}
console.log(
  `\nLỗi SQL ngoài dự kiến: ${sqlErrors}, deadlock: ${deadlocks}, thời gian: ${Math.round((Date.now() - t0) / 1000)} giây`,
);
console.log(
  failures === 0 && sqlErrors === 0
    ? 'TẤT CẢ ĐẠT'
    : `${failures} KIỂM TRA THẤT BẠI, ${sqlErrors} lỗi SQL`,
);
process.exitCode = failures === 0 && sqlErrors === 0 ? 0 : 1;
