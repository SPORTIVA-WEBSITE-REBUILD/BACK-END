import { Router } from 'express';
import * as ctrl from '../controllers/adminController.js';
import validate from '../middleware/validate.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { createAdminSchema, updateAdminSchema } from '../validators/schemas.js';

const router = Router();

// Administrator management is super-admin only, without exception.
router.use(requireAuth, requireSuperAdmin);

router.get('/', ctrl.list);
router.post('/', validate(createAdminSchema), ctrl.create);
router.patch('/:id', validate(updateAdminSchema), ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
