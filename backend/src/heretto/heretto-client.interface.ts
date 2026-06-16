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
  [key: string]: unknown;
}

export interface IHerettoClient {
  getDeployments(): Promise<HerettoDeployment[]>;
  getScenarios(): Promise<HerettoScenario[]>;
  getReleases(): Promise<HerettoRelease[]>;
  triggerPublishingJob(params: {
    scenarioId: string;
    deploymentId: string;
    documentIds?: string[];
  }): Promise<HerettoPublishingJob>;
}
