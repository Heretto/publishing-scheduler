import { Router } from 'express';
import * as ctrl from '../controllers/jobs.controller';

const router = Router();

router.get('/', ctrl.listJobs);
router.get('/:id', ctrl.getJob);

export default router;
