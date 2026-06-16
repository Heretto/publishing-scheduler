import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createSchedulesRouter } from './routes/schedules.routes';
import jobsRouter from './routes/jobs.routes';
import { createHerettoRouter } from './routes/heretto.routes';
import { errorHandler } from './middleware/error-handler';
import { SchedulerService } from './services/scheduler.service';
import { JobExecutorService } from './services/job-executor.service';
import { IHerettoClient } from './heretto/heretto-client.interface';
import { HerettoClient } from './heretto/heretto-client';
import { getDatabase } from './db/database';

export interface AppDependencies {
  schedulerService?: SchedulerService;
  herettoClient?: IHerettoClient;
}

export function createApp(deps: AppDependencies = {}) {
  const app = express();
  const herettoClient = deps.herettoClient || new HerettoClient();
  const executor = new JobExecutorService(herettoClient);
  const schedulerService = deps.schedulerService || new SchedulerService(executor);

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  app.get('/api/health', (_req, res) => {
    let dbOk = false;
    try {
      const db = getDatabase();
      db.prepare('SELECT 1').get();
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const status = dbOk ? 'ok' : 'degraded';
    const code = dbOk ? 200 : 503;

    res.status(code).json({
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? 'ok' : 'error',
        scheduler: { activeJobs: schedulerService.getActiveCount() },
      },
    });
  });

  app.use('/api/schedules', createSchedulesRouter(schedulerService, executor));
  app.use('/api/jobs', jobsRouter);
  app.use('/api/heretto', createHerettoRouter(herettoClient));

  app.use(errorHandler);

  return app;
}
