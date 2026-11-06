import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIRM_FLAG,
  PILOT_MAX_CAP,
  PilotUsageError,
  formatPilotReport,
  loadPhotos,
  parsePilotArgs,
  runPilot,
} from '../scripts/lib/pilot.js';
import { createFakeProvider } from '../src/services/tryon/fakeProvider.js';
import { TryOnProviderError } from '../src/services/tryon/provider.js';

// Chỉ kiểm lõi của `npm run tryon:pilot` với adapter giả và ảnh tổng hợp. Lệnh thật không được chạy ở sprint này.

const GARMENT = 'https://example.test/secret-path/flatlay-1.jpg';
const GARMENT_2 = 'https://example.test/secret-path/flatlay-2.jpg';
const OK_ARGS = ['--dir', 'x', '--garment-url', GARMENT, '--max', '3', CONFIRM_FLAG];

const makePhoto = (color) =>
  sharp({ create: { width: 640, height: 1024, channels: 3, background: color } })
    .jpeg()
    .toBuffer();

describe('tryon:pilot: tham số (thiếu cờ thì thoát)', () => {
  it('thiếu --confirm-people-consented thì từ chối ngay, dù mọi tham số khác đúng', () => {
    const withoutFlag = OK_ARGS.filter((a) => a !== CONFIRM_FLAG);
    expect(() => parsePilotArgs(withoutFlag)).toThrow(PilotUsageError);
    expect(() => parsePilotArgs(withoutFlag)).toThrow(/confirm-people-consented/);
  });

  it('đọc đúng tham số; lặp --garment-url thì thêm sản phẩm; mặc định 10 lần', () => {
    expect(parsePilotArgs(OK_ARGS)).toEqual({ dir: 'x', garments: [GARMENT], max: 3 });
    const two = parsePilotArgs([
      '--dir',
      'd',
      '--garment-url',
      GARMENT,
      '--garment-url',
      GARMENT_2,
      CONFIRM_FLAG,
    ]);
    expect(two.garments).toEqual([GARMENT, GARMENT_2]);
    expect(two.max).toBe(10);
  });

  it.each([
    ['--max 21 vượt giới hạn', ['--max', '21']],
    ['--max 0', ['--max', '0']],
    ['--max không phải số nguyên', ['--max', '2.5']],
    ['--max không phải số', ['--max', 'nhieu']],
    ['tham số lạ', ['--output', 'x']],
  ])('từ chối: %s', (_label, extra) => {
    const base = ['--dir', 'x', '--garment-url', GARMENT, CONFIRM_FLAG];
    expect(() => parsePilotArgs([...base, ...extra])).toThrow(PilotUsageError);
  });

  it('từ chối khi thiếu --dir, thiếu --garment-url, URL sai hoặc không phải http(s)', () => {
    expect(() => parsePilotArgs(['--garment-url', GARMENT, CONFIRM_FLAG])).toThrow(/--dir/);
    expect(() => parsePilotArgs(['--dir', 'x', CONFIRM_FLAG])).toThrow(/--garment-url/);
    expect(() =>
      parsePilotArgs(['--dir', 'x', '--garment-url', 'khong-phai-url', CONFIRM_FLAG]),
    ).toThrow(PilotUsageError);
    expect(() =>
      parsePilotArgs(['--dir', 'x', '--garment-url', 'file:///etc/passwd', CONFIRM_FLAG]),
    ).toThrow(/http/);
    expect(() => parsePilotArgs(['--dir', '--garment-url', GARMENT, CONFIRM_FLAG])).toThrow(
      /Thiếu giá trị/,
    );
  });

  it('giới hạn cứng là 20 dù lõi được gọi trực tiếp', async () => {
    expect(PILOT_MAX_CAP).toBe(20);
    await expect(
      runPilot({
        provider: createFakeProvider(),
        photos: [],
        garments: [GARMENT],
        max: 21,
        modelImageMaxSide: 1536,
      }),
    ).rejects.toThrow(PilotUsageError);
  });
});

describe('tryon:pilot: chạy với adapter giả', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pilot-test-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('chỉ đọc ảnh jpg/png/webp ở cấp đầu của thư mục, bỏ tệp khác và thư mục con', async () => {
    await writeFile(path.join(dir, 'a.jpg'), await makePhoto('#336699'));
    await writeFile(
      path.join(dir, 'b.PNG'),
      await sharp({ create: { width: 600, height: 900, channels: 3, background: '#aa5500' } })
        .png()
        .toBuffer(),
    );
    await writeFile(path.join(dir, 'ghi-chu.txt'), 'không phải ảnh');
    await mkdir(path.join(dir, 'con'));
    await writeFile(path.join(dir, 'con', 'c.jpg'), await makePhoto('#000000'));
    expect(await loadPhotos(dir)).toHaveLength(2);
  });

  it('ghép ảnh người với sản phẩm, dừng ở --max, đo độ trễ, gửi adapter đúng ảnh người + URL sản phẩm', async () => {
    const provider = createFakeProvider({ delayMs: 0 });
    const photos = [await makePhoto('#336699'), await makePhoto('#aa5500')];
    const lines = [];
    const rows = await runPilot({
      provider,
      photos,
      garments: [GARMENT, GARMENT_2],
      max: 3,
      modelImageMaxSide: 1536,
      pollMs: 0,
      onProgress: (line) => lines.push(line),
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.person, r.garment])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
    expect(rows.every((r) => r.outcome === 'succeeded' && r.latencyMs >= 0)).toBe(true);
    expect(provider.calls).toHaveLength(3);
    // Adapter chỉ nhận ảnh người (Buffer JPEG) và URL sản phẩm: không có số đo, email, id.
    for (const call of provider.calls) {
      expect(Object.keys(call).sort()).toEqual(['garmentImageUrl', 'modelImage']);
      expect(Buffer.isBuffer(call.modelImage)).toBe(true);
    }
    expect(provider.calls.map((c) => c.garmentImageUrl)).toEqual([GARMENT, GARMENT_2, GARMENT]);
    // Tiến độ chỉ có số thứ tự.
    expect(lines.join('\n')).not.toMatch(/example\.test|pilot-test|\.jpg/);
  });

  it('báo cáo có số lần, p50/p95, credit, mã lỗi; KHÔNG có đường dẫn, URL, tên tệp (AC-20)', async () => {
    await writeFile(path.join(dir, 'nguoi-that-ten-rieng.jpg'), await makePhoto('#336699'));
    const photos = await loadPhotos(dir);
    const rows = await runPilot({
      provider: createFakeProvider(),
      photos,
      garments: [GARMENT],
      max: 5,
      modelImageMaxSide: 1536,
      pollMs: 0,
    });
    const report = formatPilotReport(rows, {
      provider: 'fake',
      modelName: 'fake-tryon-v1',
      costPerImageUsd: 0.075,
    });
    expect(report).toContain('Tổng số lần gọi: 1');
    expect(report).toContain('Thành công: 1');
    expect(report).toMatch(/p50 [\d.]+ giây, p95 [\d.]+ giây/);
    expect(report).toContain('x-fashn-credits-used: không có số liệu');
    expect(report).toContain('$0.075');
    expect(report).not.toContain(dir);
    expect(report).not.toContain('nguoi-that-ten-rieng');
    expect(report).not.toContain('example.test');
    expect(report).not.toContain('secret-path');
  });

  it('ghi lại lỗi theo tên, đếm riêng, không ghi message của nhà cung cấp; lỗi không làm dừng cả lượt', async () => {
    let n = 0;
    const provider = {
      name: 'fake',
      modelName: 'x',
      async submit() {
        n += 1;
        if (n === 2) {
          throw new TryOnProviderError({
            kind: 'input',
            providerCode: 'RequestTimeout',
            costMaybeIncurred: true,
          });
        }
        return { providerJobId: `j${n}` };
      },
      async getStatus(id) {
        return id === 'j1'
          ? { state: 'succeeded', image: Buffer.alloc(10), creditsUsed: 1 }
          : {
              state: 'failed',
              error: new TryOnProviderError({ kind: 'photo_unusable', providerCode: 'PoseError' }),
            };
      },
    };
    const rows = await runPilot({
      provider,
      photos: [await makePhoto('#336699')],
      garments: [GARMENT, GARMENT_2, GARMENT],
      max: 3,
      modelImageMaxSide: 1536,
      pollMs: 0,
    });
    expect(rows.map((r) => r.outcome)).toEqual(['succeeded', 'failed', 'failed']);
    expect(rows[1]).toMatchObject({ errorCode: 'RequestTimeout', costMaybeIncurred: true });
    expect(rows[2]).toMatchObject({ errorCode: 'PoseError', errorKind: 'photo_unusable' });
    const report = formatPilotReport(rows, {
      provider: 'fashn',
      modelName: 'm',
      costPerImageUsd: 0.075,
    });
    expect(report).toContain('PoseError (photo_unusable): 1');
    expect(report).toContain('RequestTimeout (input): 1');
    expect(report).toContain('có thể đã tốn credit');
    expect(report).toContain('x-fashn-credits-used: 1 trên 1 lần có header');
  });

  it('quá hạn thì ghi "timeout" và đi tiếp, không treo vô hạn', async () => {
    let t = 0;
    const provider = {
      name: 'fake',
      modelName: 'x',
      submit: async () => ({ providerJobId: 'j' }),
      getStatus: async () => ({ state: 'pending' }),
    };
    const rows = await runPilot({
      provider,
      photos: [await makePhoto('#336699')],
      garments: [GARMENT],
      max: 1,
      modelImageMaxSide: 1536,
      timeoutMs: 10_000,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      pollMs: 2_000,
    });
    expect(rows[0].outcome).toBe('timeout');
    expect(rows[0].latencyMs).toBeGreaterThanOrEqual(10_000);
  });

  it('ảnh người hỏng chỉ làm hỏng đúng lần đó', async () => {
    const rows = await runPilot({
      provider: createFakeProvider(),
      photos: [Buffer.from('không phải ảnh'), await makePhoto('#336699')],
      garments: [GARMENT],
      max: 2,
      modelImageMaxSide: 1536,
      pollMs: 0,
    });
    expect(rows.map((r) => r.outcome)).toEqual(['failed', 'succeeded']);
    expect(rows[0].errorCode).toBe('TryOnImageError');
  });
});
