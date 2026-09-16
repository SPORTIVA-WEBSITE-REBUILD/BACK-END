import { Router } from 'express';
import * as ctrl from '../controllers/mediaController.js';
import validate from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { mediaCreateSchema, mediaUpdateSchema } from '../validators/schemas.js';

const router = Router();
router.use(requireAuth);

router.post('/sign', uploadLimiter, requirePermission('media:create'), ctrl.sign);
router.post('/', requirePermission('media:create'), validate(mediaCreateSchema), ctrl.persist);
router.get('/', requirePermission('media:read'), ctrl.list);
router.patch('/:id', requirePermission('media:update'), validate(mediaUpdateSchema), ctrl.update);
router.delete('/:id', requirePermission('media:delete'), ctrl.remove);

export default router;
