// Chạy: npm run seed:admin (cần SUPABASE_*, ADMIN_EMAIL, ADMIN_PASSWORD trong backend/.env). Thiết kế: D-32.
import { getEnv } from '../src/config/env.js';
import { createUserRepository } from '../src/repositories/userRepository.js';
import { seedAdmin } from '../src/services/adminSeedService.js';

try {
  const env = getEnv();
  await seedAdmin(
    { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    { userRepository: createUserRepository(), bcryptCost: env.BCRYPT_COST },
  );
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
