import { Router } from 'express';
import {
  getAlarm,
  listAlarms,
  patchAlarmAssignment,
  patchAlarmStatus,
  reopenAlarmRecord,
} from '../controllers/alarmController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { alarmIdSchema, assignAlarmSchema, listAlarmsSchema, updateAlarmStatusSchema } from '../validators/alarmValidator.js';

const router = Router();
router.use(authenticate);
router.get('/', validate(listAlarmsSchema), asyncHandler(listAlarms));
router.get('/:id', validate(alarmIdSchema), asyncHandler(getAlarm));
router.patch('/:id/status', authorize('admin', 'inspector'), validate(updateAlarmStatusSchema), asyncHandler(patchAlarmStatus));
router.patch('/:id/assign', authorize('admin', 'inspector'), validate(assignAlarmSchema), asyncHandler(patchAlarmAssignment));
router.patch('/:id/reopen', authorize('admin'), validate(alarmIdSchema), asyncHandler(reopenAlarmRecord));

export default router;
