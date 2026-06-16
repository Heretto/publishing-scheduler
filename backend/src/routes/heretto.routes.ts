import { Router } from 'express';
import { IHerettoClient } from '../heretto/heretto-client.interface';
import { createHerettoController } from '../controllers/heretto.controller';
import { asyncHandler } from '../middleware/async-handler';

export function createHerettoRouter(client: IHerettoClient): Router {
  const router = Router();
  const ctrl = createHerettoController(client);

  router.get('/deployments', asyncHandler(ctrl.listDeployments));
  router.get('/scenarios', asyncHandler(ctrl.listScenarios));
  router.get('/releases', asyncHandler(ctrl.listReleases));

  return router;
}
