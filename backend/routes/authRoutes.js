import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, logout, me } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validateMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loginSchema } from '../validators/authValidator.js';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: '登录尝试过于频繁，请稍后再试', details: [] } },
});

router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(login));
router.get('/me', authenticate, me);
router.post('/logout', authenticate, asyncHandler(logout));

export default router;
