import { Router } from 'express';
import * as ctrl from '../controllers/authController.js';
import validate from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { loginSchema, updateMeSchema, changePasswordSchema } from '../validators/schemas.js';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', requireAuth, ctrl.logout);
router.get('/me', requireAuth, ctrl.me);
router.patch('/me', requireAuth, validate(updateMeSchema), ctrl.updateMe);
router.patch('/me/password', requireAuth, validate(changePasswordSchema), ctrl.changePassword);

export default router;
