import { IHerettoClient } from '../heretto/heretto-client.interface';
import { HerettoClient } from '../heretto/heretto-client';
import * as JobModel from '../models/job.model';
import * as ScheduleModel from '../models/schedule.model';
import { logger } from '../logger';
import { retryWithBackoff } from '../utils/retry';

export class JobExecutorService {
  private herettoClient: IHerettoClient;
  private runningJobs: Set<string> = new Set(); // Track running jobs by schedule ID

  constructor(herettoClient?: IHerettoClient) {
    this.herettoClient = herettoClient || new HerettoClient();
  }

  isJobRunning(scheduleId: string): boolean {
    return this.runningJobs.has(scheduleId);
  }

  getRunningJobsCount(): number {
    return this.runningJobs.size;
  }

  async executeJob(scheduleId: string, triggerType: 'scheduled' | 'manual' = 'scheduled') {
    // Check if job is already running for this schedule
    if (this.runningJobs.has(scheduleId)) {
      const message = `Job for schedule ${scheduleId} is already running`;
      logger.warn('Prevented concurrent job execution', { scheduleId, triggerType });
      throw new Error(message);
    }

    const schedule = ScheduleModel.getScheduleById(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    // Mark job as running
    this.runningJobs.add(scheduleId);

    const publishParameters = schedule.publish_parameters || [];
    const requestPayload = {
      scenarioId: schedule.scenario_id,
      deploymentId: schedule.deployment_id,
      documentIds: schedule.document_ids,
      parameters: publishParameters,
    };

    const job = JobModel.createJob({
      schedule_id: scheduleId,
      trigger_type: triggerType,
      request_payload: requestPayload,
    });

    try {
      // Execute with retry logic for transient failures
      const results = await retryWithBackoff(async () => {
        return await this.herettoClient.triggerPublishingJob({
          scenarioId: schedule.scenario_id,
          deploymentId: schedule.deployment_id,
          documentIds: schedule.document_ids,
          parameters: publishParameters,
        });
      });

      JobModel.updateJob(job.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        heretto_job_id: results.map(r => r.id).join(','),
        response_payload: results as unknown as Record<string, unknown>,
      });

      ScheduleModel.updateScheduleLastRun(scheduleId, 'success');
      logger.info('Job completed', { jobId: job.id, scheduleId, triggerType });
      return JobModel.getJobById(job.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      JobModel.updateJob(job.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: errorMessage,
      });

      ScheduleModel.updateScheduleLastRun(scheduleId, 'failed');
      logger.error('Job failed', { jobId: job.id, scheduleId, triggerType, error: errorMessage });
      return JobModel.getJobById(job.id);
    } finally {
      // Always remove from running jobs, even if there was an error
      this.runningJobs.delete(scheduleId);
    }
  }
}
