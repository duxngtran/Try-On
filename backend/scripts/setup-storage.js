// Chạy: npm run setup:storage (cần SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY trong backend/.env). Thiết kế: D-26, D-46.
import { getEnv } from '../src/config/env.js';
import { getSupabase } from '../src/config/supabase.js';
import {
  ensureProductImageBucket,
  ensureProfilePhotoBucket,
} from '../src/services/storageSetup.js';

try {
  const env = getEnv();
  const client = getSupabase();
  const profile = await ensureProfilePhotoBucket(client, {
    name: env.PROFILE_PHOTO_BUCKET,
    maxMb: env.PHOTO_MAX_MB,
  });
  console.log(`Bucket ${env.PROFILE_PHOTO_BUCKET}: ${profile} (private).`);
  const product = await ensureProductImageBucket(client, {
    name: env.PRODUCT_IMAGE_BUCKET,
    maxMb: env.PRODUCT_IMAGE_MAX_MB,
  });
  console.log(`Bucket ${env.PRODUCT_IMAGE_BUCKET}: ${product} (public, chỉ đọc).`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
