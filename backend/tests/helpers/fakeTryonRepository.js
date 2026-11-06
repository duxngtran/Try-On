import { randomUUID } from 'node:crypto';

const DAY = 24 * 3600 * 1000;
const VN_OFFSET = 7 * 3600 * 1000;
const BLOCKED_CODES = ['TRYON_BLOCKED', 'TRYON_PHOTO_UNUSABLE'];

const dayStart = (ms) => Math.floor((ms + VN_OFFSET) / DAY) * DAY - VN_OFFSET;
const monthBounds = (ms) => {
  const d = new Date(ms + VN_OFFSET);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return {
    start: Date.UTC(y, m, 1) - VN_OFFSET,
    next: Date.UTC(y, m + 1, 1) - VN_OFFSET,
  };
};
const secondsUntil = (from, to) => Math.ceil((to - from) / 1000);

/**
 * Repository try-on trong bộ nhớ, mô phỏng ngữ nghĩa của các hàm SQL ở `migrations/006_create_tryon.sql`
 * (cùng `out_status`, cùng thứ tự kiểm tra) kể cả các trigger hủy hiệu lực, để test không cần DB.
 * Chỉ để test logic Node: các bảo đảm tương tranh thật nằm ở DB và được kiểm bằng `npm run verify:tryon`.
 * Thời gian lấy từ `clock.now()` nên test điều khiển được hạn 120 giây, hàng đợi 8 giây, v.v.
 */
export function createFakeTryonRepository({
  profileRepository,
  productRepository,
  categoryRepository,
  config,
  clock = { now: () => Date.now() },
}) {
  const jobs = [];
  const images = [];
  const deletions = new Map(); // path -> { attempts, nextAttemptAt }
  const budget = { spent: 0, reserved: 0, warnedAt: null };
  const calls = []; // tên hàm đã gọi, để test kiểm "không gọi khi thiếu điều kiện"
  const now = () => clock.now();

  const liveProfile = async (userId) => {
    await profileRepository.findByUserId(userId); // sinh hồ sơ rỗng như trigger DB
    return profileRepository.rows.get(userId) ?? null;
  };
  const completed = (pr) => Boolean(pr?.photo_path) && pr.height_cm != null && pr.weight_kg != null;
  const consentValid = (pr) =>
    Boolean(pr.tryon_consent_at) &&
    !pr.tryon_consent_withdrawn_at &&
    pr.tryon_consent_version === config.consentVersion;
  const product = (id) => productRepository.rows.find((r) => r.id === id);
  const activeProduct = (id) => {
    const p = product(id);
    return p && !p.deleted_at ? p : null;
  };
  const isLive = (j) => j.status === 'queued' || j.status === 'running';
  const sameKey = (a, b) =>
    a.user_id === b.user_id &&
    a.photo_version === b.photo_version &&
    a.product_id === b.product_id &&
    a.image_version === b.image_version;

  const queueDeletion = (path) => {
    if (path && !deletions.has(path)) deletions.set(path, { attempts: 0, nextAttemptAt: now() });
  };
  const settle = (job, incurred) => {
    budget.reserved = Math.max(budget.reserved - job.cost_micro_usd, 0);
    if (incurred) budget.spent += job.cost_micro_usd;
  };
  const deleteImages = (predicate) => {
    for (let i = images.length - 1; i >= 0; i -= 1) {
      if (predicate(images[i])) queueDeletion(images.splice(i, 1)[0].storage_path);
    }
  };
  const cancelQueued = ({ userId = null, productId = null, purpose = null }) => {
    for (const j of jobs) {
      if (j.status !== 'queued') continue;
      if (userId && j.user_id !== userId) continue;
      if (productId && j.product_id !== productId) continue;
      if (purpose && j.purpose !== purpose) continue;
      j.status = 'canceled';
      j.finished_at = now();
      settle(j, false);
    }
  };

  /** Job còn hợp lệ so với dữ liệu hiện tại (tryon_job_key_is_current). */
  const keyIsCurrent = (j) => {
    const pr = profileRepository.rows.get(j.user_id);
    const pd = activeProduct(j.product_id);
    return Boolean(
      pr &&
      pd &&
      completed(pr) &&
      pr.photo_version === j.photo_version &&
      pr.tryon_consent_generation === j.consent_generation &&
      consentValid(pr) &&
      pd.image_version === j.image_version,
    );
  };

  // Trigger DB: đổi ảnh hồ sơ / ảnh sản phẩm / xóa mềm sản phẩm hủy hiệu lực ảnh try-on.
  profileRepository.listeners?.push((userId) => {
    deleteImages((i) => i.user_id === userId);
    cancelQueued({ userId });
  });
  productRepository.listeners?.push((productId) => {
    deleteImages((i) => i.product_id === productId);
    cancelQueued({ productId });
  });

  const usage = (userId) => {
    const t = now();
    const { start, next } = monthBounds(t);
    const charged = jobs.filter((j) => j.user_id === userId && j.charged_at != null);
    return {
      usedDay: charged.filter((j) => j.charged_at >= dayStart(t)).length,
      usedMonth: charged.filter((j) => j.charged_at >= start).length,
      held: jobs.filter((j) => j.user_id === userId && isLive(j)).length,
      dayResetsAt: new Date(dayStart(t) + DAY).toISOString(),
      monthResetsAt: new Date(next).toISOString(),
    };
  };

  const outcome = (status, extra = {}) => ({
    status,
    jobId: null,
    jobStatus: null,
    storagePath: null,
    errorCode: null,
    retryAfterSeconds: null,
    budgetWarning: false,
    ...extra,
  });

  return {
    jobs,
    images,
    deletions,
    budget,
    calls,
    /** Làm hỏng lần gọi kế tiếp của một hàm (mô phỏng DB lỗi). */
    failNext: new Set(),

    async guard(name) {
      calls.push(name);
      if (this.failNext.delete(name)) throw new Error('db down');
    },

    // ---- Hồ sơ, consent ----
    async getProfileState(userId) {
      await this.guard('getProfileState');
      const pr = await liveProfile(userId);
      return pr ? { ...pr } : null;
    },
    async acceptConsent(userId) {
      await this.guard('acceptConsent');
      const pr = await liveProfile(userId);
      if (
        !pr.tryon_consent_at ||
        pr.tryon_consent_withdrawn_at ||
        pr.tryon_consent_version !== config.consentVersion
      ) {
        pr.tryon_consent_at = new Date(now()).toISOString().replace('Z', '123+00:00');
        pr.tryon_consent_version = config.consentVersion;
        pr.tryon_consent_withdrawn_at = null;
      }
    },
    async withdrawConsent(userId) {
      await this.guard('withdrawConsent');
      const pr = await liveProfile(userId);
      if (!pr.tryon_consent_at || pr.tryon_consent_withdrawn_at) return 'not_active';
      pr.tryon_consent_withdrawn_at = new Date(now()).toISOString();
      pr.tryon_consent_generation += 1;
      deleteImages((i) => i.user_id === userId);
      cancelQueued({ userId });
      return 'ok';
    },

    // ---- Danh mục, sản phẩm ----
    async categoryIsActive(categoryId) {
      return Boolean(categoryRepository.rows.find((c) => c.id === categoryId && !c.deleted_at));
    },
    async findProductAnchor(productId) {
      const p = product(productId);
      return p
        ? {
            id: p.id,
            categoryId: p.category_id,
            createdAt: p.created_at,
            deleted: Boolean(p.deleted_at),
          }
        : null;
    },
    async listProducts({ categoryId, limit, cursor, direction, inclusive }) {
      await this.guard('listProducts');
      const category = categoryRepository.rows.find((c) => c.id === categoryId && !c.deleted_at);
      if (!category) return [];
      const active = productRepository.rows
        .filter((r) => !r.deleted_at && r.category_id === categoryId)
        .sort((a, b) => b.seq - a.seq);
      const cursorSeq = cursor ? productRepository.rows.find((r) => r.id === cursor.id)?.seq : null;
      let page;
      if (cursorSeq == null) page = active.slice(0, limit);
      else if (direction === 'next') {
        page = active.filter((r) => (inclusive ? r.seq <= cursorSeq : r.seq < cursorSeq));
        page = page.slice(0, limit);
      } else {
        page = active
          .filter((r) => r.seq > cursorSeq)
          .reverse()
          .slice(0, limit)
          .reverse();
      }
      return page.map((r) => ({
        id: r.id,
        name: r.name,
        priceVnd: r.price_vnd,
        imagePath: r.image_path,
        imageVersion: r.image_version,
        createdAtRaw: r.created_at.replace('T', ' ').replace('+00:00', '+00'),
        categoryName: category.name,
        position: active.filter((n) => n.seq > r.seq).length + 1,
        total: active.length,
      }));
    },

    // ---- Job, kết quả ----
    async createJob({ userId, productId, purpose }) {
      await this.guard('createJob');
      const pr = await liveProfile(userId);
      if (!pr || !completed(pr)) return outcome('profile_incomplete');
      if (!consentValid(pr)) return outcome('consent_required');
      const pd = activeProduct(productId);
      if (!pd) return outcome('not_found');

      const key = {
        user_id: userId,
        photo_version: pr.photo_version,
        product_id: productId,
        image_version: pd.image_version,
      };
      const image = images.find((i) => sameKey(i, key));
      if (image) {
        image.last_viewed_at = now();
        image.first_viewed_at ??= now();
        return outcome('ready', { storagePath: image.storage_path });
      }

      const existing = jobs.find((j) => isLive(j) && sameKey(j, key));
      if (existing) {
        existing.last_seen_at = now();
        if (purpose === 'display') existing.purpose = 'display';
        return outcome('attached', { jobId: existing.id, jobStatus: existing.status });
      }

      const blocked = jobs
        .filter(
          (j) =>
            sameKey(j, key) &&
            j.model_name === config.modelName &&
            BLOCKED_CODES.includes(j.error_code),
        )
        .sort((a, b) => b.created_at - a.created_at)[0];
      if (blocked) return outcome('blocked', { errorCode: blocked.error_code });

      const liveOf = () => jobs.filter((j) => j.user_id === userId && isLive(j)).length;
      let active = liveOf();
      if (purpose === 'display' && active >= config.maxRunningPerUser) {
        cancelQueued({ userId, purpose: 'prefetch' });
        active = liveOf();
      }
      if (purpose === 'prefetch' && active >= config.maxRunningPerUser) {
        return outcome('skipped_busy');
      }
      if (purpose === 'display' && active >= config.maxActivePerUser) {
        return outcome('busy', { retryAfterSeconds: 5 });
      }

      const t = now();
      const u = usage(userId);
      if (u.usedDay >= config.dailyLimit) {
        return outcome('quota_day', { retryAfterSeconds: secondsUntil(t, dayStart(t) + DAY) });
      }
      if (u.usedMonth >= config.monthlyLimit) {
        return outcome('quota_month', {
          retryAfterSeconds: secondsUntil(t, monthBounds(t).next),
        });
      }
      const remaining =
        Math.min(config.dailyLimit - u.usedDay, config.monthlyLimit - u.usedMonth) - active;
      if (remaining <= 0) {
        return purpose === 'prefetch'
          ? outcome('skipped_low_quota')
          : outcome('quota_pending', { retryAfterSeconds: 15 });
      }
      if (purpose === 'prefetch' && remaining <= config.prefetchMinRemaining) {
        return outcome('skipped_low_quota');
      }
      if (purpose === 'prefetch' && jobs.filter(isLive).length >= config.systemConcurrency) {
        return outcome('skipped_busy');
      }

      const committed = budget.spent + budget.reserved;
      const overWarn =
        (committed + config.costMicroUsd) * 100 >=
        config.budgetLimitMicroUsd * config.budgetWarnPercent;
      if (purpose === 'prefetch' && overWarn) return outcome('skipped_budget');
      if (committed + config.costMicroUsd > config.budgetLimitMicroUsd) {
        return outcome('budget_exceeded');
      }
      const warn = budget.warnedAt == null && overWarn;
      if (warn) budget.warnedAt = t;
      budget.reserved += config.costMicroUsd;

      const job = {
        id: randomUUID(),
        ...key,
        consent_generation: pr.tryon_consent_generation,
        purpose,
        status: 'queued',
        error_code: null,
        provider: config.provider,
        model_name: config.modelName,
        provider_job_id: null,
        attempts: 0,
        cost_micro_usd: config.costMicroUsd,
        next_run_at: t,
        deadline_at: t + config.deadlineSeconds * 1000,
        last_seen_at: t,
        submitted_at: null,
        pending_result_path: null,
        charged_at: null,
        cost_incurred: false,
        finished_at: null,
        created_at: t,
      };
      jobs.push(job);
      return outcome('created', { jobId: job.id, jobStatus: 'queued', budgetWarning: warn });
    },

    async getResult({ userId, productId }) {
      await this.guard('getResult');
      const base = {
        storagePath: null,
        width: null,
        height: null,
        jobId: null,
        jobStatus: null,
        errorCode: null,
      };
      const pr = await liveProfile(userId);
      if (!pr || !completed(pr)) return { ...base, state: 'profile_incomplete' };
      if (!consentValid(pr)) return { ...base, state: 'consent_required' };
      const pd = activeProduct(productId);
      if (!pd) return { ...base, state: 'not_found' };

      const key = {
        user_id: userId,
        photo_version: pr.photo_version,
        product_id: productId,
        image_version: pd.image_version,
      };
      const image = images.find((i) => sameKey(i, key));
      if (image) {
        image.first_viewed_at ??= now();
        image.last_viewed_at = now();
        return {
          ...base,
          state: 'ready',
          storagePath: image.storage_path,
          width: image.width,
          height: image.height,
        };
      }
      const live = jobs.find((j) => isLive(j) && sameKey(j, key));
      if (live) {
        live.last_seen_at = now();
        return { ...base, state: 'pending', jobId: live.id, jobStatus: live.status };
      }
      const blocked = jobs
        .filter(
          (j) =>
            sameKey(j, key) &&
            j.model_name === config.modelName &&
            BLOCKED_CODES.includes(j.error_code),
        )
        .sort((a, b) => b.created_at - a.created_at)[0];
      if (blocked) return { ...base, state: 'blocked', errorCode: blocked.error_code };
      return { ...base, state: 'none' };
    },

    async getJob({ jobId, userId }) {
      await this.guard('getJob');
      const job = jobs.find((j) => j.id === jobId && j.user_id === userId);
      if (!job) return null;
      if (isLive(job)) job.last_seen_at = now();
      const image = job.status === 'succeeded' ? images.find((i) => sameKey(i, job)) : undefined;
      return {
        id: job.id,
        productId: job.product_id,
        purpose: job.purpose,
        status: job.status,
        errorCode: job.error_code,
        createdAt: new Date(job.created_at).toISOString().replace('Z', '893+00:00'),
        current: keyIsCurrent(job),
        storagePath: image?.storage_path ?? null,
        width: image?.width ?? null,
        height: image?.height ?? null,
      };
    },

    async getUsage(userId) {
      await this.guard('getUsage');
      const u = usage(userId);
      const committed = budget.spent + budget.reserved;
      return {
        ...u,
        budgetOk: committed + config.costMicroUsd <= config.budgetLimitMicroUsd,
        prefetchOk:
          (committed + config.costMicroUsd) * 100 <
          config.budgetLimitMicroUsd * config.budgetWarnPercent,
      };
    },

    // ---- Worker ----
    async expireJobs() {
      await this.guard('expireJobs');
      let count = 0;
      for (const j of jobs) {
        if (!isLive(j)) continue;
        const pastDeadline = j.deadline_at <= now();
        const leaseLost = j.status === 'running' && !j.provider_job_id && j.next_run_at <= now();
        if (!pastDeadline && !leaseLost) continue;
        const incurred = j.status === 'running';
        j.status = 'failed';
        j.error_code = pastDeadline ? 'TRYON_TIMEOUT' : 'TRYON_FAILED';
        j.finished_at = now();
        j.cost_incurred ||= incurred;
        queueDeletion(j.pending_result_path);
        j.pending_result_path = null;
        settle(j, incurred);
        count += 1;
      }
      return count;
    },

    async claimJobs(batch) {
      await this.guard('claimJobs');
      const t = now();
      for (const j of jobs) {
        if (j.status === 'queued' && j.last_seen_at < t - config.staleSeconds * 1000) {
          j.status = 'canceled';
          j.finished_at = t;
          settle(j, false);
        }
      }
      let system = jobs.filter((j) => j.status === 'running').length;
      const queued = jobs
        .filter((j) => j.status === 'queued' && j.next_run_at <= t)
        .sort(
          (a, b) =>
            Number(b.purpose === 'display') - Number(a.purpose === 'display') ||
            a.created_at - b.created_at,
        );
      const taken = [];
      for (const j of queued) {
        if (taken.length >= batch || system >= config.systemConcurrency) break;
        const running = jobs.filter((x) => x.user_id === j.user_id && x.status === 'running');
        if (running.length >= config.maxRunningPerUser) continue;
        if (!keyIsCurrent(j)) {
          j.status = 'canceled';
          j.finished_at = t;
          settle(j, false);
          continue;
        }
        j.status = 'running';
        j.attempts += 1;
        j.next_run_at = t + config.leaseSeconds * 1000;
        system += 1;
        taken.push({
          jobId: j.id,
          userId: j.user_id,
          productId: j.product_id,
          photoPath: profileRepository.rows.get(j.user_id).photo_path,
          imagePath: product(j.product_id).image_path,
        });
      }
      return taken;
    },

    async checkBeforeSubmit(jobId) {
      await this.guard('checkBeforeSubmit');
      const j = jobs.find((x) => x.id === jobId && x.status === 'running');
      if (!j) return 'canceled';
      if (keyIsCurrent(j)) return 'ok';
      j.status = 'canceled';
      j.finished_at = now();
      settle(j, false);
      return 'canceled';
    },

    async markSubmitted(jobId, providerJobId) {
      await this.guard('markSubmitted');
      const j = jobs.find((x) => x.id === jobId && x.status === 'running');
      if (!j) return;
      j.provider_job_id = providerJobId;
      j.submitted_at = now();
      j.next_run_at = now() + config.pollSeconds * 1000;
    },

    async nextPolls(batch) {
      await this.guard('nextPolls');
      const due = jobs
        .filter((j) => j.status === 'running' && j.provider_job_id && j.next_run_at <= now())
        .sort((a, b) => a.next_run_at - b.next_run_at)
        .slice(0, batch);
      for (const j of due) j.next_run_at = now() + config.pollSeconds * 1000;
      return due.map((j) => ({ jobId: j.id, userId: j.user_id, providerJobId: j.provider_job_id }));
    },

    async reservePath(jobId, path) {
      await this.guard('reservePath');
      const j = jobs.find((x) => x.id === jobId && x.status === 'running');
      if (!j || !keyIsCurrent(j)) return false;
      j.pending_result_path = path;
      return true;
    },

    async completeJob({ jobId, path, width, height }) {
      await this.guard('completeJob');
      const j = jobs.find((x) => x.id === jobId);
      if (!j) return 'stale';
      if (j.status !== 'running') {
        queueDeletion(path);
        return 'stale';
      }
      let current = path != null && keyIsCurrent(j);
      if (current) {
        if (images.some((i) => sameKey(i, j))) current = false;
        else {
          images.push({
            id: randomUUID(),
            user_id: j.user_id,
            product_id: j.product_id,
            photo_version: j.photo_version,
            image_version: j.image_version,
            storage_path: path,
            width,
            height,
            model_name: j.model_name,
            first_viewed_at: null,
            last_viewed_at: now(),
          });
        }
      }
      if (!current) queueDeletion(path);
      j.status = current ? 'succeeded' : 'discarded';
      j.finished_at = now();
      j.charged_at = now();
      j.cost_incurred = true;
      j.pending_result_path = null;
      settle(j, true);
      return current ? 'saved' : 'discarded';
    },

    async failJob({ jobId, errorCode, costIncurred, retrySeconds, maxAttempts }) {
      await this.guard('failJob');
      const j = jobs.find((x) => x.id === jobId);
      if (!j || j.status !== 'running') return 'stale';
      queueDeletion(j.pending_result_path);
      if (
        retrySeconds != null &&
        j.attempts < maxAttempts &&
        now() + retrySeconds * 1000 < j.deadline_at
      ) {
        j.status = 'queued';
        j.provider_job_id = null;
        j.pending_result_path = null;
        j.next_run_at = now() + retrySeconds * 1000;
        return 'retrying';
      }
      j.status = 'failed';
      j.error_code = errorCode;
      j.finished_at = now();
      j.cost_incurred ||= costIncurred;
      j.pending_result_path = null;
      settle(j, costIncurred);
      return 'failed';
    },

    // ---- Dọn dẹp ----
    async claimFileDeletions(batch) {
      await this.guard('claimFileDeletions');
      const due = [...deletions.entries()]
        .filter(([, d]) => d.nextAttemptAt <= now())
        .sort((a, b) => a[1].nextAttemptAt - b[1].nextAttemptAt)
        .slice(0, batch);
      return due.map(([path, d]) => {
        d.attempts += 1;
        d.nextAttemptAt = now() + config.deleteRetrySeconds * 1000;
        return { path, attempts: d.attempts };
      });
    },
    async ackFileDeletions(paths) {
      await this.guard('ackFileDeletions');
      for (const p of paths) deletions.delete(p);
    },
    async purgeStaleImages() {
      const before = images.length;
      deleteImages((i) => i.last_viewed_at < now() - config.imageRetentionDays * DAY);
      return before - images.length;
    },
    async purgeOldJobs() {
      let removed = 0;
      for (let i = jobs.length - 1; i >= 0; i -= 1) {
        const j = jobs[i];
        if (j.finished_at != null && j.finished_at < now() - config.jobRetentionDays * DAY) {
          jobs.splice(i, 1);
          removed += 1;
        }
      }
      return removed;
    },
    async purgeImagesExceptCurrentModel() {
      const before = images.length;
      deleteImages((i) => i.model_name !== config.modelName);
      return before - images.length;
    },
  };
}
