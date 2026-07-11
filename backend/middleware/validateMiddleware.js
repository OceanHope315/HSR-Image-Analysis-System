import { AppError } from '../utils/AppError.js';

function formatIssues(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

export function validate(schemas) {
  return async (req, _res, next) => {
    try {
      const validated = {};
      for (const location of ['params', 'query', 'body']) {
        if (schemas[location]) validated[location] = await schemas[location].parseAsync(req[location]);
      }
      req.validated = validated;
      next();
    } catch (error) {
      next(new AppError(400, 'VALIDATION_ERROR', '请求参数不合法', formatIssues(error)));
    }
  };
}
