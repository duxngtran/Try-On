// Chạy: npm run setup:storage (cần SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY trong backend/.env). Thiết kế: D-26.
import { getEnv } from '../src/config/env.js';
import { getSupabase } from '../src/config/supabase.js';
import { ensureProfilePhotoBucket } from '../src/services/storageSetup.js';

try {
  const env = getEnv();
  const result = await ensureProfilePhotoBucket(getSupabase(), {
    name: env.PROFILE_PHOTO_BUCKET,
    maxMb: env.PHOTO_MAX_MB,
  });
  console.log(`Bucket ${env.PROFILE_PHOTO_BUCKET}: ${result} (private).`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
