import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { initDatabase, closeDatabase } from '../../src/db/database';
import { SchedulerService } from '../../src/services/scheduler.service';
import { IHerettoClient } from '../../src/heretto/heretto-client.interface';
import { IHerettoCcmsClient } from '../../src/heretto/heretto-ccms-client.interface';

const mockHerettoClient: IHerettoClient = {
  getDeployments: vi.fn().mockResolvedValue([]),
  getScenarios: vi.fn().mockResolvedValue([]),
  getReleases: vi.fn().mockResolvedValue([]),
  triggerPublishingJob: vi.fn().mockResolvedValue({ id: 'j1', status: 'queued' }),
};

const mockCcmsClient: IHerettoCcmsClient = {
  getFolderContents: vi.fn().mockResolvedValue({
    id: 'folder-1',
    title: 'Root Folder',
    type: 'folder',
    children: [
      { id: 'doc-1', title: 'Document 1', type: 'topic' },
      { id: 'doc-2', title: 'Document 2', type: 'map' },
    ],
  }),
  getDocumentInfo: vi.fn().mockResolvedValue({
    id: 'doc-1',
    title: 'Document 1',
    type: 'topic',
    owner: 'user@example.com',
  }),
  getBranches: vi.fn().mockResolvedValue([
    { id: 'branch-1', name: 'main', repository: 'repo-1' },
    { id: 'branch-2', name: 'develop', repository: 'repo-1' },
  ]),
  searchDocuments: vi.fn().mockResolvedValue({
    results: [
      { id: 'search-1', title: 'Found Doc', type: 'topic' },
    ],
    total: 1,
  }),
};

let schedulerService: SchedulerService;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  initDatabase(':memory:');
  schedulerService = new SchedulerService();
  app = createApp({
    schedulerService,
    herettoClient: mockHerettoClient,
    ccmsClient: mockCcmsClient,
  });
});

afterAll(() => {
  schedulerService.stopAll();
  closeDatabase();
});

describe('GET /api/heretto/ccms/branches', () => {
  it('returns branches list', async () => {
    const res = await request(app).get('/api/heretto/ccms/branches');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({ id: 'branch-1', name: 'main', repository: 'repo-1' });
    expect(res.body[1]).toEqual({ id: 'branch-2', name: 'develop', repository: 'repo-1' });
  });

  it('returns 500 when client fails', async () => {
    (mockCcmsClient.getBranches as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Network error'));

    const res = await request(app).get('/api/heretto/ccms/branches');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/heretto/ccms/folders/:id', () => {
  it('returns folder contents', async () => {
    const res = await request(app).get('/api/heretto/ccms/folders/folder-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('folder-1');
    expect(res.body.title).toBe('Root Folder');
    expect(res.body.children).toHaveLength(2);
  });

  it('passes the folder id to client', async () => {
    await request(app).get('/api/heretto/ccms/folders/my-folder-id');
    expect(mockCcmsClient.getFolderContents).toHaveBeenCalledWith('my-folder-id');
  });
});

describe('GET /api/heretto/ccms/documents/:id', () => {
  it('returns document info', async () => {
    const res = await request(app).get('/api/heretto/ccms/documents/doc-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('doc-1');
    expect(res.body.title).toBe('Document 1');
    expect(res.body.type).toBe('topic');
    expect(res.body.owner).toBe('user@example.com');
  });

  it('passes the document id to client', async () => {
    await request(app).get('/api/heretto/ccms/documents/my-doc-id');
    expect(mockCcmsClient.getDocumentInfo).toHaveBeenCalledWith('my-doc-id');
  });
});

describe('POST /api/heretto/ccms/search', () => {
  it('returns search results', async () => {
    const res = await request(app)
      .post('/api/heretto/ccms/search')
      .send({ query: 'test search' });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].id).toBe('search-1');
  });

  it('passes the query body to client', async () => {
    const query = { query: 'specific search', filters: { type: 'map' } };
    await request(app).post('/api/heretto/ccms/search').send(query);
    expect(mockCcmsClient.searchDocuments).toHaveBeenCalledWith(query);
  });
});

describe('existing heretto routes still work', () => {
  it('GET /api/heretto/deployments still works', async () => {
    const res = await request(app).get('/api/heretto/deployments');
    expect(res.status).toBe(200);
  });
});
