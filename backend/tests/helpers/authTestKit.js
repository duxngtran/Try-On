import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { buildServices } from '../../src/config/container.js';
import { DuplicateEmailError } from '../../src/repositories/userRepository.js';
import { DuplicateCategoryNameError } from '../../src/repositories/categoryRepository.js';

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
      });
    }
    return rows.get(userId) ?? null;
  };
  return {
    rows,
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

/** Giả `supabase.storage.from(bucket)` để chạy storage service thật; có thể gài lỗi upload/remove/sign. */
export function createFakeSupabase() {
  const objects = new Map();
  const state = { failUpload: false, removeFailures: 0, failSign: false, removed: [] };
  const bucketApi = {
    async upload(path, body, options) {
      if (state.failUpload) return { data: null, error: { message: 'storage down' } };
      if (objects.has(path) && !options?.upsert) {
        return { data: null, error: { message: 'duplicate' } };
      }
      objects.set(path, { body, contentType: options?.contentType });
      return { data: { path }, error: null };
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

export async function createTestApp(envOverrides = {}, { processPhoto, logger } = {}) {
  const userRepository = createFakeUserRepository();
  const profileRepository = createFakeProfileRepository(userRepository);
  const supabase = createFakeSupabase();
  const categoryRepository = createFakeCategoryRepository();
  const env = {
    ...TEST_ENV,
    PROFILE_PHOTO_BUCKET: 'profile-photos',
    PHOTO_MAX_MB: 10,
    PHOTO_UPLOADS_PER_HOUR: 1000,
    SIGNED_URL_TTL_SECONDS: 900,
    ...envOverrides,
  };
  const errorLogger = logger ?? { error: () => {} };
  const services = await buildServices(env, {
    userRepository,
    profileRepository,
    categoryRepository,
    supabase,
    processPhoto,
    logger: errorLogger,
  });
  const app = createApp({ corsOrigin: 'http://localhost:5173', logger: errorLogger, services });
  return { app, userRepository, profileRepository, categoryRepository, supabase, env };
}
