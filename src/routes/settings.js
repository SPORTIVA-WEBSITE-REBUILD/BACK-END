import { Router } from 'express';
import * as ctrl from '../controllers/settingsController.js';
import validate from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { settingsSchema, navigationSchema } from '../validators/schemas.js';

const router = Router();

// These routes are mounted at the API root alongside the resource routers, so
// auth is attached per route rather than with router.use(). A blanket use()
// here would also match every unrecognised /api path and answer 401, telling a
// caller that a route needs authentication when in fact it does not exist.
router.get('/settings', requireAuth, requirePermission('settings:read'), ctrl.getSettings);
router.patch('/settings', requireAuth, requirePermission('settings:update'), validate(settingsSchema), ctrl.updateSettings);

router.get('/navigation/:location', requireAuth, requirePermission('navigation:read'), ctrl.getNavigation);
router.put('/navigation/:location', requireAuth, requirePermission('navigation:update'), validate(navigationSchema), ctrl.putNavigation);

router.get('/stats', requireAuth, ctrl.stats);

export default router;
