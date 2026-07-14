import { Router } from 'express';
import { clearAlarm, gasStatus, ingestGasReading, latestGasReading } from '../controllers/gasController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { requireDatabase } from '../middleware/databaseMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { gasReadingSchema } from '../validators/gasValidator.js';

const router = Router();

router.get('/status', gasStatus);
router.get('/latest', asyncHandler(latestGasReading));
router.post('/readings', requireDatabase, authenticate, authorize('admin', 'inspector'), validate(gasReadingSchema), asyncHandler(ingestGasReading));
router.post('/clear-alarm', requireDatabase, authenticate, authorize('admin', 'inspector'), asyncHandler(clearAlarm));

export default router;
