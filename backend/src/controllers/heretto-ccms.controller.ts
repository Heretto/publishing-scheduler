import { Request, Response } from 'express';
import { IHerettoCcmsClient } from '../heretto/heretto-ccms-client.interface';

export function createHerettoCcmsController(client: IHerettoCcmsClient) {
  return {
    async getFolderContents(req: Request, res: Response) {
      const folder = await client.getFolderContents(req.params.id);
      res.json(folder);
    },

    async getDocumentInfo(req: Request, res: Response) {
      const doc = await client.getDocumentInfo(req.params.id);
      res.json(doc);
    },

    async listBranches(_req: Request, res: Response) {
      const branches = await client.getBranches();
      res.json(branches);
    },

    async searchDocuments(req: Request, res: Response) {
      const results = await client.searchDocuments(req.body);
      res.json(results);
    },

    async searchFolders(req: Request, res: Response) {
      const name = req.query.name as string;
      if (!name) {
        res.status(400).json({ error: 'name query parameter is required' });
        return;
      }
      const results = await client.searchFolders(name);
      res.json(results);
    },
  };
}
