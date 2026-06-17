import axios, { AxiosInstance } from 'axios';
import { HerettoClientConfig, IHerettoClient, HerettoDeployment, HerettoScenario, HerettoRelease, HerettoPublishingJob, ScenarioParameter } from './heretto-client.interface';
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

  async getScenarioParameters(scenarioId: string): Promise<ScenarioParameter[]> {
    const response = await this.client.get(`/publishes/scenarios/${scenarioId}/parameters`);
    const data = response.data;
    return Array.isArray(data) ? data : data.content || [];
  }

  async triggerPublishingJob(params: {
    scenarioId: string;
    deploymentId: string;
    documentIds?: string[];
    parameters?: Record<string, unknown>[];
  }): Promise<HerettoPublishingJob[]> {
    const documentIds = params.documentIds || [];
    if (documentIds.length === 0) {
      throw new Error('At least one document ID is required to trigger a publish');
    }

    // The Heretto API triggers a publish per file:
    // POST /files/{fileId}/publishes with { scenario, description, parameters }
    const results: HerettoPublishingJob[] = [];
    for (const fileId of documentIds) {
      const response = await this.client.post(`/files/${fileId}/publishes`, {
        scenario: Number(params.scenarioId),
        description: '',
        parameters: params.parameters || [],
      });
      results.push({
        ...response.data,
        id: String(response.data.id || response.data.jobId || ''),
        status: String(response.data.status || 'submitted'),
        fileId,
      });
    }
    return results;
  }
}
