import { getEnv } from './config/env.js';
import { getSupabase } from './config/supabase.js';
import { createApp } from './app.js';
import { buildServices } from './config/container.js';
import { createUserRepository } from './repositories/userRepository.js';
import { createCategoryRepository } from './repositories/categoryRepository.js';
import { createProfileRepository } from './repositories/profileRepository.js';

let env;
try {
  env = getEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const supabase = getSupabase();
const services = await buildServices(env, {
  userRepository: createUserRepository(supabase),
  profileRepository: createProfileRepository(supabase),
  categoryRepository: createCategoryRepository(supabase),
  supabase,
  startSweeper: true,
});
const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  isProduction: env.NODE_ENV === 'production',
  services,
});
app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api`);
});
