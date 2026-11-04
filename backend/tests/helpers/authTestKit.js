import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { buildAuthServices } from '../../src/config/container.js';
import { DuplicateEmailError } from '../../src/repositories/userRepository.js';

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

export async function createTestApp(envOverrides = {}) {
  const userRepository = createFakeUserRepository();
  const env = { ...TEST_ENV, ...envOverrides };
  const services = await buildAuthServices(env, { userRepository });
  const logger = { error: () => {} };
  const app = createApp({ corsOrigin: 'http://localhost:5173', logger, services });
  return { app, userRepository, env };
}
