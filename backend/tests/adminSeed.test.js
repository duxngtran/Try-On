import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { seedAdmin } from '../src/services/adminSeedService.js';
import { createFakeUserRepository } from './helpers/authTestKit.js';

const quiet = () => ({ log: vi.fn(), warn: vi.fn() });
const creds = { email: ' Admin@TryOn.local ', password: 'Adm1nPassw0rd' };

describe('seedAdmin (D-32)', () => {
  it('chạy 2 lần không tạo trùng; lần 2 đặt lại mật khẩu theo env', async () => {
    const userRepository = createFakeUserRepository();
    const deps = { userRepository, bcryptCost: 4, logger: quiet() };
    expect(await seedAdmin(creds, deps)).toBe('created');
    expect(await seedAdmin({ ...creds, password: 'Another1Passw0rd' }, deps)).toBe('updated');
    expect(userRepository.rows.size).toBe(1);
    const [row] = userRepository.rows.values();
    expect(row).toMatchObject({ email: 'admin@tryon.local', role: 'admin' });
    expect(await bcrypt.compare('Another1Passw0rd', row.password_hash)).toBe(true);
  });

  it('email trùng user thường -> nâng thành admin và cảnh báo', async () => {
    const userRepository = createFakeUserRepository();
    await userRepository.create({
      email: 'admin@tryon.local',
      passwordHash: await bcrypt.hash('x', 4),
    });
    const logger = quiet();
    expect(await seedAdmin(creds, { userRepository, bcryptCost: 4, logger })).toBe('promoted');
    expect([...userRepository.rows.values()][0].role).toBe('admin');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('thiếu env hoặc mật khẩu yếu -> lỗi, không ghi DB', async () => {
    const userRepository = createFakeUserRepository();
    const deps = { userRepository, bcryptCost: 4, logger: quiet() };
    await expect(seedAdmin({ email: 'a@b.co' }, deps)).rejects.toThrow(/ADMIN_EMAIL/);
    await expect(seedAdmin({ email: 'a@b.co', password: 'short1' }, deps)).rejects.toThrow(
      /ADMIN_PASSWORD/,
    );
    expect(userRepository.rows.size).toBe(0);
  });
});
