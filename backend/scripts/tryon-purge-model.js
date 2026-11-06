// Đổi model (D-89): xóa mọi ảnh try-on của model KHÁC model hiện tại. Chạy: npm run tryon:purge-model
// Quy trình đầy đủ: design/flows/tryon-model-switch.md. Chạy lại sau ~2 phút để bắt ảnh của job còn dở lúc đổi.
// Không gọi nhà cung cấp, không in id người dùng hay đường dẫn file.
import { getEnv } from '../src/config/env.js';
import { getSupabase } from '../src/config/supabase.js';
import { createTryonRepository } from '../src/repositories/tryonRepository.js';
import { buildTryonConfig } from '../src/services/tryon/config.js';
import { createTryonCleanup } from '../src/services/tryon/cleanup.js';
import { createPhotoStorage } from '../src/services/storage.js';

try {
  const env = getEnv();
  const client = getSupabase();
  const config = buildTryonConfig(env);
  const repository = createTryonRepository(client, config);
  const storage = createPhotoStorage({
    client,
    bucket: env.TRYON_IMAGE_BUCKET,
    signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
  });
  const cleanup = createTryonCleanup({
    repository,
    storage,
    tickSeconds: env.TRYON_CLEANUP_TICK_SECONDS,
  });

  const deleted = await repository.purgeImagesExceptCurrentModel();
  const removed = await cleanup.runOnce();
  console.log(`Model hiện tại: ${config.modelName}`);
  console.log(`Đã xóa ${deleted} ảnh của model khác; đã xóa ${removed} file khỏi Storage.`);
  if (deleted > 0) {
    console.log(
      'Người mua sẽ sinh lại khi xem và tốn lượt. Chạy lại lệnh này sau 2 phút để bắt job còn dở.',
    );
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
