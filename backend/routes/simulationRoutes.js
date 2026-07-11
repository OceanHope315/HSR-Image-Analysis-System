import { Router } from 'express';
import { batchSimulation, generateSimulation, simulationHeartbeat } from '../controllers/simulationController.js';
import { env } from '../config/env.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { batchSimulationSchema, generateSimulationSchema, simulationHeartbeatSchema } from '../validators/simulationValidator.js';

const router = Router();
router.use(authenticate, authorize('admin', 'inspector'));
router.use((_req, _res, next) => next(env.simulationEnabled ? undefined : new AppError(403, 'SIMULATION_DISABLED', '模拟接口已禁用')));
router.post('/generate', validate(generateSimulationSchema), asyncHandler(generateSimulation));
router.post('/batch', validate(batchSimulationSchema), asyncHandler(batchSimulation));
router.post('/device-heartbeat', validate(simulationHeartbeatSchema), asyncHandler(simulationHeartbeat));

export default router;
