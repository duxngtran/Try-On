/**
 * Interface của nhà cung cấp try-on (design/tryon-provider.md mục 1). Mọi lệnh gọi dịch vụ nằm sau interface này
 * để đổi model không ảnh hưởng luồng khác (D-91).
 *
 * @typedef {object} TryOnProvider
 * @property {'fashn' | 'fake'} name
 * @property {string} modelName
 * @property {(input: { modelImage: Buffer, garmentImageUrl: string }) => Promise<{ providerJobId: string }>} submit
 *   Chỉ nhận ảnh người (JPEG, trong bộ nhớ) và URL công khai của ảnh sản phẩm: không có số đo, email, userId (D-82).
 *   Ném {@link TryOnProviderError}.
 * @property {(providerJobId: string) => Promise<
 *   | { state: 'pending' }
 *   | { state: 'succeeded', image: Buffer, creditsUsed?: number | null }
 *   | { state: 'failed', error: TryOnProviderError }
 * >} getStatus Ném {@link TryOnProviderError} khi chính lệnh đọc trạng thái lỗi (worker bỏ qua, poll lại).
 */

/** Phân loại lỗi, quyết định worker có thử lại, ghi nhớ theo khóa hay tạm dừng nhận job. */
export const PROVIDER_ERROR_KINDS = Object.freeze([
  'transient',
  'blocked',
  'photo_unusable',
  'input',
  'config',
]);

export class TryOnProviderError extends Error {
  /**
   * @param {{
   *   kind: 'transient' | 'blocked' | 'photo_unusable' | 'input' | 'config',
   *   providerCode: string,
   *   costMaybeIncurred?: boolean,
   * }} options `providerCode` chỉ là tên lỗi. Không bao giờ nhét message của nhà cung cấp vào đây:
   *   nó có thể lặp lại nội dung đầu vào và sẽ đi vào log (AC-20).
   */
  constructor({ kind, providerCode, costMaybeIncurred = false }) {
    if (!PROVIDER_ERROR_KINDS.includes(kind)) throw new Error(`kind không hợp lệ: ${kind}`);
    super(`Lỗi nhà cung cấp try-on: ${providerCode}`);
    this.name = 'TryOnProviderError';
    this.kind = kind;
    this.providerCode = providerCode;
    this.costMaybeIncurred = costMaybeIncurred;
  }
}
