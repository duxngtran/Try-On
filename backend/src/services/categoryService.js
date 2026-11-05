import { AppError } from '../utils/AppError.js';
import { DuplicateCategoryNameError } from '../repositories/categoryRepository.js';
import { CATEGORY_MESSAGES } from '../validation/categorySchemas.js';

const NAME_EXISTS = () => new AppError(409, 'CATEGORY_NAME_EXISTS', CATEGORY_MESSAGES.exists);
const NOT_FOUND = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy danh mục.');
const HAS_PRODUCTS = (productCount) =>
  new AppError(
    409,
    'CATEGORY_HAS_PRODUCTS',
    `Danh mục đang có ${productCount} sản phẩm. Hãy chuyển hoặc xóa các sản phẩm này trước.`,
    { productCount },
  );

/** Postgres trả `...893014+00:00`; contract yêu cầu ISO 8601 UTC dạng `...893Z`. */
const iso = (value) => new Date(value).toISOString();

/** Hàng DB (snake_case) -> `Category` của API (api.md 6.1). */
export function toCategory(row, productCount) {
  return {
    id: row.id,
    name: row.name,
    productCount,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/**
 * @param {{ categoryRepository: ReturnType<import('../repositories/categoryRepository.js').createCategoryRepository> }} deps
 */
export function createCategoryService({ categoryRepository }) {
  /** Chuyển lỗi unique của repository thành lỗi nghiệp vụ. */
  const guardDuplicate = async (promise) => {
    try {
      return await promise;
    } catch (err) {
      if (err instanceof DuplicateCategoryNameError) throw NAME_EXISTS();
      throw err;
    }
  };

  return {
    async list() {
      const rows = await categoryRepository.listWithCounts();
      return rows.map((row) => toCategory(row, row.product_count));
    },

    /** @param {string} name Tên đã chuẩn hóa và kiểm tra ở middleware validate. */
    async create(name) {
      const row = await guardDuplicate(categoryRepository.insert(name));
      return toCategory(row, 0);
    },

    async rename(id, name) {
      const row = await guardDuplicate(categoryRepository.rename(id, name));
      if (!row) throw NOT_FOUND();
      return toCategory(row, await categoryRepository.countActiveProducts(id));
    },

    async remove(id) {
      const { status, productCount } = await categoryRepository.softDelete(id);
      if (status === 'not_found') throw NOT_FOUND();
      if (status === 'has_products') throw HAS_PRODUCTS(productCount);
      return { id };
    },
  };
}
