import { Router } from 'express';
import { SchedulerService } from '../services/scheduler.service';
import { JobExecutorService } from '../services/job-executor.service';
import { createSchedulesController } from '../controllers/schedules.controller';
import { asyncHandler } from '../middleware/async-handler';
import { mutationLimiter, jobTriggerLimiter } from '../middleware/rate-limit';

export function createSchedulesRouter(schedulerService: SchedulerService, executor: JobExecutorService): Router {
  const router = Router();
  const ctrl = createSchedulesController(schedulerService, executor);

  router.get('/', ctrl.listSchedules);
  router.get('/:id', ctrl.getSchedule);
  router.post('/', mutationLimiter, ctrl.createSchedule);
  router.put('/:id', mutationLimiter, ctrl.updateSchedule);
  router.delete('/:id', mutationLimiter, ctrl.deleteSchedule);
  router.patch('/:id/toggle', mutationLimiter, ctrl.toggleSchedule);
  router.post('/:id/trigger', jobTriggerLimiter, asyncHandler(ctrl.triggerSchedule));

  return router;
}
