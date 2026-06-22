import { Request, Response } from 'express';
import * as ScheduleModel from '../models/schedule.model';
import { createScheduleSchema, updateScheduleSchema } from '../models/schedule.model';
import { SchedulerService } from '../services/scheduler.service';
import { JobExecutorService } from '../services/job-executor.service';
import { z } from 'zod';

const toggleSchema = z.object({
  enabled: z.boolean(),
});

export function createSchedulesController(schedulerService: SchedulerService, executor: JobExecutorService) {
  return {
    listSchedules(_req: Request, res: Response) {
      const schedules = ScheduleModel.getAllSchedules();
      res.json(schedules);
    },

    getSchedule(req: Request, res: Response) {
      const schedule = ScheduleModel.getScheduleById(req.params.id);
      if (!schedule) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }
      res.json(schedule);
    },

    createSchedule(req: Request, res: Response) {
      const input = createScheduleSchema.parse(req.body);
      const schedule = ScheduleModel.createSchedule(input);

      if (schedule.enabled) {
        schedulerService.startSchedule(schedule.id, schedule.cron_expression);
      }

      res.status(201).json(schedule);
    },

    updateSchedule(req: Request, res: Response) {
      const input = updateScheduleSchema.parse(req.body);
      const schedule = ScheduleModel.updateSchedule(req.params.id, input);
      if (!schedule) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }

      if (schedule.enabled) {
        schedulerService.startSchedule(schedule.id, schedule.cron_expression);
      } else {
        schedulerService.stopSchedule(schedule.id);
      }

      res.json(schedule);
    },

    deleteSchedule(req: Request, res: Response) {
      const id = req.params.id;
      schedulerService.stopSchedule(id);

      const deleted = ScheduleModel.deleteSchedule(id);
      if (!deleted) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }
      res.status(204).send();
    },

    toggleSchedule(req: Request, res: Response) {
      const { enabled } = toggleSchema.parse(req.body);

      const schedule = ScheduleModel.toggleSchedule(req.params.id, enabled);
      if (!schedule) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }

      if (enabled) {
        schedulerService.startSchedule(schedule.id, schedule.cron_expression);
      } else {
        schedulerService.stopSchedule(schedule.id);
      }

      res.json(schedule);
    },

    async triggerSchedule(req: Request, res: Response) {
      const schedule = ScheduleModel.getScheduleById(req.params.id);
      if (!schedule) {
        res.status(404).json({ error: 'Schedule not found' });
        return;
      }

      const job = await executor.executeJob(req.params.id, 'manual');
      res.status(201).json(job);
    },
  };
}
