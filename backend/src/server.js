import { getEnv } from './config/env.js';
import { getSupabase } from './config/supabase.js';
import { createApp } from './app.js';
import { buildServices } from './config/container.js';
import { createUserRepository } from './repositories/userRepository.js';
import { createCategoryRepository } from './repositories/categoryRepository.js';
import { createProductRepository } from './repositories/productRepository.js';
import { createCartRepository } from './repositories/cartRepository.js';
import { createOrderRepository } from './repositories/orderRepository.js';
import { createProfileRepository } from './repositories/profileRepository.js';
import { createTryonRepository } from './repositories/tryonRepository.js';
import { buildTryonConfig } from './services/tryon/config.js';

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
  productRepository: createProductRepository(supabase),
  cartRepository: createCartRepository(supabase, {
    maxQuantity: env.CART_MAX_QUANTITY,
    maxLines: env.CART_MAX_LINES,
  }),
  orderRepository: createOrderRepository(supabase),
  tryonRepository: createTryonRepository(supabase, buildTryonConfig(env)),
  supabase,
  startSweeper: true,
  startWorker: true,
});
const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  isProduction: env.NODE_ENV === 'production',
  services,
});
const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api`);
});

// Tắt gọn: ngừng nhận request, rồi dừng worker và dọn dẹp (chờ job đang xử lý).
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  await services.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
