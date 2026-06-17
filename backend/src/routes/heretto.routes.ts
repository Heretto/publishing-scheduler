import { Router } from 'express';
import { IHerettoClient } from '../heretto/heretto-client.interface';
import { IHerettoCcmsClient } from '../heretto/heretto-ccms-client.interface';
import { createHerettoController } from '../controllers/heretto.controller';
import { createHerettoCcmsController } from '../controllers/heretto-ccms.controller';
import { asyncHandler } from '../middleware/async-handler';

export function createHerettoRouter(
  client: IHerettoClient,
  ccmsClient?: IHerettoCcmsClient,
): Router {
  const router = Router();
  const ctrl = createHerettoController(client);

  router.get('/deployments', asyncHandler(ctrl.listDeployments));
  router.get('/scenarios', asyncHandler(ctrl.listScenarios));
  router.get('/releases', asyncHandler(ctrl.listReleases));

  if (ccmsClient) {
    const ccmsCtrl = createHerettoCcmsController(ccmsClient);

    router.get('/ccms/branches', asyncHandler(ccmsCtrl.listBranches));
    router.get('/ccms/folders/search', asyncHandler(ccmsCtrl.searchFolders));
    router.get('/ccms/folders/:id', asyncHandler(ccmsCtrl.getFolderContents));
    router.get('/ccms/documents/:id', asyncHandler(ccmsCtrl.getDocumentInfo));
    router.post('/ccms/search', asyncHandler(ccmsCtrl.searchDocuments));
  }

  return router;
}
