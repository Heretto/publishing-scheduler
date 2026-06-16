import { Router } from 'express';
import { SchedulerService } from '../services/scheduler.service';
import { JobExecutorService } from '../services/job-executor.service';
import { createSchedulesController } from '../controllers/schedules.controller';
import { asyncHandler } from '../middleware/async-handler';

export function createSchedulesRouter(schedulerService: SchedulerService, executor: JobExecutorService): Router {
  const router = Router();
  const ctrl = createSchedulesController(schedulerService, executor);

  router.get('/', ctrl.listSchedules);
  router.get('/:id', ctrl.getSchedule);
  router.post('/', ctrl.createSchedule);
  router.put('/:id', ctrl.updateSchedule);
  router.delete('/:id', ctrl.deleteSchedule);
  router.patch('/:id/toggle', ctrl.toggleSchedule);
  router.post('/:id/trigger', asyncHandler(ctrl.triggerSchedule));

  return router;
}
