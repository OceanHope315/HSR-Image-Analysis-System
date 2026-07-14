import { Router } from 'express';
import { detectImage, integrationStatus } from '../controllers/detectionController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { requireDatabase } from '../middleware/databaseMiddleware.js';
import { cleanupRejectedUpload, uploadXray, validateUploadedImage } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { smartDetectionSchema } from '../validators/detectionValidator.js';

const router = Router();

router.get('/status', asyncHandler(integrationStatus));
router.post(
  '/image',
  requireDatabase,
  authenticate,
  authorize('admin', 'inspector'),
  uploadXray,
  cleanupRejectedUpload,
  validateUploadedImage,
  validate(smartDetectionSchema),
  asyncHandler(detectImage),
);

export default router;
