import { getSupabase } from '../config/supabase.js';

const PROFILE_COLUMNS =
  'height_cm, weight_kg, photo_path, photo_version, tryon_consent_at, tryon_consent_version, tryon_consent_withdrawn_at';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

const rows = (data) => (Array.isArray(data) ? data : data == null ? [] : [data]);
const firstRow = (data) => rows(data)[0] ?? null;

/**
 * Truy cập các bảng và hàm SQL của phòng thử đồ (db/README.md mục 4). Service không biết tới `rpc`.
 * `config` (từ `buildTryonConfig`) là nơi **duy nhất** quy đổi giới hạn, ngân sách từ env sang tham số SQL.
 * Trả hàng đã đổi sang camelCase; không map tên `out_*` ra ngoài repository.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {ReturnType<import('../services/tryon/config.js').buildTryonConfig>} config
 */
export function createTryonRepository(client = getSupabase(), config) {
  if (!config) throw new Error('createTryonRepository cần config');
  const rpc = async (name, args) => unwrap(await client.rpc(name, args));

  return {
    // ---- Hồ sơ, consent ----
    /** Cột của `profiles` cần cho GET /state. Trả null nếu không có hồ sơ. */
    async getProfileState(userId) {
      return unwrap(
        await client.from('profiles').select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle(),
      );
    },

    async acceptConsent(userId) {
      await rpc('accept_tryon_consent', { p_user_id: userId, p_version: config.consentVersion });
    },

    /** @returns {Promise<'ok' | 'not_active'>} */
    async withdrawConsent(userId) {
      return firstRow(await rpc('withdraw_tryon_consent', { p_user_id: userId })).out_status;
    },

    // ---- Danh mục, sản phẩm ----
    async categoryIsActive(categoryId) {
      const data = unwrap(
        await client
          .from('categories')
          .select('id')
          .eq('id', categoryId)
          .is('deleted_at', null)
          .maybeSingle(),
      );
      return Boolean(data);
    },

    /**
     * Sản phẩm làm mốc cho `at`, kể cả đã xóa mềm. `createdAt` giữ nguyên chuỗi PostgREST (micro giây),
     * không qua `Date`.
     * @returns {Promise<{ id: string, categoryId: string, createdAt: string, deleted: boolean } | null>}
     */
    async findProductAnchor(productId) {
      const row = unwrap(
        await client
          .from('products')
          .select('id, category_id, created_at, deleted_at')
          .eq('id', productId)
          .maybeSingle(),
      );
      return row
        ? {
            id: row.id,
            categoryId: row.category_id,
            createdAt: row.created_at,
            deleted: row.deleted_at != null,
          }
        : null;
    },

    /**
     * @param {{ categoryId: string, limit: number, cursor: { createdAt: string, id: string } | null,
     *   direction: 'next' | 'prev', inclusive: boolean }} query
     */
    async listProducts({ categoryId, limit, cursor, direction, inclusive }) {
      const data = await rpc('list_tryon_products', {
        p_category_id: categoryId,
        p_limit: limit,
        p_cursor_created_at: cursor?.createdAt ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_direction: direction,
        p_inclusive: inclusive,
      });
      return rows(data).map((r) => ({
        id: r.id,
        name: r.name,
        priceVnd: r.price_vnd,
        imagePath: r.image_path,
        imageVersion: r.image_version,
        createdAtRaw: r.created_at_raw,
        categoryName: r.category_name,
        position: r.row_position,
        total: r.total,
      }));
    },

    // ---- Job, kết quả ----
    async createJob({ userId, productId, purpose }) {
      const row = firstRow(
        await rpc('create_tryon_job', {
          p_user_id: userId,
          p_product_id: productId,
          p_purpose: purpose,
          p_consent_version: config.consentVersion,
          p_provider: config.provider,
          p_model_name: config.modelName,
          p_daily_limit: config.dailyLimit,
          p_monthly_limit: config.monthlyLimit,
          p_max_running_per_user: config.maxRunningPerUser,
          p_max_active_per_user: config.maxActivePerUser,
          p_system_concurrency: config.systemConcurrency,
          p_cost_micro_usd: config.costMicroUsd,
          p_budget_limit_micro_usd: config.budgetLimitMicroUsd,
          p_prefetch_min_remaining: config.prefetchMinRemaining,
          p_budget_warn_percent: config.budgetWarnPercent,
          p_deadline_seconds: config.deadlineSeconds,
        }),
      );
      if (!row) throw new Error('create_tryon_job không trả về dòng nào');
      return {
        status: row.out_status,
        jobId: row.out_job_id,
        jobStatus: row.out_job_status,
        storagePath: row.out_storage_path,
        errorCode: row.out_error_code,
        retryAfterSeconds: row.out_retry_after_seconds,
        budgetWarning: Boolean(row.out_budget_warning),
      };
    },

    async getResult({ userId, productId }) {
      const row = firstRow(
        await rpc('get_tryon_result', {
          p_user_id: userId,
          p_product_id: productId,
          p_consent_version: config.consentVersion,
          p_model_name: config.modelName,
        }),
      );
      if (!row) throw new Error('get_tryon_result không trả về dòng nào');
      return {
        state: row.out_state,
        storagePath: row.out_storage_path,
        width: row.out_width,
        height: row.out_height,
        jobId: row.out_job_id,
        jobStatus: row.out_job_status,
        errorCode: row.out_error_code,
      };
    },

    /** Trả null nếu không có job hoặc job của người khác. */
    async getJob({ jobId, userId }) {
      const row = firstRow(
        await rpc('get_tryon_job', {
          p_job_id: jobId,
          p_user_id: userId,
          p_consent_version: config.consentVersion,
        }),
      );
      return row
        ? {
            id: row.out_id,
            productId: row.out_product_id,
            purpose: row.out_purpose,
            status: row.out_status,
            errorCode: row.out_error_code,
            createdAt: row.out_created_at,
            current: Boolean(row.out_current),
            storagePath: row.out_storage_path,
            width: row.out_width,
            height: row.out_height,
          }
        : null;
    },

    async getUsage(userId) {
      const row = firstRow(
        await rpc('get_tryon_usage', {
          p_user_id: userId,
          p_budget_limit_micro_usd: config.budgetLimitMicroUsd,
          p_budget_warn_percent: config.budgetWarnPercent,
          p_cost_micro_usd: config.costMicroUsd,
        }),
      );
      if (!row) throw new Error('get_tryon_usage không trả về dòng nào');
      return {
        usedDay: row.out_used_day,
        usedMonth: row.out_used_month,
        held: row.out_held,
        dayResetsAt: row.out_day_resets_at,
        monthResetsAt: row.out_month_resets_at,
        budgetOk: Boolean(row.out_budget_ok),
        prefetchOk: Boolean(row.out_prefetch_ok),
      };
    },

    // ---- Worker ----
    async expireJobs() {
      return firstRow(await rpc('expire_tryon_jobs', {}))?.out_expired ?? 0;
    },

    async claimJobs(batch) {
      const data = await rpc('claim_tryon_jobs', {
        p_batch: batch,
        p_max_running_per_user: config.maxRunningPerUser,
        p_system_concurrency: config.systemConcurrency,
        p_stale_seconds: config.staleSeconds,
        p_lease_seconds: config.leaseSeconds,
        p_consent_version: config.consentVersion,
      });
      return rows(data).map((r) => ({
        jobId: r.out_job_id,
        userId: r.out_user_id,
        productId: r.out_product_id,
        photoPath: r.out_photo_path,
        imagePath: r.out_image_path,
      }));
    },

    /** @returns {Promise<'ok' | 'canceled'>} */
    async checkBeforeSubmit(jobId) {
      const data = await rpc('check_tryon_job_before_submit', {
        p_job_id: jobId,
        p_consent_version: config.consentVersion,
      });
      return firstRow(data).out_status;
    },

    async markSubmitted(jobId, providerJobId) {
      await rpc('mark_tryon_job_submitted', {
        p_job_id: jobId,
        p_provider_job_id: providerJobId,
        p_poll_seconds: config.pollSeconds,
      });
    },

    async nextPolls(batch) {
      const data = await rpc('next_tryon_polls', {
        p_batch: batch,
        p_poll_seconds: config.pollSeconds,
      });
      return rows(data).map((r) => ({
        jobId: r.out_job_id,
        userId: r.out_user_id,
        providerJobId: r.out_provider_job_id,
      }));
    },

    /** @returns {Promise<boolean>} false: job đã hết hiệu lực, không được upload. */
    async reservePath(jobId, path) {
      return Boolean(
        await rpc('reserve_tryon_result_path', {
          p_job_id: jobId,
          p_path: path,
          p_consent_version: config.consentVersion,
        }),
      );
    },

    /** @returns {Promise<'saved' | 'discarded' | 'stale'>} */
    async completeJob({ jobId, path, width, height }) {
      const data = await rpc('complete_tryon_job', {
        p_job_id: jobId,
        p_result_path: path,
        p_width: width,
        p_height: height,
        p_consent_version: config.consentVersion,
      });
      return firstRow(data).out_status;
    },

    /** @returns {Promise<'failed' | 'retrying' | 'stale'>} */
    async failJob({ jobId, errorCode, costIncurred, retrySeconds, maxAttempts }) {
      const data = await rpc('fail_tryon_job', {
        p_job_id: jobId,
        p_error_code: errorCode,
        p_cost_incurred: costIncurred,
        p_retry_seconds: retrySeconds ?? null,
        p_max_attempts: maxAttempts,
      });
      return firstRow(data).out_status;
    },

    // ---- Dọn dẹp ----
    async claimFileDeletions(batch) {
      const data = await rpc('claim_tryon_file_deletions', {
        p_batch: batch,
        p_retry_seconds: config.deleteRetrySeconds,
      });
      return rows(data).map((r) => ({ path: r.out_storage_path, attempts: r.out_attempts }));
    },

    async ackFileDeletions(paths) {
      await rpc('ack_tryon_file_deletions', { p_paths: paths });
    },

    async purgeStaleImages() {
      return firstRow(await rpc('purge_stale_tryon_images', { p_days: config.imageRetentionDays }))
        .out_deleted;
    },

    async purgeOldJobs() {
      return firstRow(await rpc('purge_old_tryon_jobs', { p_days: config.jobRetentionDays }))
        .out_deleted;
    },

    /** D-89: xóa ảnh của model khác model hiện tại. */
    async purgeImagesExceptCurrentModel() {
      return firstRow(
        await rpc('purge_tryon_images_except_model', { p_keep_model: config.modelName }),
      ).out_deleted;
    },
  };
}
