import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { buildServices } from '../../src/config/container.js';
import { DuplicateEmailError } from '../../src/repositories/userRepository.js';
import { DuplicateCategoryNameError } from '../../src/repositories/categoryRepository.js';
import { createProductImageStorage } from '../../src/services/productImageStorage.js';
import { createPhotoStorage } from '../../src/services/storage.js';
import { createFakeProvider } from '../../src/services/tryon/fakeProvider.js';
import { buildTryonConfig } from '../../src/services/tryon/config.js';
import { parseEnv } from '../../src/config/env.js';
import { createFakeTryonRepository } from './fakeTryonRepository.js';
import { createFakeCartRepository } from './fakeCartRepository.js';
import { createFakeOrderRepository } from './fakeOrderRepository.js';

export const TEST_ENV = Object.freeze({
  JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  JWT_EXPIRES_IN: '7d',
  BCRYPT_COST: 4, // thấp để test nhanh; production ép >= 10 qua env schema
  LOGIN_MAX_FAILS: 5,
  LOGIN_LOCK_MINUTES: 15,
  AUTH_RATE_LIMIT_PER_MIN: 1000,
});

/** Repository trong bộ nhớ, cùng hợp đồng với userRepository thật (không cần DB). */
export function createFakeUserRepository() {
  const rows = new Map();
  const byEmail = (email) => [...rows.values()].find((r) => r.email === email) ?? null;
  const publicRow = (row) => {
    const copy = { ...row };
    delete copy.password_hash;
    return copy;
  };
  return {
    rows,
    /** Cho phép test mô phỏng đăng ký đồng thời: unique vi phạm ngay lúc INSERT. */
    failNextCreateWithDuplicate: false,
    async findByEmailWithHash(email) {
      const row = byEmail(email);
      return row ? { ...row } : null;
    },
    async findById(id) {
      const row = rows.get(id);
      return row ? publicRow(row) : null;
    },
    async create({ email, passwordHash, role = 'user' }) {
      if (this.failNextCreateWithDuplicate || byEmail(email)) {
        this.failNextCreateWithDuplicate = false;
        throw new DuplicateEmailError();
      }
      const row = {
        id: randomUUID(),
        email,
        role,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
      };
      rows.set(row.id, row);
      return publicRow(row);
    },
    async update(id, { role, passwordHash }) {
      const row = rows.get(id);
      if (role !== undefined) row.role = role;
      if (passwordHash !== undefined) row.password_hash = passwordHash;
      return publicRow(row);
    },
  };
}

/** Timestamp kiểu Postgres (microsecond + offset), để bắt lỗi định dạng như đã gặp ở US-01. */
const pgTimestamp = () => new Date().toISOString().replace('Z', '123+00:00');

/**
 * Repository hồ sơ trong bộ nhớ, mô phỏng DB thật: hồ sơ rỗng sinh tự động cho user có thật (trigger),
 * CHECK "ảnh cần consent", ghi ảnh nguyên tử qua setPhoto. Có thể gài lỗi để test rollback.
 */
export function createFakeProfileRepository(userRepository) {
  const rows = new Map();
  const ensure = (userId) => {
    if (!rows.has(userId) && userRepository.rows.has(userId)) {
      rows.set(userId, {
        height_cm: null,
        weight_kg: null,
        photo_path: null,
        photo_version: 0,
        photo_updated_at: null,
        photo_consent_at: null,
        photo_consent_version: null,
        tryon_consent_at: null,
        tryon_consent_version: null,
        tryon_consent_withdrawn_at: null,
        tryon_consent_generation: 0,
      });
    }
    return rows.get(userId) ?? null;
  };
  return {
    rows,
    /** Mô phỏng trigger DB: gọi sau khi photo_version đổi. */
    listeners: [],
    failNextSetPhoto: false,
    async findByUserId(userId) {
      const row = ensure(userId);
      return row ? { ...row } : null;
    },
    async recordConsent(userId, version) {
      const row = ensure(userId);
      if (!row.photo_consent_at || row.photo_consent_version !== version) {
        row.photo_consent_at = pgTimestamp();
        row.photo_consent_version = version;
      }
    },
    async saveMeasurements(userId, { heightCm, weightKg }) {
      const row = ensure(userId);
      if (!row) return null;
      row.height_cm = heightCm;
      row.weight_kg = Math.round(weightKg * 10) / 10; // numeric(4,1) làm tròn
      return { ...row };
    },
    async setPhoto(userId, newPath) {
      if (this.failNextSetPhoto) {
        this.failNextSetPhoto = false;
        throw new Error('db down');
      }
      const row = ensure(userId);
      if (newPath && !row.photo_consent_at) throw new Error('violates profiles_photo_consent_chk');
      const oldPath = row.photo_path;
      if (newPath === null && oldPath === null) {
        return {
          oldPath: null,
          photoVersion: row.photo_version,
          photoUpdatedAt: row.photo_updated_at,
        };
      }
      row.photo_path = newPath;
      row.photo_version += 1;
      row.photo_updated_at = pgTimestamp();
      for (const listener of this.listeners) listener(userId);
      return { oldPath, photoVersion: row.photo_version, photoUpdatedAt: row.photo_updated_at };
    },
  };
}

/**
 * Repository danh mục trong bộ nhớ, cùng hợp đồng với categoryRepository thật: unique theo lower(name)
 * trong các hàng chưa xóa, xóa mềm, đếm sản phẩm chưa xóa, timestamp kiểu Postgres.
 * `products` là danh sách `{ category_id, deleted_at }` để test dựng tình huống.
 */
export function createFakeCategoryRepository() {
  const rows = [];
  const products = [];
  let seq = 0;
  const active = () => rows.filter((r) => !r.deleted_at);
  const nameTaken = (name, exceptId) =>
    active().some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase());
  const countOf = (id) => products.filter((p) => p.category_id === id && !p.deleted_at).length;
  const publicRow = (r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
  return {
    rows,
    products,
    failNextList: false,
    seed(name) {
      const row = {
        id: randomUUID(),
        name,
        created_at: pgTimestamp(),
        updated_at: pgTimestamp(),
        deleted_at: null,
        seq: (seq += 1),
      };
      rows.push(row);
      return row;
    },
    async listWithCounts() {
      if (this.failNextList) {
        this.failNextList = false;
        throw new Error('db down');
      }
      return active()
        .sort((a, b) => a.seq - b.seq)
        .map((r) => ({ ...publicRow(r), product_count: countOf(r.id) }));
    },
    async insert(name) {
      if (nameTaken(name)) throw new DuplicateCategoryNameError();
      return publicRow(this.seed(name));
    },
    async rename(id, name) {
      const row = active().find((r) => r.id === id);
      if (!row) return null;
      if (nameTaken(name, id)) throw new DuplicateCategoryNameError();
      row.name = name;
      row.updated_at = pgTimestamp();
      return publicRow(row);
    },
    async countActiveProducts(id) {
      return countOf(id);
    },
    async softDelete(id) {
      const row = active().find((r) => r.id === id);
      if (!row) return { status: 'not_found', productCount: 0 };
      const count = countOf(id);
      if (count > 0) return { status: 'has_products', productCount: count };
      row.deleted_at = pgTimestamp();
      return { status: 'ok', productCount: 0 };
    },
  };
}

/**
 * Repository sản phẩm trong bộ nhớ, cùng hợp đồng với productRepository thật (kể cả ngữ nghĩa của hàm SQL
 * create_product/update_product). Dùng chung `categoryRepository` để kiểm danh mục và lấy tên.
 * Có thể gài lỗi DB hoặc mô phỏng danh mục bị xóa đúng lúc ghi (race).
 */
export function createFakeProductRepository(categoryRepository) {
  const rows = [];
  let seq = 0;
  const active = () => rows.filter((r) => !r.deleted_at);
  const category = (id) => categoryRepository.rows.find((c) => c.id === id && !c.deleted_at);
  const withCategory = (r) => {
    const c = categoryRepository.rows.find((x) => x.id === r.category_id);
    return {
      id: r.id,
      name: r.name,
      price_vnd: r.price_vnd,
      image_path: r.image_path,
      image_version: r.image_version,
      created_at: r.created_at,
      updated_at: r.updated_at,
      category: { id: c.id, name: c.name },
    };
  };
  const repo = {
    rows,
    /** Mô phỏng trigger DB: gọi khi image_version đổi hoặc sản phẩm bị xóa mềm. */
    listeners: [],
    failNextCreate: false,
    failNextUpdate: false,
    /** true: danh mục bị xóa ngay trước khi hàm SQL chạy (sau lần kiểm tra sớm). */
    categoryDeletedBeforeWrite: false,
    /** true: sản phẩm bị xóa ngay trước khi update_product chạy. */
    productDeletedBeforeWrite: false,
    /** Gọi trước mỗi lần ghi, để test dựng tình huống. */
    listCalls: [],
    seed({ name = 'Áo thun trắng', priceVnd = 199000, categoryId, imagePath, id = randomUUID() }) {
      const row = {
        id,
        name,
        price_vnd: priceVnd,
        category_id: categoryId,
        image_path: imagePath ?? `${id}/${randomUUID()}.jpg`,
        image_version: 1,
        created_at: pgTimestamp(),
        updated_at: pgTimestamp(),
        deleted_at: null,
        seq: (seq += 1),
      };
      rows.push(row);
      return row;
    },
    async list({ page, limit, categoryId }) {
      repo.listCalls.push({ page, limit, categoryId });
      const all = active()
        .filter((r) => !categoryId || r.category_id === categoryId)
        .sort((a, b) => b.seq - a.seq);
      const from = (page - 1) * limit;
      return { rows: all.slice(from, from + limit).map(withCategory), total: all.length };
    },
    async findById(id) {
      const row = active().find((r) => r.id === id);
      return row ? withCategory(row) : null;
    },
    async activeCategoryExists(categoryId) {
      return Boolean(category(categoryId));
    },
    async create({ id, name, priceVnd, categoryId, imagePath }) {
      if (repo.failNextCreate) {
        repo.failNextCreate = false;
        throw new Error('db down');
      }
      if (repo.categoryDeletedBeforeWrite) {
        repo.categoryDeletedBeforeWrite = false;
        const c = categoryRepository.rows.find((x) => x.id === categoryId);
        if (c) c.deleted_at = pgTimestamp();
      }
      if (!category(categoryId)) return 'category_not_found';
      repo.seed({ id, name, priceVnd, categoryId, imagePath });
      return 'ok';
    },
    async update({ id, name, priceVnd, categoryId, newImagePath }) {
      if (repo.failNextUpdate) {
        repo.failNextUpdate = false;
        throw new Error('db down');
      }
      if (repo.productDeletedBeforeWrite) {
        repo.productDeletedBeforeWrite = false;
        const gone = rows.find((r) => r.id === id);
        if (gone) gone.deleted_at = pgTimestamp();
      }
      if (repo.categoryDeletedBeforeWrite) {
        repo.categoryDeletedBeforeWrite = false;
        const c = categoryRepository.rows.find((x) => x.id === categoryId);
        if (c) c.deleted_at = pgTimestamp();
      }
      const row = active().find((r) => r.id === id);
      if (!row) return { status: 'not_found', oldImagePath: null };
      if (categoryId && categoryId !== row.category_id && !category(categoryId)) {
        return { status: 'category_not_found', oldImagePath: null };
      }
      const oldImagePath = newImagePath ? row.image_path : null;
      if (name !== undefined) row.name = name;
      if (priceVnd !== undefined) row.price_vnd = priceVnd;
      if (categoryId) row.category_id = categoryId;
      if (newImagePath) {
        row.image_path = newImagePath;
        row.image_version += 1;
        for (const listener of repo.listeners) listener(id);
      }
      row.updated_at = pgTimestamp();
      return { status: 'ok', oldImagePath };
    },
    async softDelete(id) {
      const row = active().find((r) => r.id === id);
      if (!row) return false;
      row.deleted_at = pgTimestamp();
      for (const listener of repo.listeners) listener(id);
      return true;
    },
  };
  return repo;
}

/** Giả `supabase.storage.from(bucket)` để chạy storage service thật; có thể gài lỗi upload/remove/sign. */
export function createFakeSupabase() {
  const objects = new Map();
  const state = { failUpload: false, removeFailures: 0, failSign: false, removed: [], uploads: [] };
  const bucketApi = {
    async upload(path, body, options) {
      state.uploads.push(path);
      if (state.failUpload) return { data: null, error: { message: 'storage down' } };
      if (objects.has(path) && !options?.upsert) {
        return { data: null, error: { message: 'duplicate' } };
      }
      objects.set(path, {
        body,
        contentType: options?.contentType,
        cacheControl: options?.cacheControl,
      });
      return { data: { path }, error: null };
    },
    getPublicUrl(path) {
      return { data: { publicUrl: `https://fake.supabase.co/storage/v1/object/public/b/${path}` } };
    },
    async remove(paths) {
      if (state.removeFailures > 0) {
        state.removeFailures -= 1;
        return { data: null, error: { message: 'storage down' } };
      }
      for (const p of paths) {
        objects.delete(p);
        state.removed.push(p);
      }
      return { data: [], error: null };
    },
    async download(path) {
      const object = objects.get(path);
      if (!object) return { data: null, error: { message: 'Object not found' } };
      return { data: new Blob([object.body]), error: null };
    },
    async createSignedUrl(path, expiresIn) {
      if (state.failSign) return { data: null, error: { message: 'sign failed' } };
      return {
        data: {
          signedUrl: `https://fake.supabase.co/storage/v1/object/sign/b/${path}?token=t&ttl=${expiresIn}`,
        },
        error: null,
      };
    },
  };
  return { objects, state, storage: { from: () => bucketApi } };
}

/** Mặc định của biến TRYON_*, FASHN_* lấy từ chính env schema (chạy cả bước parse env). */
const tryonEnvDefaults = () => {
  const parsed = parseEnv({
    CORS_ORIGIN: 'http://localhost:5173',
    SUPABASE_URL: 'https://fake.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fake',
    JWT_SECRET: 'x'.repeat(32),
  });
  return Object.fromEntries(
    Object.entries(parsed).filter(([k]) => k.startsWith('TRYON_') || k.startsWith('FASHN_')),
  );
};

/**
 * @param {object} [envOverrides]
 * @param {{
 *   processPhoto?: Function, processProductImage?: Function, logger?: object,
 *   tryon?: boolean, tryonDelayMs?: number,
 *   orderRepositoryOverride?: object,
 * }} [options] `tryon: true` lắp phòng thử đồ với repository giả, adapter giả và đồng hồ điều khiển bằng tay.
 *   Worker KHÔNG tự chạy: test gọi `ctx.tryon.worker.tick()`.
 */
export async function createTestApp(
  envOverrides = {},
  {
    processPhoto,
    processProductImage,
    logger,
    tryon = false,
    tryonDelayMs = 0,
    orderRepositoryOverride,
  } = {},
) {
  const userRepository = createFakeUserRepository();
  const profileRepository = createFakeProfileRepository(userRepository);
  const supabase = createFakeSupabase();
  const categoryRepository = createFakeCategoryRepository();
  const productRepository = createFakeProductRepository(categoryRepository);
  // Storage riêng cho bucket ảnh sản phẩm, để kiểm tra độc lập với ảnh hồ sơ.
  const productSupabase = createFakeSupabase();
  const env = {
    ...TEST_ENV,
    ...tryonEnvDefaults(),
    PROFILE_PHOTO_BUCKET: 'profile-photos',
    PHOTO_MAX_MB: 10,
    PHOTO_UPLOADS_PER_HOUR: 1000,
    SIGNED_URL_TTL_SECONDS: 900,
    PRODUCT_IMAGE_BUCKET: 'product-images',
    PRODUCT_IMAGE_MAX_MB: 10,
    PRODUCT_IMAGE_CACHE_SECONDS: 604800,
    PRODUCT_WRITES_PER_HOUR: 1000,
    CART_MAX_QUANTITY: 10,
    CART_MAX_LINES: 30,
    CART_REQUESTS_PER_MIN: 1000,
    ORDER_CREATES_PER_HOUR: 1000,
    ORDER_READS_PER_MIN: 1000,
    ...envOverrides,
  };
  const errorLogger = logger ?? { error: () => {} };
  const cartRepository = createFakeCartRepository({
    userRepository,
    productRepository,
    categoryRepository,
    limits: { maxQuantity: env.CART_MAX_QUANTITY, maxLines: env.CART_MAX_LINES },
  });

  const orderRepository =
    orderRepositoryOverride ??
    createFakeOrderRepository({ userRepository, productRepository, cartRepository });

  let tryonOptions = {};
  let tryonCtx;
  if (tryon) {
    const clock = { t: Date.now(), now: () => clock.t, advance: (ms) => (clock.t += ms) };
    const tryonSupabase = createFakeSupabase();
    const config = buildTryonConfig(env);
    const tryonRepository = createFakeTryonRepository({
      profileRepository,
      productRepository,
      categoryRepository,
      config,
      clock,
    });
    const provider = createFakeProvider({
      delayMs: tryonDelayMs,
      now: clock.now,
      resolveScenario: async ({ garmentImageUrl }) => {
        const id = /([0-9a-f-]{36})\/[0-9a-f-]{36}\.jpg$/.exec(garmentImageUrl)?.[1];
        return productRepository.rows.find((r) => r.id === id)?.name;
      },
    });
    tryonOptions = {
      tryonRepository,
      provider,
      tryonStorage: createPhotoStorage({
        client: tryonSupabase,
        bucket: env.TRYON_IMAGE_BUCKET,
        signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
      }),
    };
    tryonCtx = { repository: tryonRepository, provider, clock, supabase: tryonSupabase, config };
  }

  const services = await buildServices(env, {
    userRepository,
    profileRepository,
    categoryRepository,
    productRepository,
    cartRepository,
    orderRepository,
    productImageStorage: createProductImageStorage({
      client: productSupabase,
      bucket: env.PRODUCT_IMAGE_BUCKET,
      cacheSeconds: env.PRODUCT_IMAGE_CACHE_SECONDS,
    }),
    processProductImage,
    supabase,
    processPhoto,
    logger: errorLogger,
    ...tryonOptions,
  });
  if (tryonCtx) Object.assign(tryonCtx, services.tryon);
  const app = createApp({ corsOrigin: 'http://localhost:5173', logger: errorLogger, services });
  return {
    app,
    userRepository,
    profileRepository,
    categoryRepository,
    productRepository,
    cartRepository,
    orderRepository,
    supabase,
    productSupabase,
    env,
    services,
    tryon: tryonCtx,
  };
}
