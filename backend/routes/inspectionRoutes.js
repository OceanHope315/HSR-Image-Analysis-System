import { Router } from 'express';
import {
  createInspectionRecord,
  deleteInspection,
  getInspection,
  listInspections,
  patchInspection,
  restoreInspection,
} from '../controllers/inspectionController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  createInspectionSchema,
  inspectionIdSchema,
  listInspectionsSchema,
  updateInspectionSchema,
} from '../validators/inspectionValidator.js';

const router = Router();
router.use(authenticate);
router.get('/', validate(listInspectionsSchema), asyncHandler(listInspections));
router.post('/', authorize('admin', 'inspector'), validate(createInspectionSchema), asyncHandler(createInspectionRecord));
router.get('/:id', validate(inspectionIdSchema), asyncHandler(getInspection));
router.patch('/:id', authorize('admin', 'inspector'), validate(updateInspectionSchema), asyncHandler(patchInspection));
router.delete('/:id', authorize('admin'), validate(inspectionIdSchema), asyncHandler(deleteInspection));
router.patch('/:id/restore', authorize('admin'), validate(inspectionIdSchema), asyncHandler(restoreInspection));

export default router;
