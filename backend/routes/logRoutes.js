import { Router } from 'express';
import { listLogs } from '../controllers/logController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listLogsSchema } from '../validators/logValidator.js';

const router = Router();
router.use(authenticate, authorize('admin'));
router.get('/', validate(listLogsSchema), asyncHandler(listLogs));

export default router;
