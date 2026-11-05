// Kiểm tra thật trên Supabase dev (T-54, US-03 AC-08, US-04 AC-07, AC-13). Chạy một lần khi cần: npm run verify:products
// Dùng service role từ backend/.env; tự dọn mọi dữ liệu và file do chính script tạo.
// AC-13 chỉ chạy khi có SUPABASE_ANON_KEY trong môi trường (lấy qua Supabase MCP, KHÔNG lưu vào repo).
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getEnv } from '../src/config/env.js';
import { getSupabase } from '../src/config/supabase.js';
import { createCategoryRepository } from '../src/repositories/categoryRepository.js';
import { createProductRepository } from '../src/repositories/productRepository.js';
import { createProductImageStorage } from '../src/services/productImageStorage.js';
import { createProductService } from '../src/services/productService.js';

const ROUNDS_DELETE_RACE = 10;
const ROUNDS_RPC_RACE = 60;
const ROUNDS_REPLACE = 8;

const env = getEnv();
const client = getSupabase();
const bucket = env.PRODUCT_IMAGE_BUCKET;
const categories = createCategoryRepository(client);
const products = createProductRepository(client);
const realStorage = createProductImageStorage({
  client,
  bucket,
  cacheSeconds: env.PRODUCT_IMAGE_CACHE_SECONDS,
});

// Ghi lại mọi file đã tải lên để dọn và để kiểm "không còn file mồ côi".
const uploaded = new Set();
const storage = {
  ...realStorage,
  async upload(productId, buffer) {
    const path = await realStorage.upload(productId, buffer);
    uploaded.add(path);
    return path;
  },
};
const service = createProductService({
  productRepository: products,
  imageStorage: storage,
  logger: { error: (...args) => console.error('LOG', ...args) },
});

const tag = `VERIFY-${Date.now().toString(36)}`;
const createdCategories = [];
const createdProducts = new Set();
let failures = 0;
const check = (ok, message) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
};

const image = (r, g, b) =>
  sharp({ create: { width: 512, height: 512, channels: 3, background: { r, g, b } } })
    .jpeg()
    .toBuffer();
const randomImage = () =>
  image(Math.floor(Math.random() * 255), Math.floor(Math.random() * 255), 120);

async function newCategory(label) {
  const row = await categories.insert(`${tag}-${label}`.slice(0, 50));
  createdCategories.push(row.id);
  return row;
}

async function folderFiles(productId) {
  const { data, error } = await client.storage.from(bucket).list(productId);
  if (error) throw error;
  return data.map((f) => `${productId}/${f.name}`);
}

/** US-03 AC-08: tạo sản phẩm song song với xóa danh mục trống. */
async function checkDeleteRace() {
  const tally = { createdAndDeleteRefused: 0, deletedAndCreateRefused: 0 };
  let violations = 0;
  let orphanFiles = 0;
  for (let i = 0; i < ROUNDS_DELETE_RACE; i += 1) {
    const category = await newCategory(`R${i}`);
    const before = new Set(uploaded);
    const [created, deleted] = await Promise.allSettled([
      service.create(
        { name: `${tag} race ${i}`, priceVnd: 199000, categoryId: category.id },
        await randomImage(),
      ),
      categories.softDelete(category.id),
    ]);
    const deleteStatus = deleted.status === 'fulfilled' ? deleted.value.status : 'error';
    if (created.status === 'fulfilled') createdProducts.add(created.value.id);

    const { data: rows } = await client
      .from('products')
      .select('id')
      .eq('category_id', category.id)
      .is('deleted_at', null);
    const { data: cat } = await client
      .from('categories')
      .select('deleted_at')
      .eq('id', category.id)
      .single();
    if (cat.deleted_at && rows.length > 0) violations += 1; // vi phạm AC-08

    if (created.status === 'fulfilled' && deleteStatus === 'has_products') {
      tally.createdAndDeleteRefused += 1;
    } else if (
      created.status === 'rejected' &&
      created.reason?.code === 'CATEGORY_NOT_FOUND' &&
      deleteStatus === 'ok'
    ) {
      tally.deletedAndCreateRefused += 1;
    } else {
      violations += 1;
      console.log('  kết quả bất thường', created.status, created.reason?.code, deleteStatus);
    }
    // Nhánh bị từ chối không được để lại file mới.
    if (created.status === 'rejected') {
      for (const p of [...uploaded].filter((x) => !before.has(x))) {
        if ((await folderFiles(p.split('/')[0])).includes(p)) orphanFiles += 1;
      }
    }
  }
  check(violations === 0, `AC-08 US-03: ${ROUNDS_DELETE_RACE} lượt, 0 vi phạm`);
  check(orphanFiles === 0, 'nhánh tạo bị từ chối không để lại file trong bucket');
  console.log(`  phân bố kết quả: ${JSON.stringify(tally)}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * AC-08 ở mức RPC: ảnh đã tải sẵn nên `create_product` và `soft_delete_category` chạm DB gần như cùng lúc.
 * Độ lệch ngẫu nhiên 0-20 ms để cả hai nhánh kết quả đều có cơ hội xảy ra.
 */
async function checkRpcRace() {
  const tally = { createdAndDeleteRefused: 0, deletedAndCreateRefused: 0 };
  let violations = 0;
  for (let i = 0; i < ROUNDS_RPC_RACE; i += 1) {
    const category = await newCategory(`Q${i}`);
    const id = randomUUID();
    const imagePath = await storage.upload(id, await randomImage());
    const createDelay = Math.floor(Math.random() * 20);
    const deleteDelay = Math.floor(Math.random() * 20);
    const [created, deleted] = await Promise.all([
      sleep(createDelay).then(() =>
        products.create({
          id,
          name: `${tag} rpc ${i}`,
          priceVnd: 199000,
          categoryId: category.id,
          imagePath,
        }),
      ),
      sleep(deleteDelay).then(() => categories.softDelete(category.id)),
    ]);
    createdProducts.add(id);
    const { data: rows } = await client
      .from('products')
      .select('id')
      .eq('category_id', category.id)
      .is('deleted_at', null);
    const { data: cat } = await client
      .from('categories')
      .select('deleted_at')
      .eq('id', category.id)
      .single();
    if (cat.deleted_at && rows.length > 0) violations += 1;
    if (created === 'ok' && deleted.status === 'has_products') tally.createdAndDeleteRefused += 1;
    else if (created === 'category_not_found' && deleted.status === 'ok') {
      tally.deletedAndCreateRefused += 1;
    } else {
      violations += 1;
      console.log('  kết quả bất thường', created, deleted.status);
    }
  }
  check(violations === 0, `AC-08 US-03 (RPC song song): ${ROUNDS_RPC_RACE} lượt, 0 vi phạm`);
  check(
    tally.createdAndDeleteRefused > 0 && tally.deletedAndCreateRefused > 0,
    `cả hai nhánh kết quả đều xuất hiện: ${JSON.stringify(tally)}`,
  );
}

/** US-04 AC-07: hai update_product đổi ảnh song song; mỗi request nhận đúng ảnh cũ của mình. */
async function checkParallelReplace() {
  const category = await newCategory('REPLACE');
  let badRounds = 0;
  for (let i = 0; i < ROUNDS_REPLACE; i += 1) {
    const product = await service.create(
      { name: `${tag} replace ${i}`, priceVnd: 249000, categoryId: category.id },
      await randomImage(),
    );
    createdProducts.add(product.id);
    const original = (await folderFiles(product.id))[0];

    const jpegs = [await randomImage(), await randomImage()];
    const newPaths = await Promise.all(jpegs.map((buffer) => storage.upload(product.id, buffer)));
    const results = await Promise.all(
      newPaths.map((newImagePath) => products.update({ id: product.id, newImagePath })),
    );
    const olds = results.map((r) => r.oldImagePath);
    // Request nào thắng khóa dòng trước nhận ảnh gốc; request sau nhận đúng ảnh mà request trước vừa ghi.
    const firstIdx = olds.indexOf(original);
    const secondIdx = 1 - firstIdx;
    const okPairs =
      firstIdx !== -1 &&
      olds[secondIdx] === newPaths[firstIdx] &&
      results.every((r) => r.status === 'ok');
    for (const old of olds) await realStorage.remove(old);

    const files = await folderFiles(product.id);
    const finalRow = await products.findById(product.id);
    const finalPath = newPaths[secondIdx];
    const good =
      okPairs &&
      files.length === 1 &&
      files[0] === finalPath &&
      finalRow.image_version === 3 &&
      finalRow.image_path === finalPath;
    if (!good) {
      badRounds += 1;
      console.log('  lượt lỗi', { i, olds, newPaths, files, version: finalRow.image_version });
    }
  }
  check(
    badRounds === 0,
    `AC-07 US-04: ${ROUNDS_REPLACE} lượt update song song, file cũ đúng và không còn trong bucket`,
  );
}

/** Thay ảnh qua service: file cũ biến mất khỏi bucket (liệt kê, không dùng URL public). */
async function checkReplaceViaService() {
  const category = await newCategory('SERVICE');
  const created = await service.create(
    { name: `${tag} svc`, priceVnd: 1000, categoryId: category.id },
    await randomImage(),
  );
  createdProducts.add(created.id);
  const [oldFile] = await folderFiles(created.id);
  const updated = await service.update(created.id, { name: `${tag} svc2` }, await randomImage());
  const files = await folderFiles(created.id);
  check(
    updated.image.version === 2 && files.length === 1 && !files.includes(oldFile),
    'service.update thay ảnh: version 2, bucket chỉ còn ảnh mới',
  );
  const response = await fetch(updated.image.url);
  check(
    response.status === 200 &&
      response.headers.get('content-type') === 'image/jpeg' &&
      /max-age=604800/.test(response.headers.get('cache-control') ?? ''),
    'URL công khai mở được không cần token, content-type JPEG, cache-control 7 ngày',
  );
  return updated;
}

/** AC-13: người ngoài (anon key) không ghi/xóa/liệt kê được. */
async function checkAnonAccess(product) {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    console.log('SKIP  AC-13 (không có SUPABASE_ANON_KEY)');
    return;
  }
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  const base = `${env.SUPABASE_URL}/storage/v1`;
  const [filePath] = await folderFiles(product.id);

  const up = await fetch(`${base}/object/${bucket}/${tag}-anon.jpg`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'image/jpeg' },
    body: await randomImage(),
  });
  check(up.status >= 400, `anon tải lên bị từ chối (HTTP ${up.status})`);

  const del = await fetch(`${base}/object/${bucket}`, {
    method: 'DELETE',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes: [filePath] }),
  });
  const stillThere = (await folderFiles(product.id)).includes(filePath);
  check(stillThere, `anon xóa không có tác dụng, file vẫn còn (HTTP ${del.status})`);

  for (const name of [bucket, env.PROFILE_PHOTO_BUCKET]) {
    const list = await fetch(`${base}/object/list/${name}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: name === bucket ? product.id : '', limit: 10 }),
    });
    const body = await list.json().catch(() => null);
    check(
      Array.isArray(body) ? body.length === 0 : list.status >= 400,
      `anon liệt kê ${name} không thấy file (HTTP ${list.status})`,
    );
  }
  const pub = await fetch(`${base}/object/public/${env.PROFILE_PHOTO_BUCKET}/x/y.jpg`);
  check(pub.status >= 400, `URL public của bucket ảnh hồ sơ không mở được (HTTP ${pub.status})`);
}

async function cleanup() {
  for (const productId of createdProducts)
    await client.from('products').delete().eq('id', productId);
  if (createdCategories.length)
    await client.from('categories').delete().in('id', createdCategories);
  const paths = [...uploaded];
  for (let i = 0; i < paths.length; i += 50) {
    await client.storage.from(bucket).remove(paths.slice(i, i + 50));
  }
  const left = [];
  for (const productId of new Set(paths.map((p) => p.split('/')[0]))) {
    left.push(...(await folderFiles(productId)));
  }
  console.log(
    `Dọn dẹp: ${createdProducts.size} sản phẩm, ${createdCategories.length} danh mục, ${paths.length} file; còn lại trong bucket: ${left.length}`,
  );
}

try {
  await checkDeleteRace();
  await checkRpcRace();
  await checkParallelReplace();
  const product = await checkReplaceViaService();
  await checkAnonAccess(product);
} catch (err) {
  failures += 1;
  console.error('Lỗi khi chạy:', err);
} finally {
  await cleanup().catch((err) => console.error('Dọn dẹp lỗi:', err));
}
console.log(failures === 0 ? 'TẤT CẢ ĐẠT' : `${failures} KIỂM TRA THẤT BẠI`);
process.exitCode = failures === 0 ? 0 : 1;
