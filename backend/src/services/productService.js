import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { PRODUCT_MESSAGES } from '../validation/productSchemas.js';
import { processProductImage } from './image.js';

const NOT_FOUND = () => new AppError(404, 'NOT_FOUND', 'Sản phẩm không còn tồn tại.');
const CATEGORY_NOT_FOUND = () =>
  new AppError(
    400,
    'CATEGORY_NOT_FOUND',
    'Danh mục không còn tồn tại, vui lòng chọn danh mục khác.',
  );
const FILE_REQUIRED = () => new AppError(400, 'FILE_REQUIRED', 'Vui lòng chọn ảnh sản phẩm.');
const NO_CHANGE = () =>
  new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.', [
    { field: '', message: PRODUCT_MESSAGES.noChange },
  ]);

/** Postgres trả `...893014+00:00`; contract yêu cầu ISO 8601 UTC dạng `...893Z`. */
const iso = (value) => new Date(value).toISOString();

/**
 * Hàng DB -> `Product` của API (api.md 6.2). Không trả `image_path`.
 * @param {ReturnType<import('./productImageStorage.js').createProductImageStorage>} imageStorage
 */
export const createToProduct = (imageStorage) => (row) => ({
  id: row.id,
  name: row.name,
  priceVnd: row.price_vnd,
  category: { id: row.category.id, name: row.category.name },
  image: { url: imageStorage.publicUrl(row.image_path), version: row.image_version },
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

/**
 * Nghiệp vụ sản phẩm (US-04). Thứ tự ghi (D-25, D-49): xử lý ảnh -> upload file mới -> ghi DB -> xóa file cũ.
 * Log chỉ chứa mã sự kiện + productId, không đường dẫn ảnh (US-04 §9).
 * @param {{
 *   productRepository: ReturnType<import('../repositories/productRepository.js').createProductRepository>,
 *   imageStorage: ReturnType<import('./productImageStorage.js').createProductImageStorage>,
 *   processImage?: (buffer: Buffer) => Promise<Buffer>,
 *   logger?: Pick<Console, 'error'>,
 *   newId?: () => string,
 * }} deps
 */
export function createProductService({
  productRepository,
  imageStorage,
  processImage = processProductImage,
  logger = console,
  newId = randomUUID,
}) {
  const toProduct = createToProduct(imageStorage);

  /** Xóa file, thử lại 1 lần; vẫn lỗi thì ghi ORPHAN_PRODUCT_IMAGE (không làm request lỗi). */
  const removeBestEffort = async (path, productId) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await imageStorage.remove(path);
        return true;
      } catch {
        // thử lại một lần
      }
    }
    logger.error('ORPHAN_PRODUCT_IMAGE', { productId });
    return false;
  };

  const requireProduct = async (id) => {
    const row = await productRepository.findById(id);
    if (!row) throw NOT_FOUND();
    return row;
  };

  const assertCategoryActive = async (categoryId) => {
    if (!(await productRepository.activeCategoryExists(categoryId))) throw CATEGORY_NOT_FOUND();
  };

  /** Ghi DB; lỗi (hoặc kết quả từ chối) thì xóa file mới để không để lại file mồ côi. */
  const writeOrRollback = async (productId, newPath, write) => {
    try {
      return await write();
    } catch (err) {
      if (newPath) await removeBestEffort(newPath, productId);
      throw err;
    }
  };

  return {
    async list({ page, limit, categoryId }) {
      const { rows, total } = await productRepository.list({ page, limit, categoryId });
      return {
        items: rows.map(toProduct),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },

    async get(id) {
      return toProduct(await requireProduct(id));
    },

    /**
     * @param {{ name: string, priceVnd: number, categoryId: string }} input đã validate
     * @param {Buffer | undefined} fileBuffer
     */
    async create({ name, priceVnd, categoryId }, fileBuffer) {
      if (!fileBuffer) throw FILE_REQUIRED();
      await assertCategoryActive(categoryId);
      const jpeg = await processImage(fileBuffer);

      const id = newId();
      const imagePath = await imageStorage.upload(id, jpeg);
      const status = await writeOrRollback(id, imagePath, () =>
        productRepository.create({ id, name, priceVnd, categoryId, imagePath }),
      );
      if (status !== 'ok') {
        await removeBestEffort(imagePath, id);
        throw CATEGORY_NOT_FOUND();
      }
      return toProduct(await requireProduct(id));
    },

    /**
     * @param {string} id
     * @param {{ name?: string, priceVnd?: number, categoryId?: string }} input đã validate
     * @param {Buffer | undefined} fileBuffer
     */
    async update(id, input, fileBuffer) {
      const hasFields = Object.values(input).some((v) => v !== undefined);
      if (!hasFields && !fileBuffer) throw NO_CHANGE();

      const existing = await requireProduct(id);
      if (input.categoryId && input.categoryId !== existing.category.id) {
        await assertCategoryActive(input.categoryId);
      }

      let newImagePath;
      if (fileBuffer) {
        const jpeg = await processImage(fileBuffer);
        newImagePath = await imageStorage.upload(id, jpeg);
      }

      const result = await writeOrRollback(id, newImagePath, () =>
        productRepository.update({ id, ...input, newImagePath }),
      );
      if (result.status !== 'ok') {
        if (newImagePath) await removeBestEffort(newImagePath, id);
        throw result.status === 'not_found' ? NOT_FOUND() : CATEGORY_NOT_FOUND();
      }
      if (result.oldImagePath) await removeBestEffort(result.oldImagePath, id);
      return toProduct(await requireProduct(id));
    },

    /** Xóa mềm, giữ file ảnh (D-42). */
    async remove(id) {
      if (!(await productRepository.softDelete(id))) throw NOT_FOUND();
      return { id };
    },
  };
}
