import { Router } from 'express';
import { createUser, deactivateUser, getUser, listUsers, patchUser } from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createUserSchema, listUsersSchema, updateUserSchema, userIdSchema } from '../validators/userValidator.js';

const router = Router();
router.use(authenticate, authorize('admin'));
router.get('/', validate(listUsersSchema), asyncHandler(listUsers));
router.post('/', validate(createUserSchema), asyncHandler(createUser));
router.get('/:id', validate(userIdSchema), asyncHandler(getUser));
router.patch('/:id', validate(updateUserSchema), asyncHandler(patchUser));
router.delete('/:id', validate(userIdSchema), asyncHandler(deactivateUser));

export default router;
