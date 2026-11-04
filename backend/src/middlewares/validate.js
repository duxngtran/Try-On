/** Validate `req.body` bằng zod; thay bằng bản đã chuẩn hóa và bỏ trường thừa. Lỗi -> ZodError -> 400. */
export const validateBody = (schema) => (req, res, next) => {
  req.body = schema.parse(req.body ?? {});
  next();
};
