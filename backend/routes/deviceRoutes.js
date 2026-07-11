import { Router } from 'express';
import {
  createDevice,
  deleteDevice,
  getDevice,
  heartbeatDevice,
  listDevices,
  patchDevice,
} from '../controllers/deviceController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createDeviceSchema, deviceIdSchema, listDevicesSchema, updateDeviceSchema } from '../validators/deviceValidator.js';

const router = Router();
router.use(authenticate);
router.get('/', validate(listDevicesSchema), asyncHandler(listDevices));
router.post('/', authorize('admin'), validate(createDeviceSchema), asyncHandler(createDevice));
router.get('/:id', validate(deviceIdSchema), asyncHandler(getDevice));
router.patch('/:id', authorize('admin'), validate(updateDeviceSchema), asyncHandler(patchDevice));
router.delete('/:id', authorize('admin'), validate(deviceIdSchema), asyncHandler(deleteDevice));
router.post('/:id/heartbeat', authorize('admin', 'inspector'), validate(deviceIdSchema), asyncHandler(heartbeatDevice));

export default router;
