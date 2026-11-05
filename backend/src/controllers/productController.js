import { ok } from '../utils/response.js';
import {
  createProductBodySchema,
  listProductsQuerySchema,
  updateProductBodySchema,
} from '../validation/productSchemas.js';

/** @param {ReturnType<import('../services/productService.js').createProductService>} productService */
export function createProductController(productService) {
  return {
    list: async (req, res) =>
      ok(res, await productService.list(listProductsQuerySchema.parse(req.query))),
    get: async (req, res) => ok(res, { product: await productService.get(req.params.id) }),
    create: async (req, res) => {
      const body = createProductBodySchema.parse(req.body ?? {});
      return ok(res, { product: await productService.create(body, req.file?.buffer) }, 201);
    },
    update: async (req, res) => {
      const body = updateProductBodySchema.parse(req.body ?? {});
      return ok(res, {
        product: await productService.update(req.params.id, body, req.file?.buffer),
      });
    },
    remove: async (req, res) => ok(res, await productService.remove(req.params.id)),
  };
}
