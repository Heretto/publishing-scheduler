import { Request, Response } from 'express';
import * as JobModel from '../models/job.model';

export function listJobs(req: Request, res: Response) {
  const rawPage = parseInt(req.query.page as string, 10);
  const rawLimit = parseInt(req.query.limit as string, 10);
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20));
  const schedule_id = req.query.schedule_id as string | undefined;
  const status = req.query.status as string | undefined;

  const result = JobModel.getJobs({ page, limit, schedule_id, status });
  res.json(result);
}

export function getJob(req: Request, res: Response) {
  const job = JobModel.getJobById(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
}
