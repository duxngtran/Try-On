import { ok } from '../utils/response.js';

/** @param {ReturnType<import('../services/categoryService.js').createCategoryService>} categoryService */
export function createCategoryController(categoryService) {
  return {
    list: async (req, res) => ok(res, { categories: await categoryService.list() }),
    create: async (req, res) =>
      ok(res, { category: await categoryService.create(req.body.name) }, 201),
    rename: async (req, res) =>
      ok(res, { category: await categoryService.rename(req.params.id, req.body.name) }),
    remove: async (req, res) => ok(res, await categoryService.remove(req.params.id)),
  };
}
