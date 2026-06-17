export interface HerettoClientConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export interface HerettoDeployment {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface HerettoScenario {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface HerettoRelease {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface HerettoPublishingJob {
  id: string;
  status: string;
  fileId: string;
  [key: string]: unknown;
}

export interface ScenarioParameter {
  name: string;
  displayName: string;
  type: string;
  value: unknown;
  options: unknown[];
  [key: string]: unknown;
}

export interface IHerettoClient {
  getDeployments(): Promise<HerettoDeployment[]>;
  getScenarios(): Promise<HerettoScenario[]>;
  getReleases(): Promise<HerettoRelease[]>;
  getScenarioParameters(scenarioId: string): Promise<ScenarioParameter[]>;
  triggerPublishingJob(params: {
    scenarioId: string;
    deploymentId: string;
    documentIds?: string[];
    parameters?: Record<string, unknown>[];
  }): Promise<HerettoPublishingJob[]>;
}
