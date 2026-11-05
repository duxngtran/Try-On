import { getEnv } from './config/env.js';
import { createApp } from './app.js';
import { buildAuthServices } from './config/container.js';
import { createUserRepository } from './repositories/userRepository.js';

let env;
try {
  env = getEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const services = await buildAuthServices(env, {
  userRepository: createUserRepository(),
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
