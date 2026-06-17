import { Request, Response } from 'express';
import { IHerettoClient } from '../heretto/heretto-client.interface';

export function createHerettoController(client: IHerettoClient) {
  return {
    async listDeployments(_req: Request, res: Response) {
      const deployments = await client.getDeployments();
      res.json(deployments);
    },

    async listScenarios(_req: Request, res: Response) {
      const scenarios = await client.getScenarios();
      res.json(scenarios);
    },

    async listReleases(_req: Request, res: Response) {
      const releases = await client.getReleases();
      res.json(releases);
    },

    async getScenarioParameters(req: Request, res: Response) {
      const parameters = await client.getScenarioParameters(req.params.id);
      res.json(parameters);
    },
  };
}
