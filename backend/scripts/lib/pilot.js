// Lõi của `npm run tryon:pilot` (T-82). Tách khỏi CLI để test được với adapter giả, không bao giờ chạm dịch vụ thật.
// Nguyên tắc: không ghi ảnh, đường dẫn thư mục/tệp hay URL ảnh vào log hay báo cáo (AC-20); ảnh chỉ được gọi bằng số thứ tự.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareModelImage } from '../../src/services/tryon/tryonImage.js';
import { percentile } from './stats.js';

export const PILOT_MAX_CAP = 20;
export const CONFIRM_FLAG = '--confirm-people-consented';
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const DEFAULT_MAX = 10;
const DEFAULT_POLL_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 180_000;

export class PilotUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PilotUsageError';
  }
}

export const USAGE = [
  'Dùng: npm run tryon:pilot -- --dir <thư mục ảnh người> --garment-url <URL ảnh trải phẳng> [--garment-url ...] --max <1-20> --confirm-people-consented',
  '  --dir      Thư mục NGOÀI repo chứa ảnh của những người đã đồng ý cho dùng (jpg, png, webp).',
  '  --garment-url  URL công khai của ảnh sản phẩm trải phẳng; lặp cờ để thử nhiều sản phẩm.',
  `  --max      Tổng số lần gọi tối đa, 1 đến ${PILOT_MAX_CAP} (mặc định ${DEFAULT_MAX}).`,
  `  ${CONFIRM_FLAG}  Bắt buộc: xác nhận mọi người trong ảnh đã đồng ý cho gửi ảnh tới nhà cung cấp.`,
].join('\n');

/**
 * @param {string[]} argv
 * @returns {{ dir: string, garments: string[], max: number }}
 * @throws {PilotUsageError} thiếu cờ xác nhận (kiểm đầu tiên, trước mọi việc khác), thiếu tham số, `--max` ngoài 1..20.
 */
export function parsePilotArgs(argv) {
  if (!argv.includes(CONFIRM_FLAG)) {
    throw new PilotUsageError(
      `Thiếu ${CONFIRM_FLAG}. Pilot gửi ảnh người ra bên thứ ba, chỉ chạy với ảnh của người đã đồng ý.`,
    );
  }
  const values = { dir: null, garments: [], max: DEFAULT_MAX };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === CONFIRM_FLAG) continue;
    const next = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new PilotUsageError(`Thiếu giá trị cho ${arg}.`);
      }
      i += 1;
      return argv[i];
    };
    if (arg === '--dir') values.dir = next();
    else if (arg === '--garment-url') values.garments.push(next());
    else if (arg === '--max') {
      const raw = next();
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > PILOT_MAX_CAP) {
        throw new PilotUsageError(`--max phải là số nguyên từ 1 đến ${PILOT_MAX_CAP}.`);
      }
      values.max = parsed;
    } else throw new PilotUsageError(`Tham số lạ: ${arg}`);
  }
  if (!values.dir) throw new PilotUsageError('Thiếu --dir.');
  if (values.garments.length === 0) throw new PilotUsageError('Thiếu --garment-url.');
  for (const url of values.garments) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new PilotUsageError('Có --garment-url không phải URL hợp lệ.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new PilotUsageError('--garment-url phải là http hoặc https.');
    }
  }
  return values;
}

/** Đọc ảnh trong thư mục (không đệ quy), sắp theo tên. Trả buffer; tên tệp không bao giờ ra khỏi hàm này. */
export async function loadPhotos(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile() && PHOTO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
  return Promise.all(names.map((name) => readFile(path.join(dir, name))));
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chạy lần lượt (không song song, để đo độ trễ sạch và không vượt rate limit của nhà cung cấp).
 * Mỗi cặp (ảnh người, ảnh sản phẩm) tối đa một lần gọi, tổng không quá `max`.
 *
 * @param {{
 *   provider: import('../../src/services/tryon/provider.js').TryOnProvider,
 *   photos: Buffer[],
 *   garments: string[],
 *   max: number,
 *   modelImageMaxSide: number,
 *   pollMs?: number,
 *   timeoutMs?: number,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   onProgress?: (line: string) => void,
 * }} options
 */
export async function runPilot({
  provider,
  photos,
  garments,
  max,
  modelImageMaxSide,
  pollMs = DEFAULT_POLL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now,
  sleep = sleepFor,
  onProgress = () => {},
}) {
  if (max > PILOT_MAX_CAP) throw new PilotUsageError(`--max tối đa ${PILOT_MAX_CAP}.`);
  const plan = [];
  for (let p = 0; p < photos.length && plan.length < max; p += 1) {
    for (let g = 0; g < garments.length && plan.length < max; g += 1) plan.push({ p, g });
  }

  const rows = [];
  for (const [index, { p, g }] of plan.entries()) {
    const startedAt = now();
    const row = { n: index + 1, person: p + 1, garment: g + 1, outcome: 'timeout' };
    try {
      const modelImage = await prepareModelImage(photos[p], modelImageMaxSide);
      const { providerJobId } = await provider.submit({
        modelImage,
        garmentImageUrl: garments[g],
      });
      while (now() - startedAt < timeoutMs) {
        const status = await provider.getStatus(providerJobId);
        if (status.state === 'succeeded') {
          row.outcome = 'succeeded';
          row.creditsUsed = status.creditsUsed ?? null;
          row.resultBytes = status.image.length; // chỉ kích thước, không giữ ảnh
          break;
        }
        if (status.state === 'failed') {
          row.outcome = 'failed';
          row.errorKind = status.error.kind;
          row.errorCode = status.error.providerCode;
          row.costMaybeIncurred = Boolean(status.error.costMaybeIncurred);
          break;
        }
        await sleep(pollMs);
      }
    } catch (err) {
      // Chỉ giữ tên lỗi đã được adapter làm sạch; không ghi message (có thể lặp lại nội dung đầu vào).
      row.outcome = 'failed';
      row.errorKind = err?.kind ?? 'error';
      row.errorCode = err?.providerCode ?? err?.name ?? 'Error';
      row.costMaybeIncurred = Boolean(err?.costMaybeIncurred);
    }
    row.latencyMs = now() - startedAt;
    rows.push(row);
    onProgress(`#${row.n} người ${row.person} / sản phẩm ${row.garment}: ${row.outcome}`);
  }
  return rows;
}

const seconds = (ms) => (ms == null ? 'n/a' : `${(ms / 1000).toFixed(1)} giây`);

/** Báo cáo dạng chữ. Không có đường dẫn, URL, tên tệp hay ảnh. */
export function formatPilotReport(rows, { provider, modelName, costPerImageUsd }) {
  const ok = rows.filter((r) => r.outcome === 'succeeded');
  const latencies = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
  const byCode = new Map();
  for (const r of rows.filter((x) => x.outcome === 'failed')) {
    const key = `${r.errorCode} (${r.errorKind})`;
    byCode.set(key, (byCode.get(key) ?? 0) + 1);
  }
  const credits = ok.map((r) => r.creditsUsed).filter((c) => c != null);
  const totalCredits = credits.reduce((sum, c) => sum + c, 0);
  const lines = [
    `Pilot try-on: nhà cung cấp ${provider}, model ${modelName}`,
    `Tổng số lần gọi: ${rows.length}`,
    `Thành công: ${ok.length}, thất bại: ${byCode.size ? [...byCode.values()].reduce((a, b) => a + b, 0) : 0}, quá hạn: ${rows.filter((r) => r.outcome === 'timeout').length}`,
    `Độ trễ (chỉ lần thành công): p50 ${seconds(percentile(latencies, 50))}, p95 ${seconds(percentile(latencies, 95))}, lớn nhất ${seconds(latencies.at(-1) ?? null)}`,
    `x-fashn-credits-used: ${credits.length > 0 ? `${totalCredits} trên ${credits.length} lần có header` : 'không có số liệu'}`,
    `Chi phí ước tính theo TRYON_COST_PER_IMAGE_USD: $${(ok.length * costPerImageUsd).toFixed(3)} cho ${ok.length} ảnh thành công`,
    'Mã lỗi:',
    ...(byCode.size ? [...byCode].map(([key, count]) => `  ${key}: ${count}`) : ['  không có']),
    '',
    'Chi tiết từng lần (ảnh được gọi bằng số thứ tự, không có đường dẫn):',
    ...rows.map(
      (r) =>
        `  #${r.n} người ${r.person} / sản phẩm ${r.garment}: ${r.outcome}, ${seconds(r.latencyMs)}` +
        (r.errorCode
          ? `, lỗi ${r.errorCode}${r.costMaybeIncurred ? ' (có thể đã tốn credit)' : ''}`
          : '') +
        (r.creditsUsed != null ? `, credits ${r.creditsUsed}` : ''),
    ),
  ];
  return lines.join('\n');
}
