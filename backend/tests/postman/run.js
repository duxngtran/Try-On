// Chạy: npm run test:postman (cần backend/.env và fixture từ `npm run fixtures`).
// Tự bật server thật (nối với Supabase dev), chạy newman cho từng collection rồi tắt server.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../..');
const fixturesDir = path.join(backendDir, 'tests/fixtures/generated');
const collections = ['system', 'auth', 'profile', 'categories', 'products'];

const env = parseEnv(readFileSync(path.join(backendDir, '.env'), 'utf8'));
const baseUrl = `http://localhost:${env.PORT || 4000}/api`;

const isUp = () =>
  fetch(`${baseUrl}/health`).then(
    () => true,
    () => false,
  );

/** Che credential admin, JWT và token của signed URL trước khi in ra màn hình. */
function redact(text) {
  let out = text;
  for (const secret of [env.ADMIN_PASSWORD, env.ADMIN_EMAIL].filter(Boolean)) {
    out = out.split(secret).join('<redacted>');
  }
  return out
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
    .replace(/token=[\w.-]+/g, 'token=<redacted>');
}

function runCollection(name) {
  console.log(`\n=== ${name} ===`);
  const args = [
    '--yes',
    'newman',
    'run',
    `"${path.join(here, `${name}.collection.json`)}"`,
    '--working-dir',
    `"${fixturesDir}"`,
    '--env-var',
    `baseUrl=${baseUrl}`,
    '--env-var',
    `SUPABASE_URL=${env.SUPABASE_URL}`,
    '--env-var',
    `"ADMIN_EMAIL=${env.ADMIN_EMAIL}"`,
    '--env-var',
    `"ADMIN_PASSWORD=${env.ADMIN_PASSWORD}"`,
    '--reporters',
    'cli',
    '--disable-unicode',
    '--color',
    'off',
  ];
  const result = spawnSync('npx', args, {
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  console.log(redact(`${result.stdout ?? ''}${result.stderr ?? ''}`));
  return result.status === 0;
}

if (!existsSync(fixturesDir)) {
  console.error('Thiếu fixture ảnh. Chạy `npm run fixtures` trước.');
  process.exit(1);
}
if (await isUp()) {
  console.error(`Đã có server ở ${baseUrl}. Hãy tắt nó trước khi chạy.`);
  process.exit(1);
}

// Cả bộ gửi hơn 20 request auth mỗi phút và nhiều request ghi sản phẩm mỗi giờ (cộng dồn qua các lần chạy),
// nên nâng rate limit riêng cho tiến trình này.
const server = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/server.js'], {
  cwd: backendDir,
  env: {
    ...process.env,
    AUTH_RATE_LIMIT_PER_MIN: '500',
    PRODUCT_WRITES_PER_HOUR: '5000',
    // Chốt chặn chống gọi dịch vụ thật: ghi đè cả backend/.env (node --env-file không đè biến đã có trong môi trường),
    // để máy đã có key FASHN vẫn không gọi ra ngoài khi chạy API test.
    TRYON_PROVIDER: 'fake',
    FASHN_API_KEY: '',
    TRYON_ENABLED: 'true',
    TRYON_FAKE_DELAY_MS: '300',
    TRYON_JOB_CREATES_PER_MIN: '5000',
    TRYON_READS_PER_MIN: '50000',
    // API test để lại job và dòng ngân sách trên Supabase dev: đặt ngân sách rất cao để không tự chặn.
    TRYON_MONTHLY_BUDGET_USD: '1000000',
    TRYON_DAILY_LIMIT: '1000',
    TRYON_MONTHLY_LIMIT: '100000',
  },
  stdio: 'ignore',
});

let passed = false;
try {
  for (let i = 0; i < 40 && !(await isUp()); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!(await isUp())) throw new Error('Server không khởi động được.');
  // Chạy hết mọi collection để thấy đủ lỗi, không dừng ở collection fail đầu tiên.
  passed = collections.map(runCollection).every(Boolean);
} catch (err) {
  console.error(err.message);
} finally {
  server.kill();
}
process.exitCode = passed ? 0 : 1;
