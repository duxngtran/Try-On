import { getEnv } from './config/env.js';
import { createApp } from './app.js';

let env;
try {
  env = getEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = createApp({ corsOrigin: env.CORS_ORIGIN, isProduction: env.NODE_ENV === 'production' });
app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api`);
});
