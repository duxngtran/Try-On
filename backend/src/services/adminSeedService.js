import bcrypt from 'bcrypt';
import { emailSchema, firstPasswordProblem } from '../validation/authSchemas.js';

/**
 * Seed admin từ env (D-32): upsert theo email, mỗi lần chạy đặt lại role admin + mật khẩu theo env.
 * @param {{ email?: string, password?: string }} input
 * @param {{ userRepository: object, bcryptCost: number, logger?: Pick<Console, 'log' | 'warn'> }} deps
 * @returns {Promise<'created' | 'updated' | 'promoted'>}
 */
export async function seedAdmin(
  { email, password },
  { userRepository, bcryptCost, logger = console },
) {
  if (!email || !password)
    throw new Error('Thiếu ADMIN_EMAIL hoặc ADMIN_PASSWORD trong backend/.env');
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) throw new Error(`ADMIN_EMAIL: ${parsedEmail.error.issues[0].message}`);
  const passwordProblem = firstPasswordProblem(password);
  if (passwordProblem) throw new Error(`ADMIN_PASSWORD: ${passwordProblem}`);

  const normalizedEmail = parsedEmail.data;
  const passwordHash = await bcrypt.hash(password, bcryptCost);
  const existing = await userRepository.findByEmailWithHash(normalizedEmail);

  if (!existing) {
    await userRepository.create({ email: normalizedEmail, passwordHash, role: 'admin' });
    logger.log(`Đã tạo admin ${normalizedEmail}`);
    return 'created';
  }
  await userRepository.update(existing.id, { role: 'admin', passwordHash });
  if (existing.role !== 'admin') {
    logger.warn(`Cảnh báo: ${normalizedEmail} là user thường, đã nâng thành admin.`);
    return 'promoted';
  }
  logger.log(`Đã cập nhật mật khẩu admin ${normalizedEmail}`);
  return 'updated';
}
