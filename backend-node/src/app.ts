import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createSchedulesRouter } from './routes/schedules.routes';
import jobsRouter from './routes/jobs.routes';
import { createHerettoRouter } from './routes/heretto.routes';
import { errorHandler } from './middleware/error-handler';
import { generalLimiter } from './middleware/rate-limit';
import { metricsMiddleware } from './middleware/metrics';
import { register } from './metrics';
import { SchedulerService } from './services/scheduler.service';
import { JobExecutorService } from './services/job-executor.service';
import { IHerettoClient } from './heretto/heretto-client.interface';
import { HerettoClient } from './heretto/heretto-client';
import { IHerettoCcmsClient } from './heretto/heretto-ccms-client.interface';
import { HerettoCcmsClient } from './heretto/heretto-ccms-client';
import { getDatabase } from './db/database';
import { config } from './config';

export interface AppDependencies {
  schedulerService?: SchedulerService;
  herettoClient?: IHerettoClient;
  ccmsClient?: IHerettoCcmsClient;
}

export function createApp(deps: AppDependencies = {}) {
  const app = express();
  const herettoClient = deps.herettoClient || new HerettoClient();
  const ccmsClient = deps.ccmsClient || new HerettoCcmsClient();
  const executor = new JobExecutorService(herettoClient);
  const schedulerService = deps.schedulerService || new SchedulerService(executor);

  app.use(helmet());

  // Configure CORS with allowed origins
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        return callback(null, true);
      }

      if (config.cors.allowedOrigins.length === 0) {
        // No origins configured - reject all cross-origin requests
        return callback(new Error('CORS not configured'));
      }

      if (config.cors.allowedOrigins.includes(origin) || config.cors.allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));

  // Track metrics for all requests
  app.use(metricsMiddleware);

  // Apply rate limiting to all API routes
  app.use('/api', generalLimiter);

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

  // Prometheus metrics endpoint
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      res.status(500).end();
    }
  });

  app.use('/api/schedules', createSchedulesRouter(schedulerService, executor));
  app.use('/api/jobs', jobsRouter);
  app.use('/api/heretto', createHerettoRouter(herettoClient, ccmsClient));

  app.use(errorHandler);

  return app;
}
