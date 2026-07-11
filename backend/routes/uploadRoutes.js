import { Router } from 'express';
import { uploadXrayImage } from '../controllers/uploadController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { uploadXray, validateUploadedImage } from '../middleware/uploadMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.post('/xray', authenticate, authorize('admin', 'inspector'), uploadXray, validateUploadedImage, asyncHandler(uploadXrayImage));

export default router;
