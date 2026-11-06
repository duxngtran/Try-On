// Báo cáo vận hành phòng thử đồ (T-73). Chạy: npm run tryon:report
// Số job theo trạng thái, p50/p95 từ lúc gửi tới lúc xong, tỉ lệ generate trước được xem, ước tính chi phí.
// Chỉ đọc. Không in id người dùng, id sản phẩm, đường dẫn: dữ liệu cá nhân chỉ dùng để ghép khóa trong bộ nhớ.
import { getEnv } from '../src/config/env.js';
import { getSupabase } from '../src/config/supabase.js';
import { percentile } from './lib/stats.js';

const PAGE = 1000;
const MICRO = 1_000_000;

async function fetchAll(client, table, columns) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) return all;
  }
}

const seconds = (ms) => (ms == null ? 'n/a' : `${(ms / 1000).toFixed(1)} giây`);
const usd = (micro) => `$${(micro / MICRO).toFixed(3)}`;
const keyOf = (r) => `${r.user_id}|${r.photo_version}|${r.product_id}|${r.image_version}`;

async function main() {
  const env = getEnv();
  const client = getSupabase();
  const jobs = await fetchAll(
    client,
    'tryon_jobs',
    'user_id, product_id, photo_version, image_version, purpose, status, error_code, provider, model_name, cost_micro_usd, cost_incurred, submitted_at, finished_at, created_at',
  );
  const images = await fetchAll(
    client,
    'tryon_images',
    'user_id, product_id, photo_version, image_version, first_viewed_at, created_at',
  );
  const { data: budgets, error } = await client
    .from('tryon_budget_months')
    .select('month, spent_micro_usd, reserved_micro_usd')
    .order('month');
  if (error) throw error;

  console.log(
    `Nhà cung cấp cấu hình: ${env.TRYON_PROVIDER}. Tổng job: ${jobs.length}, ảnh đang lưu: ${images.length}`,
  );

  const byStatus = new Map();
  for (const j of jobs) {
    const key = j.error_code ? `${j.status} (${j.error_code})` : j.status;
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }
  console.log('\nJob theo trạng thái:');
  for (const [status, n] of [...byStatus].sort()) console.log(`  ${status}: ${n}`);

  const byProvider = new Map();
  for (const j of jobs) byProvider.set(j.provider, (byProvider.get(j.provider) ?? 0) + 1);
  console.log(
    `\nTheo nhà cung cấp: ${[...byProvider].map(([k, n]) => `${k}=${n}`).join(', ') || 'chưa có'}`,
  );

  const durations = jobs
    .filter(
      (j) =>
        (j.status === 'succeeded' || j.status === 'discarded') && j.submitted_at && j.finished_at,
    )
    .map((j) => new Date(j.finished_at) - new Date(j.submitted_at))
    .sort((a, b) => a - b);
  console.log(
    `\nĐộ trễ gửi -> xong (${durations.length} job): p50 ${seconds(percentile(durations, 50))}, p95 ${seconds(percentile(durations, 95))}`,
  );

  const viewedByKey = new Map(images.map((i) => [keyOf(i), i.first_viewed_at != null]));
  const prefetchDone = jobs.filter((j) => j.purpose === 'prefetch' && j.status === 'succeeded');
  const prefetchViewed = prefetchDone.filter((j) => viewedByKey.get(keyOf(j)) === true).length;
  console.log(
    `Generate trước thành công: ${prefetchDone.length}, đã được xem: ${prefetchViewed}` +
      (prefetchDone.length
        ? ` (${Math.round((100 * prefetchViewed) / prefetchDone.length)}%)`
        : '') +
      '. Job generate trước được người mua nâng thành hiển thị không tính ở đây, và ảnh đã bị xóa thì không còn dấu.',
  );

  const incurred = jobs.filter((j) => j.cost_incurred).reduce((s, j) => s + j.cost_micro_usd, 0);
  console.log(
    `\nChi phí ước tính theo giá cấu hình (job đã hoặc có thể đã tốn tiền): ${usd(incurred)}`,
  );
  for (const b of budgets) {
    console.log(
      `  Ngân sách tháng ${b.month}: đã chi ${usd(Number(b.spent_micro_usd))}, đang giữ ${usd(Number(b.reserved_micro_usd))}`,
    );
  }
  console.log('Đây là ước tính theo giá công bố, không phải số dư thật ở nhà cung cấp.');
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
