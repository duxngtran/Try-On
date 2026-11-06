import { describe, it, expect, vi } from 'vitest';
import { setupTryon } from './helpers/tryonKit.js';

/** Một người mua + một sản phẩm + job đã tạo. */
async function oneJob(envOverrides = {}, options = {}, productName = 'Áo') {
  const kit = await setupTryon(envOverrides, options);
  const buyer = await kit.newBuyer();
  const product = kit.product(productName, kit.category().id);
  const created = await buyer.job(product.id);
  return { kit, buyer, product, jobId: created.body.data.job.id };
}
const jobRow = (kit, index = 0) => kit.tryon.repository.jobs[index];

describe('worker: gửi, kiểm tra trước khi gửi (AC-02, AC-11)', () => {
  it('consent bị rút ngay trước khi gửi: không gọi dịch vụ, job bị hủy, trả giữ chỗ, không tính lượt', async () => {
    const { kit, buyer } = await oneJob();
    // Rút consent đúng lúc worker đang tải ảnh hồ sơ (sau khi đã nhận job, trước check_before_submit).
    const profileBucket = kit.ctx.supabase.storage.from('x');
    const download = profileBucket.download;
    profileBucket.download = async (...args) => {
      await kit.tryon.repository.withdrawConsent(buyer.id);
      return download(...args);
    };
    // withdrawConsent hủy job `queued`; job đã `running` thì chỉ check_tryon_job_before_submit chặn được.
    await kit.tryon.worker.tick();

    expect(kit.tryon.provider.calls).toHaveLength(0);
    expect(jobRow(kit)).toMatchObject({
      status: 'canceled',
      charged_at: null,
      cost_incurred: false,
    });
    expect(kit.tryon.repository.budget).toMatchObject({ spent: 0, reserved: 0 });
  });

  it('job queued không còn ai theo dõi quá 8 giây bị hủy, trả giữ chỗ; còn poll thì được gửi', async () => {
    const { kit, buyer, jobId } = await oneJob();
    kit.tryon.clock.advance(5000);
    await buyer.jobStatus(jobId); // tab vẫn theo dõi: làm mới last_seen_at
    kit.tryon.clock.advance(5000);
    await kit.tryon.worker.tick();
    expect(jobRow(kit).status).toBe('running');

    const second = await setupTryon();
    const buyer2 = await second.newBuyer();
    const p = second.product('Áo', second.category().id);
    await buyer2.job(p.id);
    second.tryon.clock.advance(9000); // không ai poll
    await second.tryon.worker.tick();
    expect(second.tryon.repository.jobs[0].status).toBe('canceled');
    expect(second.tryon.provider.calls).toHaveLength(0);
    expect(second.tryon.repository.budget.reserved).toBe(0);
    expect((await buyer2.state()).body.data.quota).toMatchObject({ held: 0, dailyUsed: 0 });
  });

  it('không tải được ảnh hồ sơ: lỗi tạm thời, thử lại một lần rồi TRYON_FAILED, chưa gửi nên không tốn ngân sách', async () => {
    const { kit, buyer, jobId } = await oneJob();
    kit.ctx.supabase.objects.clear();
    await kit.drain();
    const job = (await buyer.jobStatus(jobId)).body.data.job;
    expect([job.status, job.error.code]).toEqual(['failed', 'TRYON_FAILED']);
    expect(kit.tryon.provider.calls).toHaveLength(0);
    expect(jobRow(kit)).toMatchObject({ attempts: 2, cost_incurred: false });
    expect(kit.tryon.repository.budget).toMatchObject({ spent: 0, reserved: 0 });
  });

  it('thử lại cách 2 giây, không gửi lại ngay trong cùng tick', async () => {
    const { kit } = await oneJob({}, {}, 'FAKE-TRANSIENT-ONCE áo');
    await kit.tryon.worker.tick(); // gửi
    kit.tryon.clock.advance(2100);
    await kit.tryon.worker.tick(); // poll -> lỗi tạm thời -> về queued
    expect(jobRow(kit)).toMatchObject({ status: 'queued', attempts: 1 });
    await kit.tryon.worker.tick(); // chưa tới 2 giây
    expect(kit.tryon.provider.calls).toHaveLength(1);
    kit.tryon.clock.advance(2100);
    await kit.tryon.worker.tick();
    expect(kit.tryon.provider.calls).toHaveLength(2);
  });
});

describe('worker: đồng thời và ưu tiên (D-90)', () => {
  it('mỗi người tối đa 2 job đang gửi dù hàng đợi dài hơn', async () => {
    const kit = await setupTryon({}, { delayMs: 60_000 });
    const buyer = await kit.newBuyer();
    const cat = kit.category();
    for (const n of ['A', 'B', 'C', 'D']) await buyer.job(kit.product(n, cat.id).id);
    await kit.tryon.worker.tick();
    await kit.tryon.worker.tick();
    const statuses = kit.tryon.repository.jobs.map((j) => j.status).sort();
    expect(statuses).toEqual(['queued', 'queued', 'running', 'running']);
  });

  it('toàn hệ thống không vượt giới hạn; job hiển thị được nhận trước generate trước', async () => {
    const kit = await setupTryon({ TRYON_SYSTEM_CONCURRENCY: 1 }, { delayMs: 60_000 });
    const a = await kit.newBuyer();
    const b = await kit.newBuyer();
    const cat = kit.category();
    const prefetch = await a.job(kit.product('A', cat.id).id, { purpose: 'prefetch' });
    const display = await b.job(kit.product('B', cat.id).id, { purpose: 'display' });
    await kit.tryon.worker.tick();
    const byId = Object.fromEntries(kit.tryon.repository.jobs.map((j) => [j.id, j.status]));
    expect(byId[display.body.data.job.id]).toBe('running');
    expect(byId[prefetch.body.data.job.id]).toBe('queued');
    expect(Object.values(byId).filter((s) => s === 'running')).toHaveLength(1);
  });

  it('hai tick chạy chồng nhau không poll trùng, không lưu hai ảnh', async () => {
    const { kit } = await oneJob();
    await kit.tryon.worker.tick();
    kit.tryon.clock.advance(2100);
    await Promise.all([kit.tryon.worker.tick(), kit.tryon.worker.tick(), kit.tryon.worker.tick()]);
    expect(kit.tryon.supabase.state.uploads).toHaveLength(1);
    expect(kit.tryon.repository.images).toHaveLength(1);
    expect(jobRow(kit).status).toBe('succeeded');
  });

  it('lỗi khi đọc trạng thái (mạng) bị bỏ qua, lần sau poll lại, không làm hỏng job', async () => {
    const { kit } = await oneJob();
    await kit.tryon.worker.tick();
    const original = kit.tryon.provider.getStatus;
    let fails = 1;
    kit.tryon.provider.getStatus = async (id) => {
      if (fails-- > 0) throw Object.assign(new Error('net'), { providerCode: 'NetworkError' });
      return original(id);
    };
    kit.tryon.clock.advance(2100);
    await kit.tryon.worker.tick();
    expect(jobRow(kit).status).toBe('running');
    kit.tryon.clock.advance(2100);
    await kit.tryon.worker.tick();
    expect(jobRow(kit).status).toBe('succeeded');
  });
});

describe('worker: lưu kết quả lỗi (E17) và chết giữa chừng (E19)', () => {
  it('upload lỗi hai lần: TRYON_FAILED, tốn ngân sách, không tính lượt, không để file mồ côi', async () => {
    const { kit, buyer, jobId } = await oneJob();
    await kit.tryon.worker.tick();
    kit.tryon.supabase.state.failUpload = true;
    kit.tryon.clock.advance(2100);
    await kit.tryon.worker.tick();

    const job = (await buyer.jobStatus(jobId)).body.data.job;
    expect([job.status, job.error.code]).toEqual(['failed', 'TRYON_FAILED']);
    expect(kit.tryon.supabase.state.uploads).toHaveLength(2); // thử lại một lần
    expect(jobRow(kit)).toMatchObject({ charged_at: null, cost_incurred: true });
    expect(kit.tryon.repository.budget).toMatchObject({ spent: 75000, reserved: 0 });
    expect(kit.tryon.repository.images).toHaveLength(0);

    kit.tryon.supabase.state.failUpload = false;
    await kit.tryon.cleanup.kick();
    expect(kit.tryonObjects()).toEqual([]);
    expect(kit.tryon.repository.deletions.size).toBe(0);
    expect((await buyer.state()).body.data.quota.dailyUsed).toBe(0);
  });

  it('dịch vụ trả thứ không phải ảnh: không upload, TRYON_FAILED, tốn ngân sách', async () => {
    const { kit, buyer, jobId } = await oneJob();
    await kit.tryon.worker.tick();
    kit.tryon.provider.getStatus = async () => ({
      state: 'succeeded',
      image: Buffer.from('<html>captcha</html>'),
    });
    kit.tryon.clock.advance(2100);
    await kit.tryon.worker.tick();
    const job = (await buyer.jobStatus(jobId)).body.data.job;
    expect([job.status, job.error.code]).toEqual(['failed', 'TRYON_FAILED']);
    expect(kit.tryon.supabase.state.uploads).toHaveLength(0);
    expect(jobRow(kit)).toMatchObject({ charged_at: null, cost_incurred: true });
  });

  it('tiến trình chết sau khi nhận job, chưa kịp ghi provider_job_id: hết lease thì failed, tính ngân sách, không tính lượt', async () => {
    const { kit } = await oneJob();
    const claimed = await kit.tryon.repository.claimJobs(6); // nhận rồi "chết", không gửi gì
    expect(claimed).toHaveLength(1);
    kit.tryon.clock.advance(31_000);
    await kit.tryon.worker.tick();
    expect(jobRow(kit)).toMatchObject({
      status: 'failed',
      error_code: 'TRYON_FAILED',
      charged_at: null,
      cost_incurred: true,
    });
    expect(kit.tryon.repository.budget).toMatchObject({ spent: 75000, reserved: 0 });
  });

  it('chết sau khi upload (đã ghi pending_result_path): hết hạn thì file vào hàng đợi và bị xóa', async () => {
    const { kit } = await oneJob({}, { delayMs: 600_000 });
    await kit.tryon.worker.tick();
    const orphan = `${jobRow(kit).user_id}/3b241101-e2bb-4255-8caf-4136c566a962.jpg`;
    kit.tryon.supabase.objects.set(orphan, { body: Buffer.from('x') });
    jobRow(kit).pending_result_path = orphan;

    kit.tryon.clock.advance(121_000);
    await kit.tryon.worker.tick(); // expire_tryon_jobs
    await kit.tryon.cleanup.kick();
    expect(jobRow(kit)).toMatchObject({ status: 'failed', error_code: 'TRYON_TIMEOUT' });
    expect(kit.tryonObjects()).toEqual([]);
  });
});

describe('worker: vòng đời', () => {
  it('start() xử lý job rồi stop() dừng gọn, không giữ tiến trình', async () => {
    const { kit } = await oneJob();
    kit.tryon.worker.start();
    kit.tryon.worker.start(); // gọi hai lần không sinh hai vòng lặp
    kit.tryon.worker.wake();
    await vi.waitFor(() => expect(jobRow(kit).status).toBe('running'), { timeout: 3000 });
    const started = Date.now();
    await kit.tryon.worker.stop();
    expect(Date.now() - started).toBeLessThan(1500);
    await kit.tryon.worker.stop(); // dừng lần hai không lỗi
    await kit.ctx.services.stop();
  });

  it('lỗi DB trong một tick không làm sập worker; tick sau chạy bình thường', async () => {
    const { kit } = await oneJob();
    kit.tryon.repository.failNext.add('expireJobs');
    kit.tryon.repository.failNext.add('claimJobs');
    await expect(kit.tryon.worker.tick()).resolves.toBeUndefined();
    expect(jobRow(kit).status).toBe('queued');
    expect(kit.logs.lines.some((l) => l.event === 'TRYON_WORKER_CLAIM_FAILED')).toBe(true);
    await kit.tryon.worker.tick();
    expect(jobRow(kit).status).toBe('running');
  });
});
