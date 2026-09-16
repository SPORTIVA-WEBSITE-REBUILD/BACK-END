import ApiError from '../lib/ApiError.js';

/**
 * Zod strips unknown keys, so a client cannot mass-assign fields such as `role`
 * or `status` simply by adding them to the request body.
 */
export default function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(ApiError.badRequest('Please correct the highlighted fields', details));
    }
    if (source === 'query') {
      req.validatedQuery = result.data;
    } else {
      req[source] = result.data;
    }
    return next();
  };
}
