import { ok } from '../utils/response.js';
import { listProductsQuerySchema } from '../validation/tryonSchemas.js';

/**
 * Mọi handler chỉ dùng `req.user.id` (từ token): API không nhận id người dùng, version hay URL ảnh từ client.
 * @param {ReturnType<import('../services/tryonService.js').createTryonService>} tryonService
 */
export function createTryonController(tryonService) {
  const userId = (req) => req.user.id;
  return {
    state: async (req, res) => ok(res, await tryonService.getState(userId(req))),
    acceptConsent: async (req, res) => ok(res, await tryonService.acceptConsent(userId(req))),
    withdrawConsent: async (req, res) => ok(res, await tryonService.withdrawConsent(userId(req))),
    categories: async (req, res) => ok(res, await tryonService.listCategories()),
    products: async (req, res) =>
      ok(
        res,
        await tryonService.listProducts(
          req.params.categoryId,
          listProductsQuerySchema.parse(req.query),
        ),
      ),
    result: async (req, res) =>
      ok(res, await tryonService.getResult(userId(req), req.params.productId)),
    createJob: async (req, res) => {
      const { httpStatus, body } = await tryonService.createJob(
        userId(req),
        req.params.productId,
        req.body.purpose,
      );
      return ok(res, body, httpStatus);
    },
    job: async (req, res) => ok(res, await tryonService.getJob(userId(req), req.params.jobId)),
  };
}
