import { Router } from 'express';
import crudFactory from '../controllers/crudFactory.js';
import validate from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { listQuery } from '../validators/common.js';
import { statusUpdateSchema } from '../validators/schemas.js';

/**
 * Builds the standard admin CRUD surface for one resource. Every resource gets
 * the same verbs, the same pagination and the same permission checks, so the
 * security posture cannot drift between them.
 */
export default function resourceRouter({
  name,
  schema,
  updateSchema = null,
  supportsStatus = true,
  ...factoryOptions
}) {
  const ctrl = crudFactory(factoryOptions);
  const router = Router();

  router.use(requireAuth);

  router.get('/', requirePermission(`${name}:read`), validate(listQuery, 'query'), ctrl.list);
  router.post('/', requirePermission(`${name}:create`), validate(schema), ctrl.create);
  router.get('/:id', requirePermission(`${name}:read`), ctrl.read);
  router.patch('/:id', requirePermission(`${name}:update`), validate(updateSchema || schema.partial()), ctrl.update);
  router.delete('/:id', requirePermission(`${name}:delete`), ctrl.remove);

  if (supportsStatus) {
    router.patch(
      '/:id/status',
      requirePermission(`${name}:update`),
      validate(statusUpdateSchema),
      ctrl.setStatus,
    );
  }

  return router;
}
