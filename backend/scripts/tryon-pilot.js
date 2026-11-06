// Pilot đo độ trễ, credit và mã lỗi của nhà cung cấp try-on (T-82, T-94). Chạy: npm run tryon:pilot -- <tham số>
//
// KHÔNG chạy trong sprint này và không bao giờ chạy tự động: với TRYON_PROVIDER=fashn script GỬI ẢNH NGƯỜI THẬT ra
// bên thứ ba (nước ngoài) và tốn tiền. Chỉ người có thẩm quyền chạy, với ảnh của người ĐÃ đồng ý cho dùng.
// Với TRYON_PROVIDER=fake (mặc định) script dùng adapter giả: không có mạng ra ngoài.
//
// Script không ghi ảnh, không ghi đường dẫn thư mục hay tên tệp, không ghi URL vào log hay báo cáo.
import { getEnv } from '../src/config/env.js';
import { createProviderFromEnv } from '../src/services/tryon/providerFactory.js';
import {
  CONFIRM_FLAG,
  PilotUsageError,
  USAGE,
  formatPilotReport,
  loadPhotos,
  parsePilotArgs,
  runPilot,
} from './lib/pilot.js';

async function main() {
  let args;
  try {
    // Kiểm cờ xác nhận và tham số TRƯỚC khi đọc env hay chạm vào thư mục ảnh.
    args = parsePilotArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof PilotUsageError)) throw err;
    console.error(`${err.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }

  const env = getEnv();
  const provider = createProviderFromEnv(env);
  const real = provider.name !== 'fake';
  console.log(
    real
      ? `Nhà cung cấp THẬT: ${provider.name} (${provider.modelName}). Ảnh người sẽ được gửi ra ngoài (đã có ${CONFIRM_FLAG}).`
      : `Adapter giả (${provider.modelName}): không gửi gì ra ngoài.`,
  );

  const photos = await loadPhotos(args.dir);
  if (photos.length === 0) {
    console.error('Thư mục không có ảnh jpg, png hoặc webp.');
    process.exitCode = 2;
    return;
  }
  console.log(
    `Số ảnh người: ${photos.length}, số sản phẩm: ${args.garments.length}, tối đa ${args.max} lần gọi.`,
  );

  const rows = await runPilot({
    provider,
    photos,
    garments: args.garments,
    max: args.max,
    modelImageMaxSide: env.FASHN_MODEL_IMAGE_MAX_SIDE,
    onProgress: console.log,
  });
  console.log(
    `\n${formatPilotReport(rows, {
      provider: provider.name,
      modelName: provider.modelName,
      costPerImageUsd: env.TRYON_COST_PER_IMAGE_USD,
    })}`,
  );
}

main().catch((err) => {
  // Không in err.message: có thể chứa chi tiết đầu vào. Chỉ in tên lỗi.
  console.error(`Pilot dừng vì lỗi: ${err?.name ?? 'Error'}`);
  process.exitCode = 1;
});
