import { Router } from 'express';
import { dashboardSummary, deviceStatus, gasStatistics, riskTrend } from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(authenticate);
router.get('/summary', asyncHandler(dashboardSummary));
router.get('/risk-trend', asyncHandler(riskTrend));
router.get('/gas-statistics', asyncHandler(gasStatistics));
router.get('/device-status', asyncHandler(deviceStatus));

export default router;
