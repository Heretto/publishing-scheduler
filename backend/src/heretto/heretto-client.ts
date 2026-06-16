import axios, { AxiosInstance } from 'axios';
import { HerettoClientConfig, IHerettoClient, HerettoDeployment, HerettoScenario, HerettoRelease, HerettoPublishingJob } from './heretto-client.interface';
import { config } from '../config';

export class HerettoClient implements IHerettoClient {
  private client: AxiosInstance;

  constructor(clientConfig?: HerettoClientConfig) {
    const cfg = clientConfig || config.heretto;
    this.client = axios.create({
      baseURL: cfg.baseUrl,
      auth: {
        username: cfg.username,
        password: cfg.password,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async getDeployments(): Promise<HerettoDeployment[]> {
    const response = await this.client.get('/deployments');
    const data = response.data;
    // Response is paginated: { content: [...], totalElements, ... }
    const items = Array.isArray(data) ? data : data.content || [];
    // Normalize deploymentIdentifier -> id
    return items.map((d: Record<string, unknown>) => ({
      ...d,
      id: String(d.id || d.deploymentIdentifier || ''),
      name: String(d.name || ''),
    }));
  }

  async getScenarios(): Promise<HerettoScenario[]> {
    const response = await this.client.get('/publishes/scenarios');
    const data = response.data;
    // Response is paginated: { content: [...], totalElements, ... }
    return Array.isArray(data) ? data : data.content || [];
  }

  async getReleases(): Promise<HerettoRelease[]> {
    const response = await this.client.get('/releases');
    return response.data;
  }

  async triggerPublishingJob(params: {
    scenarioId: string;
    deploymentId: string;
    documentIds?: string[];
  }): Promise<HerettoPublishingJob> {
    const response = await this.client.post('/publishing-jobs', {
      scenario_id: params.scenarioId,
      deployment_id: params.deploymentId,
      document_ids: params.documentIds || [],
    });
    return response.data;
  }
}
