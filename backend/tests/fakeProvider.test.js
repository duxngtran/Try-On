import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { createFakeProvider, scenarioFromProductName } from '../src/services/tryon/fakeProvider.js';
import { TryOnProviderError } from '../src/services/tryon/provider.js';

const model = Buffer.from('model-jpeg');
const garment = (id) => `https://x.supabase.co/storage/v1/object/public/product-images/${id}/a.jpg`;

/** Provider với đồng hồ điều khiển bằng tay, tên sản phẩm lấy từ id trong URL. */
function setup(names, delayMs = 0) {
  const clock = { t: 1000 };
  const provider = createFakeProvider({
    delayMs,
    now: () => clock.t,
    resolveScenario: ({ garmentImageUrl }) => names[garmentImageUrl.split('/').at(-2)],
  });
  return { provider, clock };
}

async function run(provider, id) {
  const { providerJobId } = await provider.submit({
    modelImage: model,
    garmentImageUrl: garment(id),
  });
  return provider.getStatus(providerJobId);
}

describe('scenarioFromProductName', () => {
  it('tiền tố dài thắng tiền tố ngắn; không phân biệt hoa thường; tên thường là success', () => {
    expect(scenarioFromProductName('FAKE-TRANSIENT-ONCE áo')).toBe('transient-once');
    expect(scenarioFromProductName('fake-transient áo')).toBe('transient');
    expect(scenarioFromProductName('Áo thun trắng')).toBe('success');
    expect(scenarioFromProductName(undefined)).toBe('success');
  });
});

describe('adapter giả: từng kịch bản trả đúng kind (T-64)', () => {
  it('thành công sau độ trễ, ảnh JPEG 864x1296 có metadata để chuẩn hóa phải bỏ', async () => {
    const { provider, clock } = setup({ ok: 'Áo thường' }, 500);
    const { providerJobId } = await provider.submit({
      modelImage: model,
      garmentImageUrl: garment('ok'),
    });
    expect(await provider.getStatus(providerJobId)).toEqual({ state: 'pending' });
    clock.t += 499;
    expect((await provider.getStatus(providerJobId)).state).toBe('pending');
    clock.t += 1;
    const done = await provider.getStatus(providerJobId);
    expect(done.state).toBe('succeeded');
    const meta = await sharp(done.image).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 864, 1296]);
    expect(meta.exif).toBeDefined();
  });

  it.each([
    ['FAKE-BLOCKED a', 'blocked'],
    ['FAKE-POSE a', 'photo_unusable'],
    ['FAKE-TRANSIENT a', 'transient'],
  ])('%s -> failed %s ở lần đọc trạng thái', async (name, kind) => {
    const { provider } = setup({ p: name });
    const result = await run(provider, 'p');
    expect(result.state).toBe('failed');
    expect(result.error).toBeInstanceOf(TryOnProviderError);
    expect([result.error.kind, result.error.costMaybeIncurred]).toEqual([kind, false]);
  });

  it('FAKE-TRANSIENT-ONCE: lần gửi đầu lỗi tạm thời, lần hai thành công', async () => {
    const { provider } = setup({ p: 'FAKE-TRANSIENT-ONCE a' });
    expect((await run(provider, 'p')).state).toBe('failed');
    expect((await run(provider, 'p')).state).toBe('succeeded');
  });

  it('FAKE-TRANSIENT: lỗi cả hai lần', async () => {
    const { provider } = setup({ p: 'FAKE-TRANSIENT a' });
    expect((await run(provider, 'p')).state).toBe('failed');
    expect((await run(provider, 'p')).state).toBe('failed');
  });

  it('FAKE-HANG: không bao giờ xong dù thời gian trôi', async () => {
    const { provider, clock } = setup({ p: 'FAKE-HANG a' });
    const { providerJobId } = await provider.submit({
      modelImage: model,
      garmentImageUrl: garment('p'),
    });
    clock.t += 10 * 60_000;
    expect(await provider.getStatus(providerJobId)).toEqual({ state: 'pending' });
  });

  it('FAKE-INPUT ném input, FAKE-NOCREDIT ném config ngay lúc gửi', async () => {
    const { provider } = setup({ i: 'FAKE-INPUT a', n: 'FAKE-NOCREDIT a' });
    const input = await provider
      .submit({ modelImage: model, garmentImageUrl: garment('i') })
      .catch((e) => e);
    const config = await provider
      .submit({ modelImage: model, garmentImageUrl: garment('n') })
      .catch((e) => e);
    expect(input.kind).toBe('input');
    expect(config.kind).toBe('config');
  });

  it('id lạ khi đọc trạng thái -> lỗi transient (worker bỏ qua)', async () => {
    const { provider } = setup({});
    await expect(provider.getStatus('khong-co')).rejects.toMatchObject({ kind: 'transient' });
  });

  it('mảng calls ghi lại đúng hai ảnh và không gì khác (AC-19)', async () => {
    const { provider } = setup({ p: 'Áo' });
    await run(provider, 'p');
    expect(provider.calls).toHaveLength(1);
    expect(Object.keys(provider.calls[0]).sort()).toEqual(['garmentImageUrl', 'modelImage']);
    expect(provider.calls[0].modelImage).toBe(model);
  });

  it('chỉ giữ 20 lần gọi gần nhất, chạy lâu không phình bộ nhớ', async () => {
    const { provider } = setup({});
    for (let i = 0; i < 25; i += 1) await run(provider, `p${i}`);
    expect(provider.calls).toHaveLength(20);
    expect(provider.calls.at(-1).garmentImageUrl).toContain('p24');
  });
});
